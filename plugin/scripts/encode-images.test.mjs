import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { buildCommand, outputExtension, encode } from './encode-images.mjs';

// A valid 8×8 grey PNG, built by hand so the test needs no image tools.
function tinyPng() {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const rows = Buffer.concat(Array.from({ length: 8 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(24, 128)])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('command: appends in/out, or fills placeholders', () => {
  assert.deepEqual(buildCommand('avifenc -s 6', 'a.png', 'a.avif'), { cmd: 'avifenc', args: ['-s', '6', 'a.png', 'a.avif'] });
  assert.deepEqual(buildCommand('cwebp -q 80 {in} -o {out}', 'a.png', 'a.webp'), { cmd: 'cwebp', args: ['-q', '80', 'a.png', '-o', 'a.webp'] });
});

test('extension follows the encoder', () => {
  assert.equal(outputExtension('avifenc -s 6'), 'avif');
  assert.equal(outputExtension('/opt/homebrew/bin/cwebp {in} -o {out}'), 'webp');
  assert.equal(outputExtension(null), 'png');
  assert.equal(outputExtension('magick {in} {out}', 'jpg'), 'jpg');
  assert.throws(() => outputExtension('magick {in} {out}'));
});

test('null encoder copies the PNG', () => {
  const dir = mkdtempSync(join(tmpdir(), 'figmawp-enc-'));
  writeFileSync(join(dir, 'x.png'), tinyPng());
  const [r] = encode([join(dir, 'x.png')], { encoder: null, outDir: join(dir, 'out') });
  assert.ok(existsSync(r.out));
  assert.equal(r.before, r.after);
});

test('missing encoder is a clear error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'figmawp-enc-'));
  writeFileSync(join(dir, 'x.png'), tinyPng());
  assert.throws(() => encode([join(dir, 'x.png')], { encoder: 'no-such-encoder-xyz', outDir: dir, ext: 'avif' }), /not found/);
});

const hasAvifenc = spawnSync('avifenc', ['--version']).status === 0;
test('avifenc encodes a PNG', { skip: !hasAvifenc && 'avifenc not installed' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'figmawp-enc-'));
  writeFileSync(join(dir, 'hero.png'), tinyPng());
  const [r] = encode([join(dir, 'hero.png')], { encoder: 'avifenc -s 10 -y 420', outDir: join(dir, 'compressed') });
  assert.match(r.out, /compressed\/hero\.avif$/);
  assert.ok(r.after > 0);
});
