/* Offline ECDSA licenses for paid products. Private signing keys never ship. */
(function (global) {
  'use strict';

  const PUBLIC_KEY_SPKI_B64 = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEgYs5TQKIAlGNC1oTShmtWNnkyxMO9ClgItwnojUrwOQvqd51sK1d3M1eGIQDfvx2F/30tIZb8q2zmDsNZNeZpQ==';
  const LICENSE_KEY = 'shici.license.memory-wall.v1';
  const LOCAL_TEST_KEY = 'shici.license.test.memory-wall.v1';
  const PRODUCT = 'memory-wall';
  let status = {
    checked: false,
    unlocked: false,
    source: null,
    subject: null,
    expiresAt: null,
    error: null
  };

  function decodeBase64Url(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function decodeBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function decodePayload(bytes) {
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function isLocalTestHost() {
    return global.location &&
      (global.location.hostname === '127.0.0.1' || global.location.hostname === 'localhost');
  }

  function localTestUnlocked() {
    if (!isLocalTestHost()) return false;
    try {
      return global.localStorage.getItem(LOCAL_TEST_KEY) === '1';
    } catch (error) {
      return false;
    }
  }

  async function verifyLicense(raw) {
    const token = String(raw || '').trim();
    const parts = token.split('.');
    if (parts.length !== 2) throw new Error('授权码格式不正确');
    const payloadBytes = decodeBase64Url(parts[0]);
    const signature = decodeBase64Url(parts[1]);
    const payload = decodePayload(payloadBytes);
    if (payload.v !== 1 || payload.product !== PRODUCT) {
      throw new Error('授权码不属于记忆墙打印包');
    }
    if (payload.expiresAt && Date.parse(payload.expiresAt) <= Date.now()) {
      throw new Error('授权码已过期');
    }
    if (!global.crypto || !global.crypto.subtle) throw new Error('当前浏览器不支持授权校验');
    const key = await global.crypto.subtle.importKey(
      'spki',
      decodeBase64(PUBLIC_KEY_SPKI_B64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const valid = await global.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature,
      payloadBytes
    );
    if (!valid) throw new Error('授权码签名无效');
    return {
      payload: payload,
      token: token
    };
  }

  function storeUnlocked(result, source) {
    status = {
      checked: true,
      unlocked: true,
      source: source,
      subject: result && result.payload ? result.payload.subject || null : null,
      expiresAt: result && result.payload ? result.payload.expiresAt || null : null,
      error: null
    };
    return status;
  }

  async function initialize() {
    if (localTestUnlocked()) return storeUnlocked(null, 'local-test');
    let raw = '';
    try {
      raw = global.localStorage.getItem(LICENSE_KEY) || '';
    } catch (error) {
      status = { checked: true, unlocked: false, source: null, subject: null, expiresAt: null, error: 'storage-unavailable' };
      return status;
    }
    if (!raw) {
      status = { checked: true, unlocked: false, source: null, subject: null, expiresAt: null, error: null };
      return status;
    }
    try {
      const result = await verifyLicense(raw);
      return storeUnlocked(result, 'license');
    } catch (error) {
      status = {
        checked: true,
        unlocked: false,
        source: null,
        subject: null,
        expiresAt: null,
        error: error && error.message ? error.message : '授权码无效'
      };
      return status;
    }
  }

  async function activate(raw) {
    const result = await verifyLicense(raw);
    global.localStorage.setItem(LICENSE_KEY, result.token);
    return storeUnlocked(result, 'license');
  }

  function clearLicense() {
    try {
      global.localStorage.removeItem(LICENSE_KEY);
      global.localStorage.removeItem(LOCAL_TEST_KEY);
    } catch (error) {
      // Clearing the in-memory state still locks this page.
    }
    status = { checked: true, unlocked: false, source: null, subject: null, expiresAt: null, error: null };
  }

  function isUnlocked(product) {
    return (!product || product === PRODUCT) && status.checked && status.unlocked;
  }

  function getStatus() {
    return Object.assign({}, status);
  }

  global.ShiciEntitlements = {
    PRODUCT: PRODUCT,
    initialize: initialize,
    activate: activate,
    verifyLicense: verifyLicense,
    isUnlocked: isUnlocked,
    getStatus: getStatus,
    clearLicense: clearLicense,
    isLocalTestHost: isLocalTestHost
  };
})(window);
