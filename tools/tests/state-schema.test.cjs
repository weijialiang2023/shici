const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(ROOT, 'js/domain/state-schema.js'), 'utf8');
const sandbox = { console, Date, Math, JSON };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'js/domain/state-schema.js' });
const Schema = sandbox.ShiciModules.StateSchema;
const plain = value => JSON.parse(JSON.stringify(value));
const options = {
  defaultBook: 'gaokao',
  knownBookIds: ['gaokao', 'curated', 'wenyan', 'ielts', 'cet4', 'cet6'],
  now: '2026-11-22T00:00:00.000Z'
};

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures', name), 'utf8'));
}

test('v1 state migrates to V3 without dropping unknown fields', () => {
  const input = fixture('state-v1.min.json');
  const result = Schema.normalizeState(input, options);
  const state = plain(result.state);
  assert.equal(result.migrated, true);
  assert.equal(result.migratedFrom, 1);
  assert.equal(state.version, 3);
  assert.equal(state.meta.schema, 3);
  assert.equal(state.profile.dailyGoal, 20);
  assert.equal(state.profile.activeBook, 'gaokao');
  assert.equal(state.profile.voiceGender, 'female');
  assert.equal(state.profile.voiceRate, 1.15);
  assert.equal(state.words.abandon.objectiveSeen, 3);
  assert.equal(state.words.abandon.objectiveCorrect, 2);
  assert.deepEqual(state.words.abandon.books, ['gaokao']);
  assert.equal(state.words.abandon.futureRecordField, 'keep-record');
  assert.equal(state.activity['2026-10-01'].legacyDuration, 54);
  assert.deepEqual(state.futureTopLevelField, { keep: true });
  assert.equal(result.warnings.includes('dailyGoal'), true);
  assert.equal(result.warnings.includes('activeBook'), true);
});

test('v2 state migration is idempotent and preserves meta extensions', () => {
  const input = fixture('state-v2.min.json');
  const first = Schema.normalizeState(input, options);
  const second = Schema.normalizeState(plain(first.state), options);
  assert.equal(first.migrated, true);
  assert.equal(first.migratedFrom, 2);
  assert.equal(second.migrated, false);
  assert.deepEqual(plain(second.state), plain(first.state));
  assert.equal(first.state.profile.activeBook, 'cet4');
  assert.equal(first.state.profile.targetRetention, 0.91);
  assert.equal(first.state.meta.futureMetaField, 'keep-meta');
  assert.deepEqual(plain(first.state.futureTopLevelField), ['v2', 'keep']);
  assert.deepEqual(plain(first.state.words.ability.futureRecordField), { keep: true });
});

test('default state keeps the established V3 top-level shape', () => {
  const state = Schema.createDefaultState({ defaultBook: 'gaokao', now: options.now });
  assert.deepEqual(Object.keys(state).sort(), [
    'activity', 'bookSeeds', 'meta', 'profile', 'version', 'words'
  ]);
  assert.equal(state.version, 3);
  assert.equal(state.meta.schema, 3);
  assert.equal(state.profile.activeBook, 'gaokao');
});
