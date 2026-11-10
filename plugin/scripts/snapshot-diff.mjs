#!/usr/bin/env node
// Diff two figmaWP snapshots (see reference/snapshot.md for the format).
//
//   node snapshot-diff.mjs <previous.json> <current.json> [--json]
//
// Snapshots are keyed maps per section: variables, textStyles, components, frames, assets.
// Each entry has a stable key (Figma id) and a "hash"-able body. Output lists
// added / removed / changed keys per section, with the changed fields.
// Exit code: 0 = no changes, 2 = changes found, 1 = error.

import { readFileSync } from 'node:fs';

const SECTIONS = ['variables', 'textStyles', 'components', 'frames', 'assets'];

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

export function diffSnapshots(prev, curr) {
  const result = { changed: false, sections: {} };
  for (const section of SECTIONS) {
    const p = prev?.[section] ?? {}, c = curr?.[section] ?? {};
    const added = Object.keys(c).filter((k) => !(k in p));
    const removed = Object.keys(p).filter((k) => !(k in c));
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

function printHuman(diff) {
  if (!diff.changed) return console.log('No changes since the last snapshot.');
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const [prevPath, currPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!prevPath || !currPath) {
    console.error('Usage: snapshot-diff.mjs <previous.json> <current.json> [--json]');
    process.exit(1);
  }
  try {
    const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
    const diff = diffSnapshots(read(prevPath), read(currPath));
    process.argv.includes('--json') ? console.log(JSON.stringify(diff, null, 2)) : printHuman(diff);
    process.exit(diff.changed ? 2 : 0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
