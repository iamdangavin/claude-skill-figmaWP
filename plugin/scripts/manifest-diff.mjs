#!/usr/bin/env node
// Compare content manifests (php/content-manifest.php) to see what changed since the last pull.
//
//   node manifest-diff.mjs <base.json> <source-now.json> <target-now.json> [--json]
//
// base   = the source's manifest saved at the last pull (.figmawp/pull/<source>-manifest.json).
//          After a full pull, source and target were identical, so base describes both.
// Every key ("<type>:<path>") is classified:
//   source-changed  changed (or added/removed) on the source only → offer to bring it over
//   target-changed  changed on the target only (local work)       → left alone
//   conflict        changed on both, differently                  → ask: keep target / take source / skip
//   same-change     changed on both to the same content           → nothing to do
// Exit code: 0 = nothing changed anywhere, 2 = changes found, 1 = error.

import { readFileSync } from 'node:fs';

const kindOf = (before, now) => {
  if (!before && !now) return null;
  if (!before) return 'added';
  if (!now) return 'removed';
  return before.hash === now.hash ? null : 'changed';
};

export function diffManifests(base, source, target) {
  const b = base?.entries ?? {}, s = source?.entries ?? {}, t = target?.entries ?? {};
  const out = { 'source-changed': [], 'target-changed': [], conflict: [], 'same-change': [] };
  const keys = [...new Set([...Object.keys(b), ...Object.keys(s), ...Object.keys(t)])].sort();
  for (const key of keys) {
    const ks = kindOf(b[key], s[key]);
    const kt = kindOf(b[key], t[key]);
    if (!ks && !kt) continue;
    const item = {
      key,
      type: (s[key] ?? t[key] ?? b[key]).type,
      title: (s[key] ?? t[key] ?? b[key]).title,
      source: ks, target: kt,
      sourceModified: s[key]?.modified ?? null, targetModified: t[key]?.modified ?? null,
    };
    if (ks && !kt) out['source-changed'].push(item);
    else if (kt && !ks) out['target-changed'].push(item);
    else if (s[key]?.hash === t[key]?.hash) out['same-change'].push(item);
    else out.conflict.push(item);
  }
  out.changed = Object.values(out).some((l) => Array.isArray(l) && l.length);
  return out;
}

function printHuman(d, labels) {
  if (!d.changed) return console.log('Nothing changed on either side since the last pull.');
  const sections = [
    ['source-changed', `Changed on ${labels.source} only (can be brought over)`],
    ['conflict', `Changed on both (${labels.source} and ${labels.target}): needs a decision`],
    ['target-changed', `Changed on ${labels.target} only (kept as is)`],
    ['same-change', 'Changed the same way on both (nothing to do)'],
  ];
  for (const [k, title] of sections) {
    if (!d[k].length) continue;
    console.log(`\n## ${title}: ${d[k].length}`);
    for (const i of d[k]) console.log(`  ${i.key}  "${i.title}"  source: ${i.source ?? '-'}  target: ${i.target ?? '-'}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length !== 3) {
    console.error('Usage: manifest-diff.mjs <base.json> <source-now.json> <target-now.json> [--json]');
    process.exit(1);
  }
  try {
    const [base, source, target] = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
    const d = diffManifests(base, source, target);
    args.includes('--json') ? console.log(JSON.stringify(d, null, 2)) : printHuman(d, { source: source.site ?? 'source', target: target.site ?? 'target' });
    process.exit(d.changed ? 2 : 0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
