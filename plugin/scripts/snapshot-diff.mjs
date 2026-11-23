#!/usr/bin/env node
// Diff two figmaWP snapshots (see reference/snapshot.md for the format).
//
//   node snapshot-diff.mjs <previous.json> <current.json> [--json] [--scope]
//   node snapshot-diff.mjs <previous.json> <scoped.json> --merge <out.json>
//
// Snapshots are keyed maps per section: variables, textStyles, components, frames, assets, images.
// Each entry has a stable key (Figma id) and a "hash"-able body. Output lists
// added / removed / changed keys per section, with the changed fields.
//
// --scope  the current snapshot covers only part of the file (its "scope" array of node ids).
//          A previous key counts as removed only when the key or its `frame` is in scope;
//          variables and text styles are never reported removed.
// --merge  write <previous> with the scoped snapshot's keys replaced (other keys kept) to <out>.
//
// A missing <previous> file is treated as an empty snapshot.
// Exit code: 0 = no changes (or merge written), 2 = changes found, 1 = error.

import { readFileSync, writeFileSync } from 'node:fs';

export const SECTIONS = ['variables', 'textStyles', 'components', 'frames', 'assets', 'images'];
const SHARED = new Set(['variables', 'textStyles']);

export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function changedFields(a, b, prefix = '') {
  const out = [];
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    const path = prefix ? `${prefix}.${k}` : k;
    const av = a?.[k], bv = b?.[k];
    if (stable(av) === stable(bv)) continue;
    const bothObjects = av && bv && typeof av === 'object' && typeof bv === 'object' && !Array.isArray(av) && !Array.isArray(bv);
    if (bothObjects) out.push(...changedFields(av, bv, path));
    else out.push({ path, from: av, to: bv });
  }
  return out;
}

function inScope(scope, section, key, entry) {
  if (!scope) return true;
  if (SHARED.has(section)) return false;
  return scope.has(key) || (entry?.frame != null && scope.has(entry.frame));
}

export function diffSnapshots(prev, curr, { scoped = false } = {}) {
  const scope = scoped ? new Set(curr?.scope ?? []) : null;
  const result = { changed: false, sections: {} };
  if (scope) result.scope = [...scope];
  for (const section of SECTIONS) {
    const p = prev?.[section] ?? {}, c = curr?.[section] ?? {};
    const added = Object.keys(c).filter((k) => !(k in p));
    const removed = Object.keys(p).filter((k) => !(k in c) && inScope(scope, section, k, p[k]));
    const changed = Object.keys(c)
      .filter((k) => k in p && stable(p[k]) !== stable(c[k]))
      .map((k) => ({ key: k, name: c[k].name ?? p[k].name, fields: changedFields(p[k], c[k]) }));
    if (added.length || removed.length || changed.length) {
      result.changed = true;
      result.sections[section] = {
        added: added.map((k) => ({ key: k, name: c[k].name })),
        removed: removed.map((k) => ({ key: k, name: p[k].name })),
        changed,
      };
    }
  }
  return result;
}

// prev with the scoped snapshot's keys replaced, and in-scope keys it no longer has removed.
export function mergeSnapshots(prev, scopedSnap) {
  const scope = new Set(scopedSnap.scope ?? []);
  const out = structuredClone(prev ?? {});
  for (const section of SECTIONS) {
    const p = out[section] ?? {}, c = scopedSnap[section] ?? {};
    for (const k of Object.keys(p)) if (!(k in c) && inScope(scope, section, k, p[k])) delete p[k];
    Object.assign(p, structuredClone(c));
    if (Object.keys(p).length) out[section] = p;
    else delete out[section];
  }
  for (const k of ['schemaVersion', 'fileKey']) if (scopedSnap[k] != null && out[k] == null) out[k] = scopedSnap[k];
  if (scopedSnap.takenAt) out.takenAt = scopedSnap.takenAt;
  delete out.scope;
  return out;
}

function printHuman(diff) {
  const where = diff.scope ? ` in scope (${diff.scope.join(', ')})` : ' since the last snapshot';
  if (!diff.changed) return console.log(`No changes${where}.`);
  if (diff.scope) console.log(`Scope: ${diff.scope.join(', ')}`);
  for (const [section, d] of Object.entries(diff.sections)) {
    console.log(`\n## ${section}`);
    for (const a of d.added) console.log(`  + ${a.name ?? a.key}`);
    for (const r of d.removed) console.log(`  - ${r.name ?? r.key}`);
    for (const ch of d.changed) {
      console.log(`  ~ ${ch.name ?? ch.key}`);
      for (const f of ch.fields) console.log(`      ${f.path}: ${JSON.stringify(f.from)} → ${JSON.stringify(f.to)}`);
    }
  }
}

function readSnapshot(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const mergeAt = args.indexOf('--merge');
  const mergeOut = mergeAt >= 0 ? args[mergeAt + 1] : null;
  const [prevPath, currPath] = args.filter((a, i) => !a.startsWith('--') && (mergeAt < 0 || i !== mergeAt + 1));
  if (!prevPath || !currPath || (mergeAt >= 0 && !mergeOut)) {
    console.error('Usage: snapshot-diff.mjs <previous.json> <current.json> [--json] [--scope]\n       snapshot-diff.mjs <previous.json> <scoped.json> --merge <out.json>');
    process.exit(1);
  }
  try {
    const prev = readSnapshot(prevPath), curr = readSnapshot(currPath);
    if (mergeOut) {
      if (!Array.isArray(curr.scope)) throw new Error(`${currPath} has no "scope" array; only scoped snapshots are merged.`);
      writeFileSync(mergeOut, `${JSON.stringify(mergeSnapshots(prev, curr), null, 2)}\n`);
      console.log(`Merged ${curr.scope.length} scoped node(s) into ${mergeOut}.`);
      process.exit(0);
    }
    const diff = diffSnapshots(prev, curr, { scoped: flags.has('--scope') });
    flags.has('--json') ? console.log(JSON.stringify(diff, null, 2)) : printHuman(diff);
    process.exit(diff.changed ? 2 : 0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
