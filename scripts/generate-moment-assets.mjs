#!/usr/bin/env node
/**
 * Generates the original local table-moment media assets: one short WAV per
 * reaction and one flat sticker PNG per reaction, written under
 * assets/sounds/ and assets/stickers/. Deterministic (no randomness), so the
 * output is byte-stable across runs and can be committed.
 *
 * The WAVs are simple synthesized melodic blips (16-bit PCM, 22.05 kHz) and
 * the stickers are flat round badges drawn with signed-distance geometry.
 * Neither is fetched from any URL at runtime: Metro bundles the generated
 * files as local assets and the app requires them by path.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOUND_DIR = join(ROOT, 'assets', 'sounds');
const STICKER_DIR = join(ROOT, 'assets', 'stickers');
mkdirSync(SOUND_DIR, { recursive: true });
mkdirSync(STICKER_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// WAV synthesis
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 22050;

function note(frequency, startSeconds, durationSeconds, volume = 0.5) {
  return { frequency, startSeconds, durationSeconds, volume };
}

function synthesize(pieces, totalSeconds) {
  const total = Math.ceil(totalSeconds * SAMPLE_RATE);
  const samples = new Float32Array(total);
  const ramp = 0.008; // 8 ms attack/release, click-free
  for (const piece of pieces) {
    const start = Math.floor(piece.startSeconds * SAMPLE_RATE);
    const length = Math.floor(piece.durationSeconds * SAMPLE_RATE);
    for (let i = 0; i < length && start + i < total; i += 1) {
      const t = i / SAMPLE_RATE;
      const envelope = Math.min(1, i / (ramp * SAMPLE_RATE), (length - i) / (ramp * SAMPLE_RATE));
      samples[start + i] += Math.sin(2 * Math.PI * piece.frequency * t) * piece.volume * envelope;
    }
  }
  // Soft clip to [-1, 1].
  return samples.map((s) => Math.max(-1, Math.min(1, s)));
}

function writeWav(path, samples) {
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767);
    buffer.writeInt16LE(value, 44 + i * 2);
  }
  writeFileSync(path, buffer);
}

// Each reaction gets a distinct, short, pleasant blip.
const reactions = {
  // C5-E5-G5-C6 rising arpeggio.
  cheer: [note(523.25, 0, 0.10, 0.42), note(659.25, 0.09, 0.10, 0.42), note(783.99, 0.18, 0.10, 0.42), note(1046.5, 0.27, 0.22, 0.46)],
  // Quick upward gliss (two close high tones).
  surprised: [note(880, 0, 0.07, 0.44), note(1174.66, 0.06, 0.16, 0.44)],
  // Descending staccato triplet.
  laugh: [note(783.99, 0, 0.06, 0.4), note(659.25, 0.07, 0.06, 0.4), note(587.33, 0.14, 0.12, 0.4)],
  // Short fanfare: C-G-C.
  niceHand: [note(523.25, 0, 0.10, 0.4), note(783.99, 0.09, 0.10, 0.4), note(1046.5, 0.18, 0.26, 0.44)],
  // Single soft low tone.
  thinking: [note(392, 0, 0.26, 0.36)],
  // Descending minor dyad.
  disappointed: [note(392, 0, 0.12, 0.4), note(311.13, 0.11, 0.24, 0.4)],
  // Bold two-tone hit for the felt-wide all-in flash: a low thump then a
  // sustained bright fifth.
  allIn: [note(196, 0, 0.09, 0.5), note(392, 0.08, 0.10, 0.5), note(587.33, 0.17, 0.30, 0.55)],
};

for (const [name, pieces] of Object.entries(reactions)) {
  writeWav(join(SOUND_DIR, `${name}.wav`), synthesize(pieces, 0.6));
}

// ---------------------------------------------------------------------------
// Sticker synthesis (flat round badge with a glyph, 144 x 144 RGBA)
// ---------------------------------------------------------------------------

const SIZE = 144;

function writePng(path, pixels) {
  // PNG: 8-bit RGBA, non-interlaced. Chunks: IHDR, IDAT (zlib), IEND.
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  const crc32 = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const typeBuffer = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBuffer, data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 4 + body.length);
    return out;
  };
  // Filter type 0 per scanline.
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (SIZE * 4 + 1)] = 0;
    pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  writeFileSync(path, Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

const hex = (r, g, b) => [r, g, b];

function roundedBadgeAlpha(x, y, radius, border) {
  // Anti-aliased disc with a soft inner border ring.
  const distance = Math.hypot(x - SIZE / 2, y - SIZE / 2);
  const disc = clamp((radius - distance) / 1.5 + 0.5, 0, 1);
  const ring = clamp((distance - (radius - border)) / 1.5 + 0.5, 0, 1);
  return disc * (1 - ring);
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function heartShape(x, y, scale, cx, cy) {
  const nx = (x - cx) / scale;
  const ny = (y - cy) / scale;
  // Standard heart implicit curve.
  return Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * ny * ny * ny;
}

function starShape(x, y, scale, cx, cy, points = 5) {
  const nx = (x - cx) / scale;
  const ny = (y - cy) / scale;
  const angle = Math.atan2(ny, nx);
  const radius = Math.hypot(nx, ny);
  const spike = Math.cos((points * angle) / 2);
  return radius - (0.55 + 0.45 * spike);
}

function arcShape(x, y, scale, cx, cy, startAngle, endAngle, radius, thickness) {
  const nx = (x - cx) / scale;
  const ny = (y - cy) / scale;
  const distance = Math.hypot(nx, ny);
  const angle = Math.atan2(ny, nx);
  const inBand = clamp((radius - Math.abs(distance - radius)) / 0.08 + 0.5, 0, 1);
  const inSweep = angle >= startAngle && angle <= endAngle ? 1 : 0;
  void thickness;
  return inBand * inSweep;
}

function chevronShape(x, y, scale, cx, cy, offset) {
  const nx = (x - cx) / scale;
  const ny = (y - cy - offset) / scale;
  // Two ascending bars: |/ and |/ offset in y.
  const bar1 = Math.abs(ny + nx * 0.9) < 0.16 && nx > -1.0 && nx < 0.1 ? 1 : 0;
  const bar2 = Math.abs(ny + 0.42 + nx * 0.9) < 0.16 && nx > -1.0 && nx < 0.1 ? 1 : 0;
  return bar1 || bar2 ? 1 : 0;
}

function renderSticker(name, badgeColor, glyph) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const radius = SIZE / 2 - 6;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const alpha = roundedBadgeAlpha(x + 0.5, y + 0.5, radius, 10);
      const color = [...badgeColor, Math.round(alpha * 255)];
      const glyphAlpha = glyph(x + 0.5, y + 0.5) * alpha;
      const mixed = color.map((channel, i) => {
        if (i === 3) return Math.round(Math.max(alpha, glyphAlpha) * 255);
        return Math.round(channel * (1 - glyphAlpha) + 255 * glyphAlpha);
      });
      pixels.set(mixed, (y * SIZE + x) * 4);
    }
  }
  writePng(join(STICKER_DIR, `${name}.png`), pixels);
}

const smooth = (value) => clamp(value / 1.4 + 0.5, 0, 1);

renderSticker('cheer', hex(247, 185, 41), (x, y) => smooth(
  chevronShape(x, y, 30, SIZE / 2, SIZE / 2, 0),
));
renderSticker('surprised', hex(240, 132, 54), (x, y) => {
  const shaft = x > SIZE / 2 - 9 && x < SIZE / 2 + 9 && y > 34 && y < 84 ? 1 : 0;
  const dot = Math.hypot(x - SIZE / 2, y - 102) < 9 ? 1 : 0;
  return smooth(Math.max(shaft, dot));
});
renderSticker('laugh', hex(94, 178, 96), (x, y) => {
  const smile = arcShape(x, y, 34, SIZE / 2, SIZE / 2 + 12, Math.PI * 0.2, Math.PI * 0.8, 0.9, 0.12);
  const leftEye = Math.hypot(x - (SIZE / 2 - 22), y - (SIZE / 2 - 14)) < 6 ? 1 : 0;
  const rightEye = Math.hypot(x - (SIZE / 2 + 22), y - (SIZE / 2 - 14)) < 6 ? 1 : 0;
  return smooth(Math.max(smile, leftEye, rightEye));
});
renderSticker('niceHand', hex(64, 128, 214), (x, y) => smooth(
  starShape(x, y, 44, SIZE / 2, SIZE / 2),
));
renderSticker('thinking', hex(141, 132, 196), (x, y) => {
  const bubble = Math.hypot(x - SIZE / 2, y - SIZE / 2 + 4) < 38 ? 1 : 0;
  const dot1 = Math.hypot(x - (SIZE / 2 - 12), y - (SIZE / 2 + 4)) < 5 ? 1 : 0;
  const dot2 = Math.hypot(x - (SIZE / 2 + 13), y - (SIZE / 2 + 4)) < 5 ? 1 : 0;
  const dot3 = Math.hypot(x - (SIZE / 2 + 38), y - (SIZE / 2 + 4)) < 5 ? 1 : 0;
  return smooth(Math.max(bubble, dot1, dot2, dot3));
});
renderSticker('disappointed', hex(110, 132, 152), (x, y) => {
  const frown = arcShape(x, y, 34, SIZE / 2, SIZE / 2 + 30, Math.PI * 1.2, Math.PI * 1.8, 0.9, 0.12);
  const leftEye = Math.hypot(x - (SIZE / 2 - 22), y - (SIZE / 2 - 8)) < 6 ? 1 : 0;
  const rightEye = Math.hypot(x - (SIZE / 2 + 22), y - (SIZE / 2 - 8)) < 6 ? 1 : 0;
  return smooth(Math.max(frown, leftEye, rightEye));
});

console.log('Wrote 7 WAV sounds and 6 sticker PNGs.');
