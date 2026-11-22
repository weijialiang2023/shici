const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');

function loadScript(relative, sandbox) {
  const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: relative });
}

function createSandbox() {
  const sandbox = { console, Date, Math, JSON };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

test('stable stringify ignores object key insertion order', () => {
  const sandbox = createSandbox();
  loadScript('js/storage/state-integrity.js', sandbox);
  const integrity = sandbox.ShiciModules.StateIntegrity;
  assert.equal(
    integrity.stableStringify({ b: 2, a: { d: 4, c: 3 } }),
    integrity.stableStringify({ a: { c: 3, d: 4 }, b: 2 })
  );
});

test('checksum detects changed state and excludes its own field', () => {
  const sandbox = createSandbox();
  loadScript('js/storage/state-integrity.js', sandbox);
  const integrity = sandbox.ShiciModules.StateIntegrity;
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/state-v3.min.json'), 'utf8'));
  integrity.attach(fixture);
  assert.equal(integrity.verify(fixture).status, 'valid');
  fixture.words.abandon.seen = 2;
  assert.equal(integrity.verify(fixture).status, 'mismatch');
});

test('unsigned legacy states remain importable', () => {
  const sandbox = createSandbox();
  loadScript('js/storage/state-integrity.js', sandbox);
  const integrity = sandbox.ShiciModules.StateIntegrity;
  assert.equal(integrity.verify({ version: 3, words: {} }).status, 'unsigned');
});
