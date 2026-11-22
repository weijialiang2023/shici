const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(ROOT, 'js/domain/srs-engine.js'), 'utf8');
const sandbox = { console, Date, Math, JSON };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'js/domain/srs-engine.js' });
const SRS = sandbox.ShiciModules.SRSEngine;
const plain = value => JSON.parse(JSON.stringify(value));

test('new-card ratings keep the existing first intervals', () => {
  assert.deepEqual(plain(SRS.dueForSelfRating(null, 'again', { today: '2026-11-22' })), {
    due: '2026-11-22', days: 0, stage: 0, label: '今天稍后'
  });
  assert.deepEqual(plain(SRS.dueForSelfRating(null, 'fuzzy', { today: '2026-11-22' })), {
    due: '2026-11-23', days: 1, stage: 1, label: '明天'
  });
  assert.deepEqual(plain(SRS.dueForSelfRating(null, 'known', { today: '2026-11-22' })), {
    due: '2026-11-25', days: 3, stage: 2, label: '3 天后'
  });
});

test('verified mastery requires three dates, two types, and a seven-day success', () => {
  assert.equal(SRS.hasVerifiedMastery({
    successDates: ['2026-11-01', '2026-11-02'],
    successTypes: ['meaning', 'context'],
    lastObjectiveIntervalDays: 8
  }), false);
  assert.equal(SRS.hasVerifiedMastery({
    successDates: ['2026-11-01', '2026-11-02', '2026-11-10'],
    successTypes: ['meaning'],
    lastObjectiveIntervalDays: 8
  }), false);
  assert.equal(SRS.hasVerifiedMastery({
    successDates: ['2026-11-01', '2026-11-02', '2026-11-10'],
    successTypes: ['meaning', 'context'],
    lastObjectiveIntervalDays: 6
  }), false);
  assert.equal(SRS.hasVerifiedMastery({
    successDates: ['2026-11-01', '2026-11-02', '2026-11-10'],
    successTypes: ['meaning', 'context'],
    lastObjectiveIntervalDays: 7
  }), true);
});

test('due and stage rules remain deterministic', () => {
  assert.equal(SRS.isDue({ seen: 1, due: '2026-11-22' }, '2026-11-22'), true);
  assert.equal(SRS.isDue({ seen: 1, due: '2026-11-23' }, '2026-11-22'), false);
  assert.equal(SRS.nextStageFor('known', 2, false), 3);
  assert.equal(SRS.nextStageFor('fuzzy', 4, false), 3);
  assert.equal(SRS.nextStageFor('again', 7, false), 0);
});
