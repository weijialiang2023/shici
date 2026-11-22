/* State normalization and migration for the existing V3 plain-object shape. */
(function (global) {
  'use strict';

  const SCHEMA_VERSION = 3;
  const MIN_DAILY_GOAL = 1;
  const MAX_DAILY_GOAL = 300;
  const TARGET_RETENTION = 0.85;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
  }

  function normalizeCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function normalizeStringList(value) {
    return Array.isArray(value)
      ? Array.from(new Set(value.filter(function (item) { return typeof item === 'string' && item; })))
      : [];
  }

  function normalizeRetention(value) {
    return {
      seen: normalizeCount(value && value.seen),
      correct: normalizeCount(value && value.correct)
    };
  }

  function createDefaultState(options) {
    const opts = options || {};
    const defaultBook = opts.defaultBook || 'gaokao';
    return {
      version: SCHEMA_VERSION,
      profile: {
        name: '',
        dailyGoal: 20,
        voiceGender: 'female',
        voiceRate: 0.9,
        targetRetention: TARGET_RETENTION,
        createdAt: opts.now || new Date().toISOString(),
        activeBook: defaultBook
      },
      words: {},
      activity: {},
      bookSeeds: {},
      meta: {
        schema: SCHEMA_VERSION,
        revision: 0,
        writerId: null,
        integrity: null,
        sessions: 0,
        quizSessions: 0,
        bestSpelling: 0,
        lastSessionAt: null,
        updatedAt: null,
        lastServerSavedAt: null,
        lastBackupAt: null,
        lastBackupName: null,
        storagePersisted: null,
        corruptBackupKey: null
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
      masteryStreak: 0,
      difficulty: 0.35,
      stabilityDays: 1,
      objectiveSeen: 0,
      objectiveCorrect: 0,
      objectiveWrong: 0,
      spellingSeen: 0,
      spellingCorrect: 0,
      spellingWrong: 0,
      successDates: [],
      successTypes: [],
      lastObjectiveAt: null,
      lastObjectiveType: null,
      lastObjectiveCorrect: null,
      lastObjectiveIntervalDays: 0,
      hintsUsed: 0,
      errorTypes: {},
      confusions: [],
      retention24: { seen: 0, correct: 0 },
      retention7: { seen: 0, correct: 0 },
      selfRatings: { again: 0, fuzzy: 0, known: 0 },
      manualLongTerm: false
    };
  }

  function normalizeRecord(record, fallbackBook) {
    const next = Object.assign(blankRecord(), record || {});
    next.difficulty = clamp(Number(next.difficulty) || 0.35, 0.05, 0.95);
    next.stabilityDays = Math.max(0, Number(next.stabilityDays) || 0);
    next.objectiveSeen = normalizeCount(next.objectiveSeen || next.quizSeen);
    next.objectiveCorrect = normalizeCount(next.objectiveCorrect || next.quizCorrect);
    next.objectiveWrong = normalizeCount(next.objectiveWrong || next.quizWrong);
    next.spellingSeen = normalizeCount(next.spellingSeen);
    next.spellingCorrect = normalizeCount(next.spellingCorrect);
    next.spellingWrong = normalizeCount(next.spellingWrong);
    next.successDates = normalizeStringList(next.successDates);
    next.successTypes = normalizeStringList(next.successTypes);
    next.confusions = Array.isArray(next.confusions) ? next.confusions.slice(-12) : [];
    next.errorTypes = next.errorTypes && typeof next.errorTypes === 'object' ? next.errorTypes : {};
    next.retention24 = normalizeRetention(next.retention24);
    next.retention7 = normalizeRetention(next.retention7);
    next.selfRatings = Object.assign({ again: 0, fuzzy: 0, known: 0 }, next.selfRatings || {});
    ['again', 'fuzzy', 'known'].forEach(function (rating) {
      next.selfRatings[rating] = normalizeCount(next.selfRatings[rating]);
    });
    if (!Array.isArray(next.books) || (next.seen && next.books.length === 0)) {
      next.books = next.seen ? [fallbackBook] : [];
    }
    if (typeof next.favorite !== 'boolean') next.favorite = false;
    if (next.seen && next.firstStudiedAt == null) {
      next.firstStudiedAt = next.firstSeen || next.lastReviewed || null;
    }
    return next;
  }

  function normalizeActivityDay(day) {
    const next = day && typeof day === 'object' ? day : {};
    next.attempts = normalizeCount(next.attempts);
    next.correct = normalizeCount(next.correct);
    next.seconds = normalizeCount(next.seconds);
    next.learned = Array.isArray(next.learned) ? next.learned : [];
    next.reviewed = Array.isArray(next.reviewed) ? next.reviewed : [];
    next.objectiveAttempts = normalizeCount(next.objectiveAttempts);
    next.objectiveCorrect = normalizeCount(next.objectiveCorrect);
    next.retention24Seen = normalizeCount(next.retention24Seen);
    next.retention24Correct = normalizeCount(next.retention24Correct);
    next.retention7Seen = normalizeCount(next.retention7Seen);
    next.retention7Correct = normalizeCount(next.retention7Correct);
    next.selfRatings = Object.assign({ again: 0, fuzzy: 0, known: 0 }, next.selfRatings || {});
    next.questionTypes = next.questionTypes && typeof next.questionTypes === 'object' ? next.questionTypes : {};
    return next;
  }

  function normalizeState(raw, options) {
    const opts = options || {};
    const defaultBook = opts.defaultBook || 'gaokao';
    const knownBookIds = Array.isArray(opts.knownBookIds) && opts.knownBookIds.length
      ? opts.knownBookIds
      : [defaultBook];
    const base = createDefaultState({
      defaultBook: defaultBook,
      now: opts.now
    });
    const saved = raw && typeof raw === 'object' ? raw : {};
    const warnings = [];
    const savedVersion = Number(saved.version || (saved.meta && saved.meta.schema) || 1);
    const profile = Object.assign({}, base.profile, saved.profile || {});
    const savedGoal = Math.round(Number(profile.dailyGoal));
    if (!Number.isFinite(savedGoal) || savedGoal < MIN_DAILY_GOAL || savedGoal > MAX_DAILY_GOAL) {
      profile.dailyGoal = base.profile.dailyGoal;
      warnings.push('dailyGoal');
    } else {
      profile.dailyGoal = savedGoal;
    }
    if (profile.voiceGender !== 'male' && profile.voiceGender !== 'female') {
      profile.voiceGender = 'female';
    }
    const voiceRate = Number(profile.voiceRate);
    profile.voiceRate = Number.isFinite(voiceRate) ? clamp(voiceRate, 0.7, 1.15) : 0.9;
    const retention = Number(profile.targetRetention);
    profile.targetRetention = Number.isFinite(retention) ? clamp(retention, 0.75, 0.95) : TARGET_RETENTION;
    if (!profile.activeBook || knownBookIds.indexOf(profile.activeBook) === -1) {
      profile.activeBook = defaultBook;
      warnings.push('activeBook');
    }
    const words = {};
    const savedWords = saved.words && typeof saved.words === 'object' ? saved.words : {};
    Object.keys(savedWords).forEach(function (id) {
      words[id] = normalizeRecord(savedWords[id], profile.activeBook);
    });
    const activity = {};
    const savedActivity = saved.activity && typeof saved.activity === 'object' ? saved.activity : {};
    Object.keys(savedActivity).forEach(function (key) {
      activity[key] = normalizeActivityDay(savedActivity[key]);
    });
    const meta = Object.assign({}, base.meta, saved.meta || {});
    meta.schema = SCHEMA_VERSION;
    meta.revision = Math.max(0, Number(meta.revision) || 0);
    meta.writerId = meta.writerId || null;
    meta.integrity = meta.integrity || null;
    const state = Object.assign({}, saved, {
      version: SCHEMA_VERSION,
      profile: profile,
      words: words,
      activity: activity,
      bookSeeds: saved.bookSeeds && typeof saved.bookSeeds === 'object' ? saved.bookSeeds : {},
      meta: meta
    });
    return {
      state: state,
      migratedFrom: savedVersion,
      migrated: savedVersion !== SCHEMA_VERSION,
      warnings: warnings
    };
  }

  global.ShiciModules = global.ShiciModules || {};
  global.ShiciModules.StateSchema = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    MIN_DAILY_GOAL: MIN_DAILY_GOAL,
    MAX_DAILY_GOAL: MAX_DAILY_GOAL,
    TARGET_RETENTION: TARGET_RETENTION,
    createDefaultState: createDefaultState,
    blankRecord: blankRecord,
    normalizeCount: normalizeCount,
    normalizeStringList: normalizeStringList,
    normalizeRetention: normalizeRetention,
    normalizeRecord: normalizeRecord,
    normalizeActivityDay: normalizeActivityDay,
    normalizeState: normalizeState
  };
})(typeof window !== 'undefined' ? window : globalThis);
