import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSnapshots, mergeSnapshots } from './snapshot-diff.mjs';

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

// Images (0.2.0)
const img = (over = {}) => ({
  name: 'Header / Incentives', frame: '20:1', size: [1440, 560], imageHash: 'aaa', scaleMode: 'FILL',
  transform: [[1, 0, 0], [0, 1, 0]], rotation: 0, filters: {}, otherFills: ['SHADER'], ...over,
});

test('images: same structure, new imageHash is a change', () => {
  const a = { frames: { '20:1': { name: 'Incentives', tree: 'wp:cover' } }, images: { '20:5': img() } };
  const b = structuredClone(a);
  b.images['20:5'].imageHash = 'bbb';
  const d = diffSnapshots(a, b);
  assert.equal(d.changed, true);
  assert.equal(d.sections.frames, undefined);
  assert.deepEqual(d.sections.images.changed[0].fields, [{ path: 'imageHash', from: 'aaa', to: 'bbb' }]);
});

test('images: a re-graded photo (filters) and a new crop are changes', () => {
  const a = { images: { '20:5': img() } };
  const graded = { images: { '20:5': img({ filters: { exposure: 0.2 } }) } };
  const cropped = { images: { '20:5': img({ transform: [[0.8, 0, 0.1], [0, 1, 0]] }) } };
  assert.equal(diffSnapshots(a, graded).sections.images.changed[0].fields[0].path, 'filters.exposure');
  assert.equal(diffSnapshots(a, cropped).sections.images.changed[0].fields[0].path, 'transform');
});

// Scoped snapshots
const full = {
  variables: { v1: { name: 'color/primary', values: { Default: '#000' } } },
  frames: { '20:1': { name: 'Incentives', tree: 'wp:cover' }, '30:1': { name: 'Home', tree: 'wp:group' } },
  images: { '20:5': img(), '30:5': img({ frame: '30:1', name: 'Home hero' }) },
};

test('scoped diff ignores keys outside the scope', () => {
  const scoped = { scope: ['20:1'], frames: { '20:1': full.frames['20:1'] }, images: { '20:5': full.images['20:5'] } };
  assert.equal(diffSnapshots(full, scoped, { scoped: true }).changed, false);
  assert.equal(diffSnapshots(full, scoped).changed, true, 'without --scope everything else looks removed');
});

test('scoped diff still finds an image removed inside a scoped frame', () => {
  const scoped = { scope: ['20:1'], frames: { '20:1': full.frames['20:1'] } };
  const d = diffSnapshots(full, scoped, { scoped: true });
  assert.deepEqual(d.sections.images.removed, [{ key: '20:5', name: 'Header / Incentives' }]);
  assert.equal(d.sections.frames, undefined);
});

test('merge replaces scoped keys and keeps the rest', () => {
  const scoped = { scope: ['20:1'], takenAt: 'T2', frames: { '20:1': full.frames['20:1'] }, images: { '20:5': img({ imageHash: 'new' }) } };
  const m = mergeSnapshots(full, scoped);
  assert.equal(m.images['20:5'].imageHash, 'new');
  assert.equal(m.images['30:5'].imageHash, 'aaa');
  assert.ok(m.frames['30:1']);
  assert.ok(m.variables.v1);
  assert.equal(m.takenAt, 'T2');
  assert.equal(m.scope, undefined);
  const dropped = mergeSnapshots(full, { scope: ['20:1'], frames: { '20:1': full.frames['20:1'] } });
  assert.equal(dropped.images['20:5'], undefined, 'an image removed inside the scope is dropped');
  assert.ok(dropped.images['30:5']);
});
