#!/usr/bin/env node
// Encode exported PNG masters for the web (see reference/image-pipeline.md).
//
//   node encode-images.mjs --profile <theme>/.figmawp/profile.json <file.png> […]
//   node encode-images.mjs --encoder "avifenc -s 6 …" --out <dir> <file.png> […]
//
// The encoder command comes from profile.images.encoder (or --encoder). Its words are split on
// spaces (no quoting); "{in}" and "{out}" are replaced by the paths, otherwise "<in> <out>" are
// appended. The output extension follows the encoder: avifenc → .avif, cwebp → .webp (written
// as "cwebp … {in} -o {out}"), anything else needs --ext. A null encoder copies the PNG as is.
// Output goes to profile.images.compressed (relative to the child theme root) or --out.
// Prints one line per file with sizes. Exit 1 on any failure (missing encoder, bad input).

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

const EXT = { avifenc: 'avif', cwebp: 'webp', 'cjpeg': 'jpg', 'cjpegli': 'jpg' };

export function buildCommand(encoder, input, output) {
  const words = encoder.trim().split(/\s+/);
  const hasPlaceholders = words.some((w) => w.includes('{in}') || w.includes('{out}'));
  const args = words.slice(1).map((w) => w.replaceAll('{in}', input).replaceAll('{out}', output));
  if (!hasPlaceholders) args.push(input, output);
  return { cmd: words[0], args };
}

export function outputExtension(encoder, override) {
  if (override) return override.replace(/^\./, '');
  if (encoder == null) return 'png';
  const ext = EXT[basename(encoder.trim().split(/\s+/)[0])];
  if (!ext) throw new Error(`Can't tell the output type of "${encoder.split(/\s+/)[0]}": pass --ext.`);
  return ext;
}

const kb = (n) => `${Math.round(n / 1024)} KB`;

export function encode(files, { encoder, outDir, ext }) {
  const results = [];
  mkdirSync(outDir, { recursive: true });
  for (const file of files) {
    if (!existsSync(file)) throw new Error(`Missing ${file}`);
    const out = join(outDir, `${basename(file, extname(file))}.${outputExtension(encoder, ext)}`);
    if (encoder == null) {
      copyFileSync(file, out);
    } else {
      const { cmd, args } = buildCommand(encoder, file, out);
      const r = spawnSync(cmd, args, { encoding: 'utf8' });
      if (r.error?.code === 'ENOENT') throw new Error(`Encoder "${cmd}" not found. Install it (avifenc: brew install libavif; cwebp: brew install webp) or change images.encoder.`);
      if (r.status !== 0 || !existsSync(out)) throw new Error(`${cmd} failed for ${file}: ${(r.stderr || r.stdout).trim().split('\n').pop()}`);
    }
    results.push({ in: file, out, before: statSync(file).size, after: statSync(out).size });
  }
  return results;
}

function option(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  try {
    const profilePath = option(args, '--profile');
    let encoder = option(args, '--encoder');
    let outDir = option(args, '--out');
    let ext = option(args, '--ext');
    if (profilePath) {
      const images = JSON.parse(readFileSync(profilePath, 'utf8')).images ?? {};
      const themeRoot = resolve(dirname(profilePath), '..');
      if (encoder === undefined) encoder = images.encoder ?? null;
      if (outDir === undefined) outDir = join(themeRoot, images.compressed ?? 'assets/images/compressed');
      if (ext === undefined && images.format) ext = images.format;
    }
    if (!outDir || !args.length) {
      console.error('Usage: encode-images.mjs (--profile <profile.json> | --encoder "<cmd>" --out <dir>) [--ext avif] <file.png> […]');
      process.exit(1);
    }
    for (const r of encode(args, { encoder: encoder ?? null, outDir, ext })) {
      console.log(`${basename(r.in)} ${kb(r.before)} → ${basename(r.out)} ${kb(r.after)}`);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
