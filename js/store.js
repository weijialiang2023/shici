/* 拾词 · 学习数据与间隔复习
 * 复习节奏参考艾宾浩斯遗忘曲线，并结合间隔重复的常用做法：
 * 初次学习后在第 1、2、4、7、15、30、60 天安排再次回忆。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'shici.state.v1';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const REVIEW_DAYS = [1, 1, 2, 4, 7, 15, 30, 60];
  const MASTER_STAGE = 6;
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

  function createDefaultState() {
    return {
      version: 2,
      profile: {
        name: '',
        dailyGoal: 20,
        voiceGender: 'female',
        voiceRate: 0.9,
        createdAt: new Date().toISOString(),
        activeBook: window.DEFAULT_BOOK || 'gaokao'
      },
      words: {},
      activity: {},
      bookSeeds: {},
      meta: {
        schema: 2,
        sessions: 0,
        quizSessions: 0,
        bestSpelling: 0,
        lastSessionAt: null,
        updatedAt: null,
        lastServerSavedAt: null
      }
    };
  }

  function blankRecord() {
    return {
      stage: 0,
      seen: 0,
      due: null,
      firstSeen: null,
      firstStudiedAt: null,
      firstRating: null,
      firstQuizAt: null,
      firstQuizCorrect: null,
      lastReviewed: null,
      lastRating: null,
      favorite: false,
      correctCount: 0,
      lapseCount: 0,
      books: [],
      weak: false,
      weakSince: null,
      quizSeen: 0,
      quizCorrect: 0,
      quizWrong: 0,
      lastQuizAt: null,
      lastQuizCorrect: null,
      masteryStreak: 0
    };
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      state = {
        version: 2,
        profile: Object.assign({}, createDefaultState().profile, saved.profile || {}),
        words: saved.words && typeof saved.words === 'object' ? saved.words : {},
        activity: saved.activity && typeof saved.activity === 'object' ? saved.activity : {},
        bookSeeds: saved.bookSeeds && typeof saved.bookSeeds === 'object' ? saved.bookSeeds : {},
        meta: Object.assign({}, createDefaultState().meta, saved.meta || {})
      };
      state.version = 2;
      state.meta.schema = 2;
      const savedGoal = Math.round(Number(state.profile.dailyGoal));
      if (!Number.isFinite(savedGoal) || savedGoal < MIN_DAILY_GOAL || savedGoal > MAX_DAILY_GOAL) {
        state.profile.dailyGoal = 20;
      } else {
        state.profile.dailyGoal = savedGoal;
      }
      if (state.profile.voiceGender !== 'male' && state.profile.voiceGender !== 'female') {
        state.profile.voiceGender = 'female';
      }
      const savedVoiceRate = Number(state.profile.voiceRate);
      state.profile.voiceRate = Number.isFinite(savedVoiceRate)
        ? clamp(savedVoiceRate, 0.7, 1.15)
        : 0.9;
      const knownBookIds = (window.BOOKS || []).map(function (book) { return book.id; });
      if (!state.profile.activeBook || knownBookIds.indexOf(state.profile.activeBook) === -1) {
        state.profile.activeBook = window.DEFAULT_BOOK || 'gaokao';
      }
      activeBookId = state.profile.activeBook;
      // 规范旧数据中的单词记录，避免字段缺失导致计算异常。记录不因词书切换而删除。
      Object.keys(state.words).forEach(function (id) {
        state.words[id] = Object.assign(blankRecord(), state.words[id]);
        if (typeof state.words[id].favorite !== 'boolean') state.words[id].favorite = false;
        if (!Array.isArray(state.words[id].books)) {
          state.words[id].books = state.words[id].seen ? [activeBookId] : [];
        }
        const record = state.words[id];
        if (record.seen && record.firstStudiedAt == null) {
          record.firstStudiedAt = record.firstSeen || record.lastReviewed || null;
        }
      });
    } catch (error) {
      storageAvailable = false;
      state = createDefaultState();
    }
  }

  function save() {
    state.meta.updatedAt = new Date().toISOString();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageAvailable = true;
    } catch (error) {
      storageAvailable = false;
    }
    remoteDirty = true;
    scheduleRemoteSave();
    document.dispatchEvent(new CustomEvent('shici:change'));
    document.dispatchEvent(new CustomEvent('shici:saved', {
      detail: { mode: remoteMode, savedAt: state.meta.updatedAt, remoteSaving: remoteSaving }
    }));
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data));
      window.location.reload();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: 'unavailable' };
    }
  }

  function exportState() {
    return JSON.stringify(state, null, 2);
  }

  function importState(raw) {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.words || typeof parsed.words !== 'object') {
      throw new Error('备份文件格式不正确');
    }
    if (!parsed.profile || typeof parsed.profile !== 'object') throw new Error('备份缺少用户设置');
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    return true;
  }

  function getPersistence() {
    return {
      mode: remoteMode,
      server: remoteEnabled,
      storage: storageAvailable,
      lastSavedAt: state.meta.updatedAt || null,
      remoteSavedAt: remoteSavedAt,
      lastServerSavedAt: state.meta.lastServerSavedAt || null,
      error: remoteLastError
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
    if (record.stage >= MASTER_STAGE) return 'mastered';
    return 'learning';
  }

  function isDue(record) {
    return Boolean(record && record.seen > 0 && record.due && record.due <= todayKey());
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

  function nextStageFor(rating, currentStage, wasNew) {
    if (rating === 'again') return 0;
    if (rating === 'fuzzy') return wasNew ? 1 : Math.max(1, currentStage);
    return clamp((wasNew ? 0 : currentStage) + 1, 0, REVIEW_DAYS.length - 1);
  }

  function nextDueForStage(stage, fromKey) {
    const days = REVIEW_DAYS[clamp(stage, 0, REVIEW_DAYS.length - 1)];
    return addDays(fromKey || todayKey(), days);
  }

  function reviewLabelForStage(stage) {
    const days = REVIEW_DAYS[clamp(stage, 0, REVIEW_DAYS.length - 1)];
    return days === 1 ? '明天' : days + ' 天后';
  }

  function ensureActivity(key) {
    const date = key || todayKey();
    if (!state.activity[date]) {
      state.activity[date] = {
        attempts: 0,
        correct: 0,
        seconds: 0,
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
        if (record.stage >= MASTER_STAGE) mastered += 1;
      });
    } else {
      Object.keys(state.words).forEach(function (id) {
        const record = state.words[id];
        if (!record || !record.seen) return;
        if (!Array.isArray(record.books) || record.books.indexOf(bookId) === -1) return;
        seen += 1;
        if (record.stage >= MASTER_STAGE) mastered += 1;
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
        if (record.stage >= MASTER_STAGE) mastered += 1;
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
      return activity[key] && Number(activity[key].attempts) > 0;
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
    activeWords.forEach(function (word) {
      const record = state.words[word.id];
      if (record && record.seen) {
        totalSeen += 1;
        if (record.stage >= MASTER_STAGE) mastered += 1;
        else learning += 1;
        if (record.weak) weak += 1;
      }
    });
    Object.keys(state.activity).forEach(function (key) {
      const day = state.activity[key];
      attempts += Number(day.attempts) || 0;
      correct += Number(day.correct) || 0;
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
    // 到期复习优先进入计划；具体呈现顺序和新词选择都做乱序，
    // 避免学习者只记住词书开头的字母顺序。
    const due = dueWords().filter(function (word) { return !studied.has(word.id); });
    const reviews = due.slice(0, remainingGoal);
    const newLimit = Math.max(0, remainingGoal - reviews.length);
    const fresh = prioritizedNewQueue(newLimit);
    const queue = reviews.map(function (word) {
      return { id: word.id, kind: 'review' };
    }).concat(fresh);
    return shuffleCopy(queue);
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
    const stage = nextStageFor(rating, record.stage, wasNew);
    const due = nextDueForStage(stage, now);

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
    if (rating === 'again') {
      record.lapseCount += 1;
      record.weak = true;
      record.weakSince = now;
      record.masteryStreak = 0;
    }

    const day = ensureActivity(now);
    day.attempts += 1;
    if (rating === 'known') day.correct += 1;
    day.seconds += clamp(Number(seconds) || 0, 0, 180);
    addDailyWord(day, id, wasNew);

    save();
    return {
      wasNew: wasNew,
      stage: stage,
      due: due,
      nextLabel: reviewLabelForStage(stage),
      mastered: stage >= MASTER_STAGE
    };
  }

  function recordSessionQuizAnswer(wordId, correct, seconds) {
    if (!wordMap.has(wordId)) return null;
    const record = recordFor(wordId);
    const now = todayKey();
    const wasWeak = Boolean(record.weak);
    const wasFirstQuiz = (Number(record.quizSeen) || 0) === 0;
    record.quizSeen = (Number(record.quizSeen) || 0) + 1;
    if (wasFirstQuiz) {
      record.firstQuizCorrect = Boolean(correct);
      record.firstQuizAt = now;
    }
    record.lastQuizAt = now;
    record.lastQuizCorrect = Boolean(correct);
    record.seen = record.seen || 1;
    record.firstSeen = record.firstSeen || now;
    if (!Array.isArray(record.books)) record.books = [];
    if (record.books.indexOf(activeBookId) === -1) record.books.push(activeBookId);

    if (correct) {
      record.quizCorrect = (Number(record.quizCorrect) || 0) + 1;
      record.masteryStreak = (Number(record.masteryStreak) || 0) + 1;
      if (record.masteryStreak >= 2) {
        record.weak = false;
        record.weakSince = null;
      }
      // 如果在卡片环节自评“不认识”，但检验中答对了，给它一个起步阶段，
      // 明天仍然复习，但之后不必再从最低阶段重新爬。
      if (record.stage === 0 && record.lastRating === 'again') record.stage = 1;
    } else {
      record.quizWrong = (Number(record.quizWrong) || 0) + 1;
      record.lapseCount = (Number(record.lapseCount) || 0) + 1;
      record.stage = 0;
      record.due = addDays(now, 1);
      record.weak = true;
      record.weakSince = now;
      record.masteryStreak = 0;
    }

    const day = ensureActivity(now);
    day.attempts += 1;
    if (correct) day.correct += 1;
    day.seconds += clamp(Number(seconds) || 0, 0, 120);
    save();
    return {
      correct: Boolean(correct),
      wasWeak: wasWeak,
      weak: Boolean(record.weak),
      masteryStreak: Number(record.masteryStreak) || 0,
      masteryRequired: 2,
      stage: record.stage,
      due: record.due
    };
  }

  function recordQuizAnswer(correct, seconds) {
    const day = ensureActivity();
    day.attempts += 1;
    if (correct) day.correct += 1;
    day.seconds += clamp(Number(seconds) || 0, 0, 120);
    save();
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
      record.weak = false;
      record.weakSince = null;
      record.masteryStreak = 2;
    } else {
      record.stage = 0;
      record.due = todayKey();
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
        attempts: Number(day.attempts) || 0,
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
        const attempts = day ? Number(day.attempts) || 0 : 0;
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
    const estimatedMinutes = plan.length ? Math.max(1, Math.round(plan.length * 0.35)) : 0;
    const forecast = getReviewForecast(7);

    return Object.assign({}, stats, {
      goal: goal,
      todayUnique: studied.size,
      todayNew: today.learned.length,
      todayReviewed: today.reviewed.length,
      todayAttempts: today.attempts,
      todayCorrect: today.correct,
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
      longestStreak: streak.longest
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
    favorites: favorites,
    dueWords: dueWords,
    buildDailyPlan: buildDailyPlan,
    buildNewQueue: buildNewQueue,
    buildReviewQueue: buildReviewQueue,
    buildMixedQueue: buildMixedQueue,
    answerWord: answerWord,
    recordSessionQuizAnswer: recordSessionQuizAnswer,
    recordQuizAnswer: recordQuizAnswer,
    recordSession: recordSession,
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
    isStorageAvailable: function () { return storageAvailable; },
    prepareRemote: prepareRemote,
    pushRemoteNow: pushRemoteNow,
    restoreRemoteState: restoreRemoteState,
    exportState: exportState,
    importState: importState,
    getPersistence: getPersistence
  };
})();
