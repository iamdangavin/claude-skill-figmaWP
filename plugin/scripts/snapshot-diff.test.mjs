import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSnapshots } from './snapshot-diff.mjs';

const base = {
  variables: { 'VariableID:1': { name: 'color/primary', values: { Default: '#0055ff' } } },
  frames: { '10:1': { name: 'Home', tree: 'wp:group>wp:columns' } },
};

test('no changes', () => {
  assert.equal(diffSnapshots(base, structuredClone(base)).changed, false);
});

test('key order does not matter', () => {
  const a = { variables: { v: { name: 'x', values: { a: 1, b: 2 } } } };
  const b = { variables: { v: { values: { b: 2, a: 1 }, name: 'x' } } };
  assert.equal(diffSnapshots(a, b).changed, false);
});

test('detects added, removed and changed fields', () => {
  const next = structuredClone(base);
  next.variables['VariableID:1'].values.Default = '#0044cc';
  next.variables['VariableID:2'] = { name: 'color/accent', values: { Default: '#ff0' } };
  delete next.frames['10:1'];
  const d = diffSnapshots(base, next);
  assert.equal(d.changed, true);
  assert.deepEqual(d.sections.variables.added, [{ key: 'VariableID:2', name: 'color/accent' }]);
  assert.deepEqual(d.sections.variables.changed[0].fields, [{ path: 'values.Default', from: '#0055ff', to: '#0044cc' }]);
  assert.deepEqual(d.sections.frames.removed, [{ key: '10:1', name: 'Home' }]);
});

test('missing previous snapshot treats everything as added', () => {
  const d = diffSnapshots({}, base);
  assert.equal(d.sections.variables.added.length, 1);
  assert.equal(d.sections.frames.added.length, 1);
});
