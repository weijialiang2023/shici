/* Privacy-first product analytics facade.
 * No external endpoint is configured by default. Events are exposed locally
 * for tests and integrations; nothing leaves the browser until a deployment
 * explicitly configures an endpoint and a user grants consent.
 */
(function () {
  'use strict';

  const CONSENT_KEY = 'shici.analytics.consent.v1';
  const ALLOWED_EVENTS = new Set([
    'app_open',
    'session_start',
    'session_complete',
    'quiz_answered',
    'report_opened',
    'sync_restore_succeeded',
    'content_issue_reported',
    'premium_gate_view',
    'premium_purchase_clicked',
    'premium_license_activated'
  ]);
  const SAFE_PROPERTIES = new Set([
    'route',
    'bookId',
    'mode',
    'planSize',
    'questionType',
    'correct',
    'score',
    'durationBucket',
    'source'
  ]);

  const config = window.SHICI_PRODUCT_ANALYTICS_CONFIG || {};
  const endpoint = typeof config.endpoint === 'string' ? config.endpoint.trim() : '';
  let consent = false;

  try {
    consent = window.localStorage.getItem(CONSENT_KEY) === 'granted';
  } catch (error) {
    consent = false;
  }

  function safeProps(input) {
    const output = {};
    if (!input || typeof input !== 'object') return output;
    Object.keys(input).forEach(function (key) {
      if (!SAFE_PROPERTIES.has(key)) return;
      const value = input[key];
      if (typeof value === 'string') output[key] = value.slice(0, 80);
      else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
      else if (typeof value === 'boolean') output[key] = value;
    });
    return output;
  }

  function eventId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function track(name, properties) {
    if (!ALLOWED_EVENTS.has(name)) return false;
    const event = {
      event: name,
      eventId: eventId(),
      occurredAt: new Date().toISOString(),
      properties: safeProps(properties)
    };
    document.dispatchEvent(new CustomEvent('shici:analytics', { detail: event }));
    if (!consent || !endpoint) return true;
    try {
      const payload = JSON.stringify(event);
      if (navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }))) {
        return true;
      }
      fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function () {
        // Analytics must never block the learning flow.
      });
    } catch (error) {
      // Analytics must never block the learning flow.
    }
    return true;
  }

  function setConsent(granted) {
    consent = Boolean(granted);
    try {
      window.localStorage.setItem(CONSENT_KEY, consent ? 'granted' : 'denied');
    } catch (error) {
      // Consent still applies to this page session.
    }
    document.dispatchEvent(new CustomEvent('shici:analytics-consent', {
      detail: { granted: consent }
    }));
  }

  window.ProductAnalytics = {
    track: track,
    setConsent: setConsent,
    getConsent: function () { return consent; },
    isConfigured: function () { return Boolean(endpoint); }
  };
})();
