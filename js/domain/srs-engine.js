/* Pure SRS rules shared by the Store facade and deterministic tests. */
(function (global) {
  'use strict';

  const REVIEW_DAYS = [1, 2, 4, 7, 15, 30, 60, 90];
  const TARGET_RETENTION = 0.85;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
  }

  function dateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    const pad = function (part) { return String(part).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function keyToDate(key) {
    const parts = String(key).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  }

  function addDays(key, days) {
    const date = keyToDate(key);
    date.setDate(date.getDate() + Number(days || 0));
    return dateKey(date);
  }

  function daysBetween(fromKey, toKey) {
    const from = keyToDate(fromKey);
    const to = keyToDate(toKey);
    return Math.round((to - from) / (24 * 60 * 60 * 1000));
  }

  function normalizeStrings(value) {
    return Array.isArray(value)
      ? Array.from(new Set(value.filter(function (item) { return typeof item === 'string' && item; })))
      : [];
  }

  function isDue(record, today) {
    const key = today || dateKey(new Date());
    return Boolean(record && record.seen > 0 && record.due && record.due <= key);
  }

  function hasVerifiedMastery(record) {
    if (!record) return false;
    return normalizeStrings(record.successDates).length >= 3 &&
      normalizeStrings(record.successTypes).length >= 2 &&
      Number(record.lastObjectiveIntervalDays) >= 7;
  }

  function nextStageFor(rating, currentStage, wasNew) {
    if (rating === 'again') return 0;
    if (rating === 'fuzzy') return wasNew ? 1 : Math.max(1, Number(currentStage) - 1);
    return clamp((wasNew ? 0 : Number(currentStage)) + 1, 0, REVIEW_DAYS.length - 1);
  }

  function nextDueForStage(stage, fromKey) {
    const days = REVIEW_DAYS[clamp(stage, 0, REVIEW_DAYS.length - 1)];
    return addDays(fromKey || dateKey(new Date()), days);
  }

  function reviewLabelForStage(stage) {
    const days = Number(stage);
    if (days === 0) return '今天稍后';
    return days === 1 ? '明天' : days + ' 天后';
  }

  function dueForSelfRating(record, rating, options) {
    const opts = options || {};
    const today = opts.today || dateKey(new Date());
    const targetRetention = Number(opts.targetRetention) || TARGET_RETENTION;
    const value = record || {};
    const wasNew = !value.seen;
    if (wasNew) {
      if (rating === 'again') return { due: today, days: 0, stage: 0, label: '今天稍后' };
      if (rating === 'fuzzy') return { due: addDays(today, 1), days: 1, stage: 1, label: '明天' };
      return { due: addDays(today, 3), days: 3, stage: 2, label: '3 天后' };
    }
    const elapsed = value.lastReviewed ? Math.max(0, daysBetween(value.lastReviewed, today)) : 0;
    const previousInterval = Math.max(
      1,
      Number(value.stabilityDays) || elapsed ||
        REVIEW_DAYS[clamp(value.stage || 0, 0, REVIEW_DAYS.length - 1)]
    );
    if (rating === 'again') return { due: addDays(today, 1), days: 1, stage: 0, label: '明天' };
    if (rating === 'fuzzy') {
      const days = Math.max(1, Math.round(previousInterval * 0.55));
      return {
        due: addDays(today, days),
        days: days,
        stage: Math.max(1, Number(value.stage) - 1),
        label: reviewLabelForStage(days)
      };
    }
    const stage = nextStageFor(rating, value.stage, false);
    const base = REVIEW_DAYS[clamp(stage, 0, REVIEW_DAYS.length - 1)];
    const retentionAdjust = (targetRetention - TARGET_RETENTION) * 1.4;
    const difficultyFactor = 1.12 - (Number(value.difficulty) || 0.35) * 0.3 + retentionAdjust;
    const days = Math.max(base, Math.round(previousInterval * clamp(difficultyFactor, 0.82, 1.56)));
    return { due: addDays(today, days), days: days, stage: stage, label: reviewLabelForStage(days) };
  }

  global.ShiciModules = global.ShiciModules || {};
  global.ShiciModules.SRSEngine = {
    REVIEW_DAYS: REVIEW_DAYS.slice(),
    TARGET_RETENTION: TARGET_RETENTION,
    dateKey: dateKey,
    addDays: addDays,
    daysBetween: daysBetween,
    isDue: isDue,
    hasVerifiedMastery: hasVerifiedMastery,
    nextStageFor: nextStageFor,
    nextDueForStage: nextDueForStage,
    reviewLabelForStage: reviewLabelForStage,
    dueForSelfRating: dueForSelfRating
  };
})(typeof window !== 'undefined' ? window : globalThis);
