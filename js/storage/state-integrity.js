/* Deterministic integrity helpers for the existing plain V3 state shape. */
(function (global) {
  'use strict';

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + stableStringify(value[key]);
    }).join(',') + '}';
  }

  function checksum(value) {
    const text = typeof value === 'string' ? value : stableStringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  }

  function payload(state) {
    const copy = JSON.parse(JSON.stringify(state || {}));
    if (copy.meta && typeof copy.meta === 'object') delete copy.meta.integrity;
    return copy;
  }

  function attach(state) {
    if (!state || typeof state !== 'object') return '';
    state.meta = state.meta && typeof state.meta === 'object' ? state.meta : {};
    state.meta.integrity = checksum(payload(state));
    return state.meta.integrity;
  }

  function verify(state) {
    if (!state || typeof state !== 'object' || !state.meta || !state.meta.integrity) {
      return { status: 'unsigned', expected: null, actual: null };
    }
    const actual = checksum(payload(state));
    return {
      status: actual === state.meta.integrity ? 'valid' : 'mismatch',
      expected: state.meta.integrity,
      actual: actual
    };
  }

  global.ShiciModules = global.ShiciModules || {};
  global.ShiciModules.StateIntegrity = {
    stableStringify: stableStringify,
    checksum: checksum,
    payload: payload,
    attach: attach,
    verify: verify
  };
})(typeof window !== 'undefined' ? window : globalThis);
