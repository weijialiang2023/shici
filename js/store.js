/* 拾词 · 学习数据与间隔复习
 * 复习节奏参考艾宾浩斯遗忘曲线，并结合间隔重复的常用做法：
 * 初次学习后在第 1、2、4、7、15、30、60 天安排再次回忆。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'shici.state.v1';
  const SRSEngine = window.ShiciModules && window.ShiciModules.SRSEngine;
  const StateIntegrity = window.ShiciModules && window.ShiciModules.StateIntegrity;
  const StateSchema = window.ShiciModules && window.ShiciModules.StateSchema;
  const SCHEMA_VERSION = 3;
  const DB_NAME = 'shici-progress';
  const DB_STORE = 'state';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const REVIEW_DAYS = [1, 2, 4, 7, 15, 30, 60, 90];
  const MASTER_STAGE = 5;
  const TARGET_RETENTION = 0.85;
  const GOAL_OPTIONS = [10, 15, 20, 30, 50];
  const MIN_DAILY_GOAL = 1;
  const MAX_DAILY_GOAL = 300;

  let activeWords = [];
  let activeUnits = [];
  let wordMap = new Map();
  let unitMap = new Map();
  let activeBookId = window.DEFAULT_BOOK || 'gaokao';
  let bookIndex = {};

  let storageAvailable = true;
  let state = createDefaultState();
  let remoteMode = 'browser';
  let remoteEnabled = false;
  let remoteSaveTimer = null;
  let remoteRetryTimer = null;
  let remoteSavedAt = null;
  let remoteSaving = false;
  let remoteDirty = false;
  let remoteLastError = null;
  let indexedDbPromise = null;
  let persistentStorage = null;
  let writerId = null;
  let lastSaveOk = null;
  let lastSaveAt = null;
  let lastSaveLayers = [];
  let lastSaveError = null;
  let lastIndexedDbOk = null;
  let externalConflict = false;
  let conflictBackupKey = null;
  let conflictBackupPending = false;

  function createDefaultState() {
    return StateSchema
      ? StateSchema.createDefaultState({ defaultBook: window.DEFAULT_BOOK || 'gaokao' })
      : {
        version: SCHEMA_VERSION,
        profile: {
          name: '', dailyGoal: 20, voiceGender: 'female', voiceRate: 0.9,
          targetRetention: TARGET_RETENTION, createdAt: new Date().toISOString(),
          activeBook: window.DEFAULT_BOOK || 'gaokao'
        },
        words: {}, activity: {}, bookSeeds: {},
        meta: {
          schema: SCHEMA_VERSION, revision: 0, writerId: null, integrity: null,
          sessions: 0, quizSessions: 0, bestSpelling: 0, lastSessionAt: null,
          updatedAt: null, lastServerSavedAt: null, lastBackupAt: null,
          lastBackupName: null, storagePersisted: null, corruptBackupKey: null
        }
      };
  }

  function blankRecord() {
    return StateSchema.blankRecord();
  }

  function normalizeCount(value) {
    return StateSchema.normalizeCount(value);
  }

  function normalizeStringList(value) {
    return StateSchema.normalizeStringList(value);
  }

  function normalizeRetention(value) {
    return StateSchema.normalizeRetention(value);
  }

  function normalizeRecord(record, fallbackBook) {
    return StateSchema.normalizeRecord(record, fallbackBook);
  }

  function normalizeState(raw) {
    return StateSchema.normalizeState(raw, {
      defaultBook: window.DEFAULT_BOOK || 'gaokao',
      knownBookIds: (window.BOOKS || []).map(function (book) { return book.id; })
    });
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      const integrity = StateIntegrity ? StateIntegrity.verify(saved) : { status: 'unsigned' };
      if (integrity.status === 'mismatch') {
        const corruptKey = STORAGE_KEY + '.integrity.' + Date.now();
        try {
          window.localStorage.setItem(corruptKey, raw);
        } catch (copyError) {
          // Keep the original key untouched if a quarantine copy cannot be made.
        }
        state = createDefaultState();
        state.meta.corruptBackupKey = corruptKey;
        state.meta.integrityError = 'checksum-mismatch';
        return;
      }
      const normalized = normalizeState(saved);
      state = normalized.state;
      activeBookId = state.profile.activeBook;
      if (normalized.migrated) {
        state.meta.migration = {
          from: normalized.migratedFrom,
          to: SCHEMA_VERSION,
          warnings: normalized.warnings.slice()
        };
      }
    } catch (error) {
      storageAvailable = false;
      state = createDefaultState();
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const corruptKey = STORAGE_KEY + '.corrupt.' + Date.now();
          window.localStorage.setItem(corruptKey, raw);
          state.meta.corruptBackupKey = corruptKey;
        }
      } catch (copyError) {
        // 浏览器完全禁用存储时，保持当前会话可运行但不覆盖旧数据。
      }
    }
  }

  function openIndexedDb() {
    if (indexedDbPromise) return indexedDbPromise;
    indexedDbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('IndexedDB open failed')); };
    });
    return indexedDbPromise;
  }

  function writeIndexedDbValue(payload, key) {
    if (!window.indexedDB) {
      lastIndexedDbOk = false;
      return Promise.resolve(false);
    }
    return openIndexedDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const transaction = db.transaction(DB_STORE, 'readwrite');
        transaction.oncomplete = function () {
          lastIndexedDbOk = true;
          resolve(true);
        };
        transaction.onerror = function () {
          lastIndexedDbOk = false;
          reject(transaction.error || new Error('IndexedDB write failed'));
        };
        transaction.onabort = function () {
          lastIndexedDbOk = false;
          reject(transaction.error || new Error('IndexedDB write aborted'));
        };
        transaction.objectStore(DB_STORE).put(payload, key || 'current');
      });
    }).catch(function () {
      lastIndexedDbOk = false;
      return false;
    });
  }

  function writeIndexedDb(payload) {
    return writeIndexedDbValue(payload, 'current');
  }

  async function hydrateFromIndexedDb() {
    if (!window.indexedDB) return { restored: false, reason: 'unsupported' };
    try {
      const db = await openIndexedDb();
      const indexedState = await new Promise(function (resolve, reject) {
        const transaction = db.transaction(DB_STORE, 'readonly');
        const request = transaction.objectStore(DB_STORE).get('current');
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error); };
      });
      if (!indexedState || !indexedState.words) return { restored: false, reason: 'empty' };
      const indexedIntegrity = StateIntegrity ? StateIntegrity.verify(indexedState) : { status: 'unsigned' };
      if (indexedIntegrity.status === 'mismatch') {
        return { restored: false, reason: 'integrity-mismatch' };
      }
      if (countSeenWords(state) > 0 && !state.meta.corruptBackupKey) {
        writeIndexedDb(state);
        return { restored: false, reason: 'local-preferred' };
      }
      const localUpdated = Date.parse(state.meta.updatedAt || '') || 0;
      const indexedUpdated = Date.parse((indexedState.meta && indexedState.meta.updatedAt) || '') || 0;
      if (countSeenWords(indexedState) === 0 || (!state.meta.corruptBackupKey && indexedUpdated < localUpdated)) {
        return { restored: false, reason: 'not-newer' };
      }
      const corruptBackupKey = state.meta.corruptBackupKey || null;
      const integrityError = state.meta.integrityError || null;
      const normalized = normalizeState(indexedState);
      state = normalized.state;
      state.meta.corruptBackupKey = state.meta.corruptBackupKey || corruptBackupKey;
      state.meta.integrityError = state.meta.integrityError || integrityError;
      activeBookId = state.profile.activeBook || activeBookId;
      if (StateIntegrity) StateIntegrity.attach(state);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return { restored: true };
    } catch (error) {
      return { restored: false, reason: 'unavailable' };
    }
  }

  async function requestPersistentStorage() {
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') {
      persistentStorage = false;
      return { supported: false, persisted: false };
    }
    try {
      if (typeof navigator.storage.persisted === 'function') {
        persistentStorage = await navigator.storage.persisted();
      }
      if (!persistentStorage) persistentStorage = await navigator.storage.persist();
      state.meta.storagePersisted = Boolean(persistentStorage);
      return { supported: true, persisted: Boolean(persistentStorage) };
    } catch (error) {
      persistentStorage = false;
      return { supported: true, persisted: false };
    }
  }

  function ensureWriterId() {
    if (writerId) return writerId;
    try {
      writerId = window.sessionStorage.getItem('shici.writerId');
    } catch (error) {
      writerId = null;
    }
    if (!writerId) {
      writerId = window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : 'writer-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      try {
        window.sessionStorage.setItem('shici.writerId', writerId);
      } catch (error) {
        // The in-memory identity still prevents duplicate IDs in this page.
      }
    }
    state.meta.writerId = writerId;
    return writerId;
  }

  function emitSaveStatus(ok) {
    document.dispatchEvent(new CustomEvent('shici:saved', {
      detail: {
        mode: remoteMode,
        ok: ok,
        savedAt: lastSaveAt,
        layers: lastSaveLayers.slice(),
        error: lastSaveError,
        remoteSaving: remoteSaving
      }
    }));
  }

  function save() {
    ensureWriterId();
    if (externalConflict) {
      lastSaveOk = false;
      lastSaveAt = new Date().toISOString();
      lastSaveError = 'multi-tab conflict';
      document.dispatchEvent(new CustomEvent('shici:change'));
      emitSaveStatus(false);
      return {
        ok: false,
        conflict: true,
        pendingIndexedDb: false,
        indexedWrite: Promise.resolve(false)
      };
    }
    state.meta.updatedAt = new Date().toISOString();
    state.meta.revision = Math.max(0, Number(state.meta.revision) || 0) + 1;
    if (StateIntegrity) StateIntegrity.attach(state);
    const serialized = JSON.stringify(state);
    const snapshot = JSON.parse(serialized);
    lastSaveAt = state.meta.updatedAt;
    lastSaveLayers = [];
    lastSaveError = null;
    let localOk = false;
    try {
      window.localStorage.setItem(STORAGE_KEY, serialized);
      storageAvailable = true;
      localOk = true;
      lastSaveLayers.push('localStorage');
    } catch (error) {
      storageAvailable = false;
      lastSaveError = error && error.message ? error.message : 'localStorage unavailable';
    }
    const indexedWrite = writeIndexedDb(snapshot).then(function (ok) {
      if (ok) {
        if (lastSaveLayers.indexOf('indexedDB') === -1) lastSaveLayers.push('indexedDB');
        if (!localOk) {
          lastSaveOk = true;
          lastSaveError = null;
          emitSaveStatus(true);
        }
      } else if (!localOk) {
        lastSaveOk = false;
        lastSaveError = lastSaveError || 'indexedDB unavailable';
        emitSaveStatus(false);
      }
      return ok;
    });
    lastSaveOk = localOk ? true : null;
    remoteDirty = true;
    scheduleRemoteSave();
    document.dispatchEvent(new CustomEvent('shici:change'));
    if (localOk) emitSaveStatus(true);
    return { ok: localOk, pendingIndexedDb: !localOk, indexedWrite: indexedWrite };
  }

  function countSeenWords(value) {
    if (!value || !value.words || typeof value.words !== 'object') return 0;
    return Object.keys(value.words).reduce(function (count, id) {
      const record = value.words[id];
      return count + (record && Number(record.seen) > 0 ? 1 : 0);
    }, 0);
  }

  function isLocalServer() {
    return window.location.protocol === 'http:' &&
      (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');
  }

  async function fetchRemoteState() {
    const controller = new AbortController();
    const timer = window.setTimeout(function () { controller.abort(); }, 2500);
    try {
      const response = await fetch('/api/state', { cache: 'no-store', signal: controller.signal });
      if (response.status === 404) return { empty: true, status: 404 };
      if (!response.ok) throw new Error('backup HTTP ' + response.status);
      const data = await response.json();
      return { data: data, empty: false, status: response.status };
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function prepareRemote() {
    if (!isLocalServer()) {
      remoteMode = 'browser';
      remoteEnabled = false;
      return { mode: remoteMode };
    }
    try {
      const result = await fetchRemoteState();
      remoteEnabled = true;
      remoteMode = 'server';
      if (!result.empty && result.data && result.data.words && countSeenWords(result.data) > 0) {
        const remoteIntegrity = StateIntegrity ? StateIntegrity.verify(result.data) : { status: 'unsigned' };
        if (remoteIntegrity.status === 'mismatch') {
          remoteLastError = 'remote checksum mismatch';
          scheduleRemoteSave();
          return { mode: remoteMode, restored: false };
        }
        const remoteSchema = Number(result.data.version) || 0;
        const remoteTrusted = remoteSchema >= 2 && Number(result.data.meta && result.data.meta.schema) >= 2;
        const localSeen = countSeenWords(state);
        const remoteSeen = countSeenWords(result.data);
        const localUpdated = Date.parse(state.meta.updatedAt || '') || 0;
        const remoteUpdated = Date.parse((result.data.meta && result.data.meta.updatedAt) || '') || 0;
        const remoteIsNewer = remoteUpdated > localUpdated && remoteSeen >= localSeen;
        if (remoteTrusted && (localSeen === 0 || remoteIsNewer)) {
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data));
            window.location.reload();
            return { mode: remoteMode, restored: true };
          } catch (error) {
            // 浏览器禁用本地存储时，保持当前会话可用，不做自动恢复。
          }
        }
      }
      scheduleRemoteSave();
      return { mode: remoteMode, restored: false };
    } catch (error) {
      remoteEnabled = false;
      remoteMode = 'browser';
      return { mode: remoteMode, restored: false };
    }
  }

  function scheduleRemoteSave() {
    if (!remoteEnabled || !isLocalServer()) return;
    if (remoteSaveTimer) window.clearTimeout(remoteSaveTimer);
    remoteSaveTimer = window.setTimeout(function () {
      remoteSaveTimer = null;
      pushRemoteNow();
    }, 450);
  }

  async function pushRemoteNow() {
    if (!remoteEnabled || !isLocalServer()) return false;
    if (remoteRetryTimer) {
      window.clearTimeout(remoteRetryTimer);
      remoteRetryTimer = null;
    }
    remoteSaving = true;
    try {
      const savingVersion = state.meta.updatedAt;
      state.meta.lastServerSavedAt = savingVersion;
      const response = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
      if (!response.ok) throw new Error('backup HTTP ' + response.status);
      remoteSavedAt = savingVersion;
      remoteMode = 'server';
      remoteLastError = null;
      remoteDirty = false;
      return true;
    } catch (error) {
      remoteMode = 'degraded';
      remoteLastError = error && error.message ? error.message : 'backup unavailable';
      remoteDirty = true;
      if (!remoteRetryTimer) {
        remoteRetryTimer = window.setTimeout(function () {
          remoteRetryTimer = null;
          if (remoteDirty) pushRemoteNow();
        }, 8000);
      }
      return false;
    } finally {
      remoteSaving = false;
      document.dispatchEvent(new CustomEvent('shici:saved', {
        detail: { mode: remoteMode, savedAt: remoteSavedAt, remoteSaving: remoteSaving }
      }));
    }
  }

  function flushRemoteOnExit() {
    if (!remoteEnabled || !remoteDirty || !isLocalServer()) return;
    const body = new Blob([JSON.stringify(state)], { type: 'application/json' });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/state', body)) return;
    } catch (error) {
      // Fall through to keepalive fetch where supported.
    }
    try {
      fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
        keepalive: true
      });
    } catch (error) {
      // The next visit restores the latest server checkpoint.
    }
  }

  window.addEventListener('pagehide', flushRemoteOnExit);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushRemoteOnExit();
  });
  window.setInterval(function () {
    if (remoteDirty && !remoteSaving) pushRemoteNow();
  }, 30000);

  async function restoreRemoteState() {
    if (!isLocalServer()) return { ok: false, reason: 'not-local' };
    try {
      const result = await fetchRemoteState();
      if (result.empty || !result.data || !result.data.words) return { ok: false, reason: 'empty' };
      if (!countSeenWords(result.data)) return { ok: false, reason: 'empty' };
      const integrity = StateIntegrity ? StateIntegrity.verify(result.data) : { status: 'unsigned' };
      if (integrity.status === 'mismatch') return { ok: false, reason: 'integrity-mismatch' };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data));
      window.location.reload();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: 'unavailable' };
    }
  }

  function handleStorageEvent(event) {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    let incoming;
    try {
      incoming = JSON.parse(event.newValue);
    } catch (error) {
      return;
    }
    const integrity = StateIntegrity ? StateIntegrity.verify(incoming) : { status: 'unsigned' };
    if (integrity.status === 'mismatch') return;
    const currentWriter = ensureWriterId();
    const incomingWriter = incoming.meta && incoming.meta.writerId;
    if (!incomingWriter || incomingWriter === currentWriter) return;

    externalConflict = true;
    lastSaveOk = false;
    lastSaveError = 'multi-tab conflict';
    conflictBackupKey = 'conflict-' + Date.now();
    conflictBackupPending = true;
    const snapshot = {
      detectedAt: new Date().toISOString(),
      local: JSON.parse(JSON.stringify(state)),
      incoming: incoming
    };
    writeIndexedDbValue(snapshot, conflictBackupKey).then(function (ok) {
      conflictBackupPending = false;
      if (!ok) conflictBackupKey = null;
      document.dispatchEvent(new CustomEvent('shici:conflict', {
        detail: {
          backupKey: conflictBackupKey,
          localWriterId: currentWriter,
          incomingWriterId: incomingWriter
        }
      }));
    });
    document.dispatchEvent(new CustomEvent('shici:change'));
  }

  window.addEventListener('storage', handleStorageEvent);

  function exportState() {
    state.meta.lastBackupAt = new Date().toISOString();
    state.meta.lastBackupName = '拾词学习记录-' + todayKey() + '.json';
    save();
    return JSON.stringify(state, null, 2);
  }

  function importState(raw) {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.words || typeof parsed.words !== 'object') {
      throw new Error('备份文件格式不正确');
    }
    if (!parsed.profile || typeof parsed.profile !== 'object') throw new Error('备份缺少用户设置');
    const integrity = StateIntegrity ? StateIntegrity.verify(parsed) : { status: 'unsigned' };
    if (integrity.status === 'mismatch') throw new Error('备份完整性校验失败');
    const normalized = normalizeState(parsed);
    const migrated = normalized.state;
    migrated.meta.revision = Math.max(0, Number(migrated.meta.revision) || 0) + 1;
    if (normalized.migrated) {
      migrated.meta.migration = {
        from: normalized.migratedFrom,
        to: SCHEMA_VERSION,
        warnings: normalized.warnings.slice()
      };
    }
    if (StateIntegrity) StateIntegrity.attach(migrated);
    const previous = window.localStorage.getItem(STORAGE_KEY);
    if (previous) {
      window.localStorage.setItem(STORAGE_KEY + '.pre-import.' + Date.now(), previous);
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    writeIndexedDb(migrated);
    return true;
  }

  function getPersistence() {
    return {
      mode: remoteMode,
      server: remoteEnabled,
      storage: storageAvailable,
      localStorage: storageAvailable,
      indexedDb: lastIndexedDbOk,
      lastSaveOk: lastSaveOk,
      lastSaveAt: lastSaveAt,
      lastSaveLayers: lastSaveLayers.slice(),
      lastSavedAt: state.meta.updatedAt || null,
      revision: Number(state.meta.revision) || 0,
      writerId: state.meta.writerId || null,
      integrity: state.meta.integrity || null,
      integrityError: state.meta.integrityError || null,
      conflict: externalConflict,
      conflictBackupKey: conflictBackupKey,
      conflictBackupPending: conflictBackupPending,
      remoteSavedAt: remoteSavedAt,
      lastServerSavedAt: state.meta.lastServerSavedAt || null,
      error: lastSaveOk === false ? lastSaveError : remoteLastError,
      saveError: lastSaveError,
      remoteError: remoteLastError,
      lastBackupAt: state.meta.lastBackupAt || null,
      storagePersisted: persistentStorage,
      corruptBackupKey: state.meta.corruptBackupKey || null
    };
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function dateKey(date) {
    const value = date instanceof Date ? date : new Date(date);
    return value.getFullYear() + '-' + pad(value.getMonth() + 1) + '-' + pad(value.getDate());
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function keyToDate(key) {
    const parts = String(key).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  }

  function addDays(key, days) {
    const date = keyToDate(key);
    date.setDate(date.getDate() + days);
    return dateKey(date);
  }

  function daysBetween(fromKey, toKey) {
    return Math.round((keyToDate(toKey) - keyToDate(fromKey)) / DAY_MS);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function shuffleCopy(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  function randomSeed() {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const buffer = new Uint32Array(1);
      window.crypto.getRandomValues(buffer);
      return buffer[0] >>> 0;
    }
    return Math.floor(Math.random() * 0xffffffff) >>> 0;
  }

  function seededShuffle(items, seed) {
    let stateValue = (Number(seed) || 1) >>> 0;
    const random = function () {
      stateValue = (stateValue + 0x6d2b79f5) >>> 0;
      let value = stateValue;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  function formatDateCN(key) {
    const date = keyToDate(key);
    return (date.getMonth() + 1) + '月' + date.getDate() + '日';
  }

  function weekdayCN(key) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][keyToDate(key).getDay()];
  }

  function recordFor(id) {
    if (!state.words[id]) state.words[id] = blankRecord();
    return state.words[id];
  }

  function getRecord(id) {
    return state.words[id] || null;
  }

  function hasRecord(id) {
    const record = state.words[id];
    return Boolean(record && record.seen > 0);
  }

  function getStatus(id) {
    const record = state.words[id];
    if (!record || !record.seen) return 'new';
    if (hasVerifiedMastery(record)) return 'mastered';
    return 'learning';
  }

  function isDue(record) {
    return SRSEngine
      ? SRSEngine.isDue(record, todayKey())
      : Boolean(record && record.seen > 0 && record.due && record.due <= todayKey());
  }

  function getDueLabel(record) {
    if (!record || !record.seen) return '—';
    if (!record.due) return '待安排';
    const diff = daysBetween(todayKey(), record.due);
    if (diff < 0) return '已逾期';
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff <= 6) return diff + ' 天后';
    return formatDateCN(record.due);
  }

  function hasVerifiedMastery(record) {
    return SRSEngine
      ? SRSEngine.hasVerifiedMastery(record)
      : Boolean(record &&
        normalizeStringList(record.successDates).length >= 3 &&
        normalizeStringList(record.successTypes).length >= 2 &&
        Number(record.lastObjectiveIntervalDays) >= 7);
  }

  function nextStageFor(rating, currentStage, wasNew) {
    if (SRSEngine) return SRSEngine.nextStageFor(rating, currentStage, wasNew);
    if (rating === 'again') return 0;
    if (rating === 'fuzzy') return wasNew ? 1 : Math.max(1, Number(currentStage) - 1);
    return clamp((wasNew ? 0 : Number(currentStage)) + 1, 0, REVIEW_DAYS.length - 1);
  }

  function nextDueForStage(stage, fromKey) {
    if (SRSEngine) return SRSEngine.nextDueForStage(stage, fromKey || todayKey());
    const days = REVIEW_DAYS[clamp(stage, 0, REVIEW_DAYS.length - 1)];
    return addDays(fromKey || todayKey(), days);
  }

  function reviewLabelForStage(stage) {
    if (SRSEngine) return SRSEngine.reviewLabelForStage(stage);
    const days = Number(stage);
    if (days === 0) return '今天稍后';
    return days === 1 ? '明天' : days + ' 天后';
  }

  function dueForSelfRating(id, rating) {
    const record = state.words[id] || blankRecord();
    const today = todayKey();
    if (SRSEngine) {
      return SRSEngine.dueForSelfRating(record, rating, {
        today: today,
        targetRetention: state.profile.targetRetention
      });
    }
    const wasNew = !record.seen;
    if (wasNew) {
      if (rating === 'again') return { due: today, days: 0, stage: 0, label: '今天稍后' };
      if (rating === 'fuzzy') return { due: addDays(today, 1), days: 1, stage: 1, label: '明天' };
      return { due: addDays(today, 3), days: 3, stage: 2, label: '3 天后' };
    }
    const elapsed = record.lastReviewed ? Math.max(0, daysBetween(record.lastReviewed, today)) : 0;
    const previousInterval = Math.max(1, Number(record.stabilityDays) || elapsed || REVIEW_DAYS[clamp(record.stage || 0, 0, REVIEW_DAYS.length - 1)]);
    if (rating === 'again') return { due: addDays(today, 1), days: 1, stage: 0, label: '明天' };
    if (rating === 'fuzzy') {
      const days = Math.max(1, Math.round(previousInterval * 0.55));
      return { due: addDays(today, days), days: days, stage: Math.max(1, Number(record.stage) - 1), label: reviewLabelForStage(days) };
    }
    const stage = nextStageFor(rating, record.stage, false);
    const base = REVIEW_DAYS[clamp(stage, 0, REVIEW_DAYS.length - 1)];
    const retentionAdjust = ((Number(state.profile.targetRetention) || TARGET_RETENTION) - TARGET_RETENTION) * 1.4;
    const difficultyFactor = 1.12 - (Number(record.difficulty) || 0.35) * 0.3 + retentionAdjust;
    const days = Math.max(base, Math.round(previousInterval * clamp(difficultyFactor, 0.82, 1.56)));
    return { due: addDays(today, days), days: days, stage: stage, label: reviewLabelForStage(days) };
  }

  function ensureActivity(key) {
    const date = key || todayKey();
    if (!state.activity[date]) {
      state.activity[date] = {
        attempts: 0,
        correct: 0,
        seconds: 0,
        objectiveAttempts: 0,
        objectiveCorrect: 0,
        retention24Seen: 0,
        retention24Correct: 0,
        retention7Seen: 0,
        retention7Correct: 0,
        selfRatings: { again: 0, fuzzy: 0, known: 0 },
        questionTypes: {},
        learned: [],
        reviewed: []
      };
    }
    const day = state.activity[date];
    if (!Array.isArray(day.learned)) day.learned = [];
    if (!Array.isArray(day.reviewed)) day.reviewed = [];
    day.attempts = Number(day.attempts) || 0;
    day.correct = Number(day.correct) || 0;
    day.seconds = Number(day.seconds) || 0;
    day.objectiveAttempts = Number(day.objectiveAttempts) || 0;
    day.objectiveCorrect = Number(day.objectiveCorrect) || 0;
    day.retention24Seen = Number(day.retention24Seen) || 0;
    day.retention24Correct = Number(day.retention24Correct) || 0;
    day.retention7Seen = Number(day.retention7Seen) || 0;
    day.retention7Correct = Number(day.retention7Correct) || 0;
    if (!day.selfRatings || typeof day.selfRatings !== 'object') day.selfRatings = { again: 0, fuzzy: 0, known: 0 };
    if (!day.questionTypes || typeof day.questionTypes !== 'object') day.questionTypes = {};
    return day;
  }

  function addDailyWord(day, id, wasNew) {
    if (day.learned.indexOf(id) !== -1) return;
    if (wasNew) {
      day.learned.push(id);
      return;
    }
    if (day.reviewed.indexOf(id) === -1) day.reviewed.push(id);
  }

  function studiedTodayIds() {
    const day = ensureActivity();
    const ids = new Set(day.learned.concat(day.reviewed));
    return ids;
  }

  function loadBook(bookId, payload) {
    if (!payload || !Array.isArray(payload.words) || !Array.isArray(payload.units)) {
      throw new Error('词书数据格式不正确');
    }
    activeBookId = bookId;
    if (!state.bookSeeds || typeof state.bookSeeds !== 'object') state.bookSeeds = {};
    let seed = state.bookSeeds[bookId];
    const isNewSeed = !Number.isFinite(Number(seed));
    if (isNewSeed) {
      seed = randomSeed();
      state.bookSeeds[bookId] = seed;
    }
    const sourceUnits = payload.units.slice();
    const ordered = seededShuffle(payload.words, seed);

    activeWords = ordered;
    activeWords.forEach(function (word) { word.bookId = bookId; });
    if (bookId === 'curated' || bookId === 'wenyan') {
      // 精讲词与文言字词按策划分组组织，保留原始顺序；新词队列优先核心 120，再进入拓展与高频字义。
      activeUnits = sourceUnits;
    } else {
      // 大词书不再按 A–B、C–D 切分。以持久化的随机种子重排整本书，
      // 再切成固定数量的乱序词组，列表、分组和单元筛选都不会回到字母顺序。
      const groupCount = Math.max(1, Math.min(8, sourceUnits.length || 8));
      const groupSize = Math.max(1, Math.ceil(ordered.length / groupCount));
      activeUnits = [];
      for (let index = 0; index < groupCount; index += 1) {
        const source = sourceUnits[index] || sourceUnits[0] || {};
        const start = index * groupSize;
        const group = activeWords.slice(start, start + groupSize);
        activeUnits.push({
          id: index + 1,
          title: '乱序 ' + String(index + 1).padStart(2, '0'),
          en: 'Shuffle Set ' + String(index + 1).padStart(2, '0'),
          caption: group.slice(0, 3).map(function (word) { return word.word; }).join(' · '),
          description: '乱序词组 · 第 ' + (index + 1) + ' 组，共 ' + group.length + ' 个词。',
          icon: source.icon || 'book-open',
          accent: source.accent || '#315A4A',
          tint: source.tint || '#E5EADF',
          count: group.length
        });
      }
      activeWords.forEach(function (word, index) {
        word.unit = Math.min(groupCount, Math.floor(index / groupSize) + 1);
      });
    }
    wordMap = new Map(activeWords.map(function (word) { return [word.id, word]; }));
    unitMap = new Map(activeUnits.map(function (unit) { return [unit.id, unit]; }));
    window.WORDS = activeWords;
    window.UNITS = activeUnits;
    if (isNewSeed) save();
  }

  function activateBook(bookId, payload) {
    loadBook(bookId, payload);
    state.profile.activeBook = bookId;
    save();
  }

  function getBookMeta(bookId) {
    return (window.BOOKS || []).find(function (book) { return book.id === (bookId || activeBookId); }) || null;
  }

  function setBookIndex(index) {
    bookIndex = index && typeof index === 'object' ? index : {};
  }

  function getBookProgress(bookId) {
    let seen = 0;
    let mastered = 0;
    const ids = Array.isArray(bookIndex[bookId]) ? bookIndex[bookId] : null;
    if (ids) {
      ids.forEach(function (id) {
        const record = state.words[id];
        if (!record || !record.seen) return;
        seen += 1;
        if (hasVerifiedMastery(record)) mastered += 1;
      });
    } else {
      Object.keys(state.words).forEach(function (id) {
        const record = state.words[id];
        if (!record || !record.seen) return;
        if (!Array.isArray(record.books) || record.books.indexOf(bookId) === -1) return;
        seen += 1;
        if (hasVerifiedMastery(record)) mastered += 1;
      });
    }
    return { seen: seen, mastered: mastered };
  }

  function allWords() {
    return activeWords.slice();
  }

  function newWords() {
    const fresh = activeWords.filter(function (word) {
      return !hasRecord(word.id);
    });
    if (activeBookId === 'wenyan') {
      const rank = function (word) { return word.category === 'core' ? 0 : 1; };
      fresh.sort(function (a, b) { return rank(a) - rank(b); });
    }
    return fresh;
  }

  function prioritizedNewQueue(limit) {
    const count = limit || state.profile.dailyGoal;
    const fresh = newWords();
    if (activeBookId !== 'wenyan') {
      return shuffleCopy(fresh).slice(0, count).map(function (word) {
        return { id: word.id, kind: 'new' };
      });
    }
    const core = shuffleCopy(fresh.filter(function (word) { return word.category === 'core'; }));
    const extension = shuffleCopy(fresh.filter(function (word) { return word.category === 'extension'; }));
    const highfreq = shuffleCopy(fresh.filter(function (word) { return word.category === 'highfreq'; }));
    return core.concat(extension, highfreq).slice(0, count).map(function (word) {
      return { id: word.id, kind: 'new' };
    });
  }

  function studiedWords() {
    return activeWords.filter(function (word) {
      return hasRecord(word.id);
    });
  }

  function learnedReviewWords() {
    const pool = shuffleCopy(studiedWords());
    return pool.sort(function (a, b) {
      const ra = state.words[a.id] || {};
      const rb = state.words[b.id] || {};
      const weakA = ra.weak ? 1 : 0;
      const weakB = rb.weak ? 1 : 0;
      if (weakA !== weakB) return weakB - weakA;

      const lapseA = (Number(ra.lapseCount) || 0) + (Number(ra.quizWrong) || 0);
      const lapseB = (Number(rb.lapseCount) || 0) + (Number(rb.quizWrong) || 0);
      if (lapseA !== lapseB) return lapseB - lapseA;

      const stageA = Number(ra.stage) || 0;
      const stageB = Number(rb.stage) || 0;
      if (stageA !== stageB) return stageA - stageB;

      const streakA = Number(ra.masteryStreak) || 0;
      const streakB = Number(rb.masteryStreak) || 0;
      if (streakA !== streakB) return streakA - streakB;

      return String(ra.due || '').localeCompare(String(rb.due || ''));
    });
  }

  function favorites() {
    return activeWords.filter(function (word) {
      const record = state.words[word.id];
      return record && record.favorite;
    });
  }

  function dueWords() {
    const today = todayKey();
    return activeWords
      .filter(function (word) {
        const record = state.words[word.id];
        return record && record.seen > 0 && record.due && record.due <= today;
      })
      .sort(function (a, b) {
        const ra = state.words[a.id];
        const rb = state.words[b.id];
        if (Boolean(ra.weak) !== Boolean(rb.weak)) return ra.weak ? -1 : 1;
        return String(ra.due).localeCompare(String(rb.due)) || ra.stage - rb.stage;
      });
  }

  function unitStats(unitId) {
    const words = activeWords.filter(function (word) { return word.unit === unitId; });
    let seen = 0;
    let mastered = 0;
    words.forEach(function (word) {
      const record = state.words[word.id];
      if (record && record.seen) {
        seen += 1;
        if (hasVerifiedMastery(record)) mastered += 1;
      }
    });
    return {
      total: words.length,
      seen: seen,
      mastered: mastered,
      progress: words.length ? Math.round((seen / words.length) * 100) : 0
    };
  }

  function calculateStreak(activity) {
    const active = Object.keys(activity).filter(function (key) {
      const day = activity[key];
      return day && (
        Number(day.attempts) > 0 ||
        Number(day.objectiveAttempts) > 0 ||
        (Array.isArray(day.learned) && day.learned.length > 0) ||
        (Array.isArray(day.reviewed) && day.reviewed.length > 0)
      );
    }).sort();
    if (!active.length) return { current: 0, longest: 0 };

    let run = 1;
    let longest = 1;
    for (let i = 1; i < active.length; i += 1) {
      if (daysBetween(active[i - 1], active[i]) === 1) {
        run += 1;
        longest = Math.max(longest, run);
      } else {
        run = 1;
      }
    }

    const today = todayKey();
    const yesterday = addDays(today, -1);
    let cursor = active.indexOf(today) !== -1 ? today : (active.indexOf(yesterday) !== -1 ? yesterday : null);
    let current = 0;
    while (cursor && active.indexOf(cursor) !== -1) {
      current += 1;
      cursor = addDays(cursor, -1);
    }
    return { current: current, longest: longest };
  }

  function totalStats() {
    let totalSeen = 0;
    let mastered = 0;
    let learning = 0;
    let weak = 0;
    let attempts = 0;
    let correct = 0;
    let seconds = 0;
    let selfRatings = { again: 0, fuzzy: 0, known: 0 };
    let retention24 = { seen: 0, correct: 0 };
    let retention7 = { seen: 0, correct: 0 };
    const errorTypes = {};
    activeWords.forEach(function (word) {
      const record = state.words[word.id];
      if (record && record.seen) {
        totalSeen += 1;
        if (hasVerifiedMastery(record)) mastered += 1;
        else learning += 1;
        if (record.weak) weak += 1;
        attempts += normalizeCount(record.objectiveSeen);
        correct += normalizeCount(record.objectiveCorrect);
        retention24.seen += normalizeCount(record.retention24 && record.retention24.seen);
        retention24.correct += normalizeCount(record.retention24 && record.retention24.correct);
        retention7.seen += normalizeCount(record.retention7 && record.retention7.seen);
        retention7.correct += normalizeCount(record.retention7 && record.retention7.correct);
        ['again', 'fuzzy', 'known'].forEach(function (rating) {
          selfRatings[rating] += normalizeCount(record.selfRatings && record.selfRatings[rating]);
        });
        Object.keys(record.errorTypes || {}).forEach(function (type) {
          errorTypes[type] = (errorTypes[type] || 0) + normalizeCount(record.errorTypes[type]);
        });
      }
    });
    Object.keys(state.activity).forEach(function (key) {
      const day = state.activity[key];
      seconds += Number(day.seconds) || 0;
    });
    const streak = calculateStreak(state.activity);
    return {
      totalSeen: totalSeen,
      mastered: mastered,
      learning: learning,
      weak: weak,
      newRemaining: activeWords.length - totalSeen,
      totalWords: activeWords.length,
      due: dueWords().length,
      favorites: favorites().length,
      attempts: attempts,
      correct: correct,
      accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
      recallAccuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
      selfRatings: selfRatings,
      retention24: retention24,
      retention24Rate: retention24.seen ? Math.round((retention24.correct / retention24.seen) * 100) : null,
      retention7: retention7,
      retention7Rate: retention7.seen ? Math.round((retention7.correct / retention7.seen) * 100) : null,
      errorTypes: errorTypes,
      seconds: seconds,
      minutes: Math.round(seconds / 60),
      currentStreak: streak.current,
      longestStreak: streak.longest,
      bestSpelling: Number(state.meta.bestSpelling) || 0,
      sessions: Number(state.meta.sessions) || 0
    };
  }

  function buildDailyPlan() {
    const goal = state.profile.dailyGoal;
    const day = ensureActivity();
    const studied = new Set(day.learned.concat(day.reviewed));
    const remainingGoal = Math.max(0, goal - studied.size);
    if (!remainingGoal) return [];
    // 到期复习优先，但每 4 张卡穿插一次新词和旧词，避免单一题型连续刷。
    const due = dueWords().filter(function (word) { return !studied.has(word.id); });
    const reviews = due.slice(0, remainingGoal);
    const newLimit = Math.max(0, remainingGoal - reviews.length);
    const fresh = prioritizedNewQueue(newLimit);
    const reviewQueue = shuffleCopy(reviews).map(function (word) {
      return { id: word.id, kind: 'review' };
    });
    const newQueue = shuffleCopy(fresh);
    const queue = [];
    let reviewIndex = 0;
    let newIndex = 0;
    while (reviewIndex < reviewQueue.length || newIndex < newQueue.length) {
      const reviewBurst = reviewQueue.length && newQueue.length ? 2 : 4;
      for (let i = 0; i < reviewBurst && reviewIndex < reviewQueue.length; i += 1) {
        queue.push(reviewQueue[reviewIndex]);
        reviewIndex += 1;
      }
      for (let i = 0; i < 2 && newIndex < newQueue.length; i += 1) {
        queue.push(newQueue[newIndex]);
        newIndex += 1;
      }
      if (reviewIndex >= reviewQueue.length && newIndex < newQueue.length) {
        queue.push(newQueue[newIndex]);
        newIndex += 1;
      }
    }
    return queue;
  }

  function buildNewQueue(limit) {
    return prioritizedNewQueue(limit || state.profile.dailyGoal);
  }

  function buildReviewQueue(limit) {
    const due = dueWords().slice(0, limit || 30);
    return shuffleCopy(due).map(function (word) {
      return { id: word.id, kind: 'review' };
    });
  }

  function buildMixedQueue(limit) {
    const count = limit || state.profile.dailyGoal;
    const due = shuffleCopy(dueWords());
    const fresh = prioritizedNewQueue(count);
    const queue = [];
    due.slice(0, Math.ceil(count * 0.6)).forEach(function (word) {
      queue.push({ id: word.id, kind: 'review' });
    });
    fresh.slice(0, count - queue.length).forEach(function (item) {
      queue.push(item);
    });
    if (queue.length < count) {
      shuffleCopy(studiedWords()).slice(0, count - queue.length).forEach(function (word) {
        queue.push({ id: word.id, kind: 'review' });
      });
    }
    return shuffleCopy(queue);
  }

  function answerWord(id, rating, seconds) {
    if (!wordMap.has(id)) return null;
    const record = recordFor(id);
    const wasNew = record.seen === 0;
    const now = todayKey();
    const schedule = dueForSelfRating(id, rating);
    const stage = schedule.stage;
    const due = schedule.due;

    record.stage = stage;
    record.seen += 1;
    record.firstSeen = record.firstSeen || now;
    if (wasNew) {
      record.firstStudiedAt = now;
      record.firstRating = rating;
    }
    record.lastReviewed = now;
    record.lastRating = rating;
    record.due = due;
    if (!Array.isArray(record.books)) record.books = [];
    if (record.books.indexOf(activeBookId) === -1) record.books.push(activeBookId);
    if (rating === 'known') {
      record.correctCount += 1;
      // 是否真正掌握交给学后检验判断：错词需要连续答对两次才会移出待巩固。
    }
    if (!record.selfRatings || typeof record.selfRatings !== 'object') {
      record.selfRatings = { again: 0, fuzzy: 0, known: 0 };
    }
    record.selfRatings[rating] = (Number(record.selfRatings[rating]) || 0) + 1;
    if (rating === 'again') {
      record.lapseCount += 1;
      record.weak = true;
      record.weakSince = now;
      record.masteryStreak = 0;
      record.difficulty = clamp((Number(record.difficulty) || 0.35) + 0.12, 0.05, 0.95);
    } else if (rating === 'known') {
      record.difficulty = clamp((Number(record.difficulty) || 0.35) - 0.025, 0.05, 0.95);
    }
    record.stabilityDays = Math.max(1, schedule.days);

    const day = ensureActivity(now);
    if (!day.selfRatings || typeof day.selfRatings !== 'object') {
      day.selfRatings = { again: 0, fuzzy: 0, known: 0 };
    }
    day.selfRatings[rating] = (Number(day.selfRatings[rating]) || 0) + 1;
    day.seconds += clamp(Number(seconds) || 0, 0, 180);
    addDailyWord(day, id, wasNew);

    save();
    return {
      wasNew: wasNew,
      stage: stage,
      due: due,
      nextLabel: schedule.label,
      mastered: hasVerifiedMastery(record)
    };
  }

  function classifySpellingError(answer, target) {
    const a = String(answer || '').toLowerCase();
    const t = String(target || '').toLowerCase();
    if (!a) return 'spelling_empty';
    if (t.length > a.length && t.replace(a, '') !== t) return 'spelling_omission';
    if (a.length > t.length && a.replace(t, '') !== a) return 'spelling_extra';
    const sameLetters = a.split('').sort().join('') === t.split('').sort().join('');
    if (sameLetters) return 'spelling_order';
    return 'spelling_confusion';
  }

  function recordObjectiveAnswer(wordId, options) {
    if (!wordMap.has(wordId)) return null;
    const opts = typeof options === 'object' && options ? options : {
      type: 'meaning',
      correct: Boolean(options)
    };
    const type = String(opts.type || 'meaning');
    const correct = Boolean(opts.correct);
    const seconds = Number(opts.seconds) || 0;
    const record = recordFor(wordId);
    const now = todayKey();
    const wasWeak = Boolean(record.weak);
    const wasFirstQuiz = (Number(record.quizSeen) || 0) === 0;
    const previousObjectiveAt = record.lastObjectiveAt;
    const intervalDays = previousObjectiveAt ? Math.max(0, daysBetween(previousObjectiveAt, now)) : 0;
    const previousDue = record.due;
    record.quizSeen = (Number(record.quizSeen) || 0) + 1;
    record.objectiveSeen = normalizeCount(record.objectiveSeen) + 1;
    if (wasFirstQuiz) {
      record.firstQuizCorrect = Boolean(correct);
      record.firstQuizAt = now;
    }
    record.lastQuizAt = now;
    record.lastQuizCorrect = Boolean(correct);
    record.lastObjectiveAt = now;
    record.lastObjectiveType = type;
    record.lastObjectiveCorrect = Boolean(correct);
    if (correct) {
      record.lastObjectiveIntervalDays = Math.max(Number(record.lastObjectiveIntervalDays) || 0, intervalDays);
    }
    record.seen = record.seen || 1;
    record.firstSeen = record.firstSeen || now;
    if (!Array.isArray(record.books)) record.books = [];
    if (record.books.indexOf(activeBookId) === -1) record.books.push(activeBookId);
    if (!record.successDates) record.successDates = [];
    if (!record.successTypes) record.successTypes = [];

    if (correct) {
      record.quizCorrect = (Number(record.quizCorrect) || 0) + 1;
      record.objectiveCorrect = normalizeCount(record.objectiveCorrect) + 1;
      if (type === 'spelling') {
        record.spellingSeen = normalizeCount(record.spellingSeen) + 1;
        record.spellingCorrect = normalizeCount(record.spellingCorrect) + 1;
      }
      record.masteryStreak = (Number(record.masteryStreak) || 0) + 1;
      if (record.masteryStreak >= 2) {
        record.weak = false;
        record.weakSince = null;
      }
      if (record.successDates.indexOf(now) === -1) record.successDates.push(now);
      if (record.successTypes.indexOf(type) === -1) record.successTypes.push(type);
      record.difficulty = clamp((Number(record.difficulty) || 0.35) - 0.04, 0.05, 0.95);
      if (intervalDays >= 1) {
        record.retention24.seen += 1;
        record.retention24.correct += 1;
      }
      if (intervalDays >= 7) {
        record.retention7.seen += 1;
        record.retention7.correct += 1;
      }
      // 同一张卡片刚自评后的学后检验不覆盖自评给出的初始间隔；
      // 跨日复习或独立训练答对时才拉长间隔。
      if (intervalDays === 0 && record.lastReviewed === now && previousDue) {
        record.due = previousDue;
      } else {
        const stage = nextStageFor('known', record.stage, false);
        const base = REVIEW_DAYS[clamp(stage, 0, REVIEW_DAYS.length - 1)];
        const retentionAdjust = ((Number(state.profile.targetRetention) || TARGET_RETENTION) - TARGET_RETENTION) * 1.4;
        const factor = 1.15 - (Number(record.difficulty) || 0.35) * 0.35 + retentionAdjust;
        const days = Math.max(base, Math.round(Math.max(1, Number(record.stabilityDays) || 1) * clamp(factor, 0.85, 1.7)));
        record.stage = stage;
        record.stabilityDays = days;
        record.due = addDays(now, days);
      }
    } else {
      record.quizWrong = (Number(record.quizWrong) || 0) + 1;
      record.objectiveWrong = normalizeCount(record.objectiveWrong) + 1;
      if (type === 'spelling') {
        record.spellingSeen = normalizeCount(record.spellingSeen) + 1;
        record.spellingWrong = normalizeCount(record.spellingWrong) + 1;
      }
      record.lapseCount = (Number(record.lapseCount) || 0) + 1;
      record.stage = 0;
      record.due = addDays(now, 1);
      record.weak = true;
      record.weakSince = now;
      record.masteryStreak = 0;
      record.stabilityDays = 1;
      record.difficulty = clamp((Number(record.difficulty) || 0.35) + 0.1, 0.05, 0.95);
      if (intervalDays >= 1) record.retention24.seen += 1;
      if (intervalDays >= 7) record.retention7.seen += 1;
      const errorType = type === 'spelling'
        ? classifySpellingError(opts.answer, wordMap.get(wordId).word)
        : (type === 'context' ? 'usage_context' : 'meaning_confusion');
      record.errorTypes[errorType] = (Number(record.errorTypes[errorType]) || 0) + 1;
      if (opts.selectedText) {
        record.confusions.push({
          at: now,
          type: type,
          selected: String(opts.selectedText).slice(0, 100),
          correct: wordMap.get(wordId).meanings.slice(0, 2).join('；')
        });
        record.confusions = record.confusions.slice(-12);
      }
    }

    const day = ensureActivity(now);
    day.objectiveAttempts += 1;
    if (correct) day.objectiveCorrect += 1;
    if (intervalDays >= 1) {
      day.retention24Seen += 1;
      if (correct) day.retention24Correct += 1;
    }
    if (intervalDays >= 7) {
      day.retention7Seen += 1;
      if (correct) day.retention7Correct += 1;
    }
    day.questionTypes[type] = (Number(day.questionTypes[type]) || 0) + 1;
    day.seconds += clamp(seconds, 0, 120);
    save();
    return {
      correct: Boolean(correct),
      wasWeak: wasWeak,
      weak: Boolean(record.weak),
      masteryStreak: Number(record.masteryStreak) || 0,
      masteryRequired: 2,
      type: type,
      intervalDays: intervalDays,
      verifiedMastery: hasVerifiedMastery(record),
      stage: record.stage,
      due: record.due
    };
  }

  function recordSessionQuizAnswer(wordId, correct, seconds, options) {
    return recordObjectiveAnswer(wordId, Object.assign({}, options || {}, {
      type: (options && options.type) || 'meaning',
      correct: correct,
      seconds: seconds
    }));
  }

  function recordQuizAnswer(correct, seconds) {
    // 兼容旧调用。新代码应传入 wordId/type，确保能记录题型和保持率。
    return { correct: Boolean(correct), seconds: Number(seconds) || 0 };
  }

  function recordSession(options) {
    const opts = options || {};
    state.meta.sessions = (Number(state.meta.sessions) || 0) + 1;
    state.meta.lastSessionAt = new Date().toISOString();
    if (opts.type === 'spelling') {
      state.meta.quizSessions = (Number(state.meta.quizSessions) || 0) + 1;
      const total = Number(opts.total) || 0;
      const correct = Number(opts.correct) || 0;
      const score = total ? Math.round((correct / total) * 100) : 0;
      state.meta.bestSpelling = Math.max(Number(state.meta.bestSpelling) || 0, score);
    }
    save();
  }

  function toggleFavorite(id) {
    if (!wordMap.has(id)) return false;
    const record = recordFor(id);
    record.favorite = !record.favorite;
    save();
    return record.favorite;
  }

  function recordHint(id) {
    if (!wordMap.has(id)) return;
    const record = recordFor(id);
    record.hintsUsed = normalizeCount(record.hintsUsed) + 1;
    record.difficulty = clamp((Number(record.difficulty) || 0.35) + 0.025, 0.05, 0.95);
    save();
  }

  function markMastered(id, mastered) {
    if (!wordMap.has(id)) return;
    const record = recordFor(id);
    if (!Array.isArray(record.books)) record.books = [];
    if (record.books.indexOf(activeBookId) === -1) record.books.push(activeBookId);
    if (mastered) {
      record.seen = record.seen || 1;
      record.firstSeen = record.firstSeen || todayKey();
      record.lastReviewed = todayKey();
      record.stage = 7;
      record.due = addDays(todayKey(), 60);
      record.stabilityDays = 60;
      record.manualLongTerm = true;
    } else {
      record.stage = 0;
      record.due = todayKey();
      record.stabilityDays = 1;
      record.manualLongTerm = false;
    }
    save();
  }

  function updateProfile(patch) {
    if (!patch) return;
    if (typeof patch.name === 'string') {
      state.profile.name = patch.name.trim().slice(0, 12);
    }
    if (patch.dailyGoal !== undefined && patch.dailyGoal !== null && patch.dailyGoal !== '') {
      const requested = Math.round(Number(patch.dailyGoal));
      if (Number.isFinite(requested)) {
        state.profile.dailyGoal = clamp(requested, MIN_DAILY_GOAL, MAX_DAILY_GOAL);
      }
    }
    if (patch.voiceGender === 'male' || patch.voiceGender === 'female') {
      state.profile.voiceGender = patch.voiceGender;
    }
    if (patch.voiceRate !== undefined) {
      const requestedRate = Number(patch.voiceRate);
      if (Number.isFinite(requestedRate)) {
        state.profile.voiceRate = clamp(requestedRate, 0.7, 1.15);
      }
    }
    save();
  }

  function resetAll() {
    const keepBook = state.profile.activeBook || activeBookId;
    const keepSeeds = Object.assign({}, state.bookSeeds || {});
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      storageAvailable = false;
    }
    state = createDefaultState();
    state.profile.activeBook = keepBook;
    state.bookSeeds = keepSeeds;
    activeBookId = keepBook;
    save();
  }

  function getWeekSeries() {
    const result = [];
    for (let i = 6; i >= 0; i -= 1) {
      const key = addDays(todayKey(), -i);
      const day = state.activity[key] || {};
      result.push({
        key: key,
        label: ['日', '一', '二', '三', '四', '五', '六'][keyToDate(key).getDay()],
        shortDate: (keyToDate(key).getMonth() + 1) + '/' + keyToDate(key).getDate(),
        learned: Array.isArray(day.learned) ? day.learned.length : 0,
        reviewed: Array.isArray(day.reviewed) ? day.reviewed.length : 0,
        attempts: Number(day.objectiveAttempts) || 0,
        seconds: Number(day.seconds) || 0,
        isToday: key === todayKey()
      });
    }
    return result;
  }

  function getHeatmap() {
    const today = keyToDate(todayKey());
    const mondayOffset = (today.getDay() + 6) % 7;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - mondayOffset);
    thisMonday.setHours(12, 0, 0, 0);
    const start = new Date(thisMonday);
    start.setDate(thisMonday.getDate() - 11 * 7);

    const weeks = [];
    for (let w = 0; w < 12; w += 1) {
      const days = [];
      for (let d = 0; d < 7; d += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        const key = dateKey(date);
        const day = state.activity[key];
        const attempts = day ? Number(day.objectiveAttempts) || Number(day.attempts) || 0 : 0;
        let level = 0;
        if (attempts > 0) level = 1;
        if (attempts >= 4) level = 2;
        if (attempts >= 8) level = 3;
        if (attempts >= 15) level = 4;
        days.push({
          key: key,
          count: attempts,
          level: level,
          future: key > todayKey(),
          isToday: key === todayKey()
        });
      }
      weeks.push(days);
    }
    return weeks;
  }

  function getReviewForecast(days) {
    const count = days || 7;
    const forecast = [];
    for (let i = 1; i <= count; i += 1) {
      const key = addDays(todayKey(), i);
      const due = activeWords.filter(function (word) {
        const record = state.words[word.id];
        return record && record.seen > 0 && record.due === key;
      }).length;
      forecast.push({
        key: key,
        label: i === 1 ? '明天' : (keyToDate(key).getMonth() + 1) + '/' + keyToDate(key).getDate(),
        due: due
      });
    }
    return forecast;
  }

  function getOverview() {
    const today = ensureActivity();
    const studied = new Set(today.learned.concat(today.reviewed));
    const stats = totalStats();
    const goal = state.profile.dailyGoal;
    const plan = buildDailyPlan();
    const remaining = Math.max(0, goal - studied.size);
    const streak = calculateStreak(state.activity);
    const reviewDueToday = dueWords().filter(function (word) {
      return !studied.has(word.id);
    }).length;
    const newRemaining = newWords().length;
    let recentSeconds = 0;
    let recentWords = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      const day = state.activity[addDays(todayKey(), -offset)];
      if (!day) continue;
      recentSeconds += Number(day.seconds) || 0;
      recentWords += new Set((day.learned || []).concat(day.reviewed || [])).size;
    }
    const secondsPerWord = recentWords ? recentSeconds / recentWords : 18;
    const estimatedMinutes = plan.length ? Math.max(1, Math.ceil((plan.length * secondsPerWord) / 60)) : 0;
    const forecast = getReviewForecast(7);

    return Object.assign({}, stats, {
      goal: goal,
      todayUnique: studied.size,
      todayNew: today.learned.length,
      todayReviewed: today.reviewed.length,
      todayAttempts: today.objectiveAttempts,
      todayCorrect: today.objectiveCorrect,
      todaySelfRatings: today.selfRatings,
      todaySeconds: today.seconds,
      remaining: remaining,
      plan: plan,
      planCount: plan.length,
      planNewCount: plan.filter(function (item) { return item.kind === 'new'; }).length,
      planReviewCount: plan.filter(function (item) { return item.kind === 'review'; }).length,
      reviewDueToday: reviewDueToday,
      newRemaining: newRemaining,
      estimatedMinutes: estimatedMinutes,
      dueTomorrow: forecast[0] ? forecast[0].due : 0,
      streak: streak.current,
      longestStreak: streak.longest,
      targetRetention: state.profile.targetRetention || TARGET_RETENTION
    });
  }

  function progressPercent() {
    const overview = getOverview();
    return overview.goal ? Math.round((overview.todayUnique / overview.goal) * 100) : 0;
  }

  function getDailyGoalOptions() {
    return GOAL_OPTIONS.slice();
  }

  function getUnit(unitId) {
    return unitMap.get(unitId) || null;
  }

  function getWord(id) {
    return wordMap.get(id) || null;
  }

  function getActivityDay(key) {
    return state.activity[key || todayKey()] || null;
  }

  function getMeta() {
    return state.meta;
  }

  function getProfile() {
    return state.profile;
  }

  function getState() {
    return state;
  }

  load();

  window.Store = {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    REVIEW_DAYS: REVIEW_DAYS,
    MASTER_STAGE: MASTER_STAGE,
    MIN_DAILY_GOAL: MIN_DAILY_GOAL,
    MAX_DAILY_GOAL: MAX_DAILY_GOAL,
    get words() { return activeWords; },
    get units() { return activeUnits; },
    loadBook: loadBook,
    activateBook: activateBook,
    setBookIndex: setBookIndex,
    getBookMeta: getBookMeta,
    getBookProgress: getBookProgress,
    getActiveBookId: function () { return activeBookId; },
    getWord: getWord,
    getUnit: getUnit,
    getRecord: getRecord,
    hasRecord: hasRecord,
    getStatus: getStatus,
    isDue: isDue,
    getDueLabel: getDueLabel,
    getProfile: getProfile,
    getMeta: getMeta,
    getState: getState,
    getActivityDay: getActivityDay,
    getOverview: getOverview,
    totalStats: totalStats,
    unitStats: unitStats,
    newWords: newWords,
    studiedWords: studiedWords,
    learnedReviewWords: learnedReviewWords,
    buildLearnedReviewQueue: function () {
      return learnedReviewWords().map(function (word) {
        return { id: word.id, kind: 'review' };
      });
    },
    favorites: favorites,
    dueWords: dueWords,
    buildDailyPlan: buildDailyPlan,
    buildNewQueue: buildNewQueue,
    buildReviewQueue: buildReviewQueue,
    buildMixedQueue: buildMixedQueue,
    answerWord: answerWord,
    dueForSelfRating: dueForSelfRating,
    recordSessionQuizAnswer: recordSessionQuizAnswer,
    recordObjectiveAnswer: recordObjectiveAnswer,
    recordQuizAnswer: recordQuizAnswer,
    recordSession: recordSession,
    recordHint: recordHint,
    toggleFavorite: toggleFavorite,
    markMastered: markMastered,
    updateProfile: updateProfile,
    resetAll: resetAll,
    getWeekSeries: getWeekSeries,
    getHeatmap: getHeatmap,
    getReviewForecast: getReviewForecast,
    progressPercent: progressPercent,
    getDailyGoalOptions: getDailyGoalOptions,
    dateKey: dateKey,
    todayKey: todayKey,
    addDays: addDays,
    keyToDate: keyToDate,
    formatDateCN: formatDateCN,
    weekdayCN: weekdayCN,
    daysBetween: daysBetween,
    reviewLabelForStage: reviewLabelForStage,
    hasVerifiedMastery: hasVerifiedMastery,
    classifySpellingError: classifySpellingError,
    isStorageAvailable: function () { return storageAvailable; },
    prepareRemote: prepareRemote,
    hydrateFromIndexedDb: hydrateFromIndexedDb,
    requestPersistentStorage: requestPersistentStorage,
    pushRemoteNow: pushRemoteNow,
    restoreRemoteState: restoreRemoteState,
    exportState: exportState,
    importState: importState,
    getPersistence: getPersistence
  };
})();
