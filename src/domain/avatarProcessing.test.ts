import { describe, expect, it } from 'vitest';

import {
  ALLOWED_AVATAR_MIME_TYPES,
  buildAvatarUploadDescriptor,
  computeCenterCrop,
  detectAvatarMime,
  EMPTY_AVATAR_SOURCE,
  isAllowedMime,
  MIN_AVATAR_SIDE_PX,
  resizePlan,
  validateUpload,
} from './avatarProcessing';

describe('detectAvatarMime', () => {
  it('recognizes supported magic bytes', () => {
    expect(detectAvatarMime([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).toBe('image/png');
    expect(detectAvatarMime([0xff, 0xd8, 0xff, 0xe0])).toBe('image/jpeg');
    expect(detectAvatarMime([...Buffer.from('RIFF????WEBP', 'latin1')])).toBe('image/webp');
    expect(detectAvatarMime([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])).toBe('image/avif');
  });

  it('returns null for unsupported bytes', () => {
    expect(detectAvatarMime([0, 1, 2, 3])).toBeNull();
    expect(detectAvatarMime([])).toBeNull();
  });
});

describe('isAllowedMime', () => {
  it('accepts only the supported set', () => {
    for (const mime of ALLOWED_AVATAR_MIME_TYPES) expect(isAllowedMime(mime)).toBe(true);
    expect(isAllowedMime('image/gif')).toBe(false);
    expect(isAllowedMime('application/octet-stream')).toBe(false);
  });
});

describe('validateUpload', () => {
  it('accepts a small supported image', () => {
    expect(validateUpload('image/png', 4096)).toEqual({ ok: true, mime: 'image/png', bytes: 4096 });
  });

  it('rejects unsupported mime', () => {
    expect(validateUpload('image/gif', 100)).toEqual({ ok: false, reason: 'unsupported-mime' });
  });

  it('rejects empty and oversized buffers', () => {
    expect(validateUpload('image/jpeg', 0)).toEqual({ ok: false, reason: 'too-large' });
    expect(validateUpload('image/jpeg', Number.NaN)).toEqual({ ok: false, reason: 'too-large' });
    expect(validateUpload('image/jpeg', 8 * 1024 * 1024 + 1)).toEqual({ ok: false, reason: 'too-large' });
  });
});

describe('computeCenterCrop', () => {
  it('centers on the smaller edge and caps the final side', () => {
    const crop = computeCenterCrop(2000, 800, 1024);
    expect(crop.cropSize).toBe(800);
    expect(crop.offsetX).toBe(600);
    expect(crop.offsetY).toBe(0);
    expect(crop.targetSize).toBe(800);
  });

  it('caps the final side at the maximum even for large source', () => {
    const crop = computeCenterCrop(4000, 4000, 1024);
    expect(crop.cropSize).toBe(1024);
    expect(crop.targetSize).toBe(1024);
  });

  it('never drops below the enforced minimum side', () => {
    const crop = computeCenterCrop(1, 1, 1024);
    expect(crop.targetSize).toBe(MIN_AVATAR_SIDE_PX);
  });
});

describe('resizePlan', () => {
  it('scales a crop to a square bounded by the requested side', () => {
    expect(resizePlan(computeCenterCrop(2000, 800), 512)).toEqual({ width: 512, height: 512 });
    expect(resizePlan(computeCenterCrop(200, 200), 1024)).toEqual({ width: 200, height: 200 });
  });
});

describe('buildAvatarUploadDescriptor', () => {
  it('produces a square descriptor from the resize plan', () => {
    const descriptor = buildAvatarUploadDescriptor('av_1', 2, 'image/webp', 2048, 2000, 800, 1024);
    expect(descriptor.avatarId).toBe('av_1');
    expect(descriptor.version).toBe(2);
    expect(descriptor.mime).toBe('image/webp');
    expect(descriptor.bytes).toBe(2048);
    expect(descriptor.width).toBe(800);
    expect(descriptor.height).toBe(800);
  });

  it('handles an unmeasurable source via the empty baseline', () => {
    const descriptor = buildAvatarUploadDescriptor('av_2', 1, 'image/jpeg', 10, 1, 1);
    expect(descriptor.width).toBe(MIN_AVATAR_SIDE_PX);
    expect(descriptor.height).toBe(MIN_AVATAR_SIDE_PX);
    expect(EMPTY_AVATAR_SOURCE).toEqual({ width: 1, height: 1 });
  });
});
