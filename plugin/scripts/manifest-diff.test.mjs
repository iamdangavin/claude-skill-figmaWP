import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffManifests } from './manifest-diff.mjs';

const e = (hash, title = 'T') => ({ type: 'page', title, hash, modified: '2026-11-20 10:00:00' });
const base = { entries: { 'page:about': e('a'), 'page:contact': e('c'), 'page:news': e('n') } };

test('nothing changed', () => {
  assert.equal(diffManifests(base, structuredClone(base), structuredClone(base)).changed, false);
});

test('classifies source-only, target-only, conflicts and same changes', () => {
  const source = structuredClone(base), target = structuredClone(base);
  source.entries['page:about'].hash = 'a2';       // edited on production
  target.entries['page:contact'].hash = 'c-local'; // edited on local
  source.entries['page:news'].hash = 'n2';         // edited on both, differently
  target.entries['page:news'].hash = 'n3';
  source.entries['page:events'] = e('ev');         // new on production
  target.entries['page:events'] = e('ev');         // …and the same page made on local
  delete source.entries['page:contact'];           // contact deleted on production too → conflict
  const d = diffManifests(base, source, target);
  assert.deepEqual(d['source-changed'].map((i) => i.key), ['page:about']);
  assert.deepEqual(d['target-changed'].map((i) => i.key), []);
  assert.deepEqual(d.conflict.map((i) => i.key).sort(), ['page:contact', 'page:news']);
  assert.deepEqual(d['same-change'].map((i) => i.key), ['page:events']);
  assert.equal(d.conflict.find((i) => i.key === 'page:contact').source, 'removed');
});

test('local-only work is reported but never offered', () => {
  const target = structuredClone(base);
  target.entries['page:draft-idea'] = e('x');
  const d = diffManifests(base, structuredClone(base), target);
  assert.deepEqual(d['target-changed'].map((i) => [i.key, i.target]), [['page:draft-idea', 'added']]);
  assert.equal(d['source-changed'].length, 0);
});
