import { describe, expect, it } from 'vitest';

import {
  ALLOWED_AVATAR_MIME_TYPES,
  buildAvatarUploadDescriptor,
  computeAdjustedCrop,
  computeCenterCrop,
  detectAvatarMime,
  EMPTY_AVATAR_SOURCE,
  IDENTITY_ADJUSTMENT,
  isAllowedMime,
  MAX_SOURCE_BYTES,
  MAX_SOURCE_PIXELS,
  MAX_SOURCE_SIDE_PX,
  MAX_UPLOAD_BYTES,
  MIN_AVATAR_SIDE_PX,
  orientationCorrection,
  resizePlan,
  resolveSourceIdentity,
  validateProcessedOutput,
  validateSource,
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

describe('resolveSourceIdentity (3.11B)', () => {
  it('treats the picker MIME as a hint and accepts iPhone-native containers', () => {
    expect(resolveSourceIdentity({ hintMime: 'image/heic' })).toEqual({ kind: 'image/heic', basis: 'hint' });
    expect(resolveSourceIdentity({ hintMime: 'image/heif' })).toEqual({ kind: 'image/heif', basis: 'hint' });
    // The common iOS alias.
    expect(resolveSourceIdentity({ hintMime: 'image/jpg' })).toEqual({ kind: 'image/jpeg', basis: 'hint' });
  });

  it('accepts missing and generic MIME instead of rejecting before decode', () => {
    expect(resolveSourceIdentity({})).toEqual({ kind: 'unknown', basis: 'unknown' });
    expect(resolveSourceIdentity({ hintMime: 'application/octet-stream' })).toEqual({ kind: 'unknown', basis: 'unknown' });
    expect(resolveSourceIdentity({ hintMime: '' })).toEqual({ kind: 'unknown', basis: 'unknown' });
  });

  it('falls back to the file extension when MIME is absent', () => {
    expect(resolveSourceIdentity({ fileExtension: 'HEIC' })).toEqual({ kind: 'image/heic', basis: 'extension' });
    expect(resolveSourceIdentity({ fileExtension: 'jpg' })).toEqual({ kind: 'image/jpeg', basis: 'extension' });
    expect(resolveSourceIdentity({ fileExtension: 'png' })).toEqual({ kind: 'image/png', basis: 'extension' });
  });

  it('lets magic bytes win over a wrong hint', () => {
    const jpegBytes = [0xff, 0xd8, 0xff, 0xe0];
    expect(resolveSourceIdentity({ hintMime: 'image/png', magicBytes: jpegBytes })).toEqual({ kind: 'image/jpeg', basis: 'magic' });
    const heicBytes = [...Buffer.from('....ftypheic', 'latin1')];
    expect(resolveSourceIdentity({ hintMime: undefined, magicBytes: heicBytes })).toEqual({ kind: 'image/heic', basis: 'magic' });
    const heifBytes = [...Buffer.from('....ftypmif1', 'latin1')];
    expect(resolveSourceIdentity({ magicBytes: heifBytes })).toEqual({ kind: 'image/heif', basis: 'magic' });
  });
});

describe('validateSource (3.11B)', () => {
  it('accepts ordinary phone sources including HEIC/HEIF', () => {
    expect(validateSource({ kind: 'image/heic', bytes: 4_000_000, width: 4032, height: 3024 })).toEqual({ ok: true, kind: 'image/heic' });
    expect(validateSource({ kind: 'image/heif', bytes: 4_000_000, width: 4032, height: 3024 })).toEqual({ ok: true, kind: 'image/heif' });
  });

  it('allows one bounded decoder attempt for unknown kinds', () => {
    expect(validateSource({ kind: 'unknown', bytes: 1000, width: 100, height: 100 })).toEqual({ ok: true, kind: 'unknown' });
  });

  it('bounds the source at 25 MiB', () => {
    expect(validateSource({ kind: 'image/jpeg', bytes: MAX_SOURCE_BYTES })).toEqual({ ok: true, kind: 'image/jpeg' });
    expect(validateSource({ kind: 'image/jpeg', bytes: MAX_SOURCE_BYTES + 1 })).toEqual({ ok: false, reason: 'source-too-large' });
    expect(validateSource({ kind: 'image/jpeg', bytes: -1 })).toEqual({ ok: false, reason: 'source-too-large' });
  });

  it('guards the decoded dimensions before the manipulator allocates', () => {
    expect(validateSource({ kind: 'image/jpeg', width: MAX_SOURCE_SIDE_PX, height: 2000 })).toEqual({ ok: true, kind: 'image/jpeg' });
    expect(validateSource({ kind: 'image/jpeg', width: MAX_SOURCE_SIDE_PX + 1, height: 10 })).toEqual({ ok: false, reason: 'source-pixels-too-large' });
    // 16384 x 16384 would decode ~268 MP — far past the 48 MP guard.
    expect(validateSource({ kind: 'image/jpeg', width: MAX_SOURCE_SIDE_PX, height: MAX_SOURCE_SIDE_PX })).toEqual({ ok: false, reason: 'source-pixels-too-large' });
    expect(validateSource({ kind: 'image/jpeg', width: 8000, height: 8000 })).toEqual({ ok: false, reason: 'source-pixels-too-large' });
  });
});

describe('orientationCorrection (3.11B)', () => {
  it('maps the four base EXIF orientations', () => {
    expect(orientationCorrection('up')).toEqual({ rotation: 0, flipHorizontal: false });
    expect(orientationCorrection('right')).toEqual({ rotation: 90, flipHorizontal: false });
    expect(orientationCorrection('down')).toEqual({ rotation: 180, flipHorizontal: false });
    expect(orientationCorrection('left')).toEqual({ rotation: 270, flipHorizontal: false });
  });

  it('keeps the base rotation for mirrored orientations and flags the flip', () => {
    expect(orientationCorrection('up-mirrored')).toEqual({ rotation: 0, flipHorizontal: true });
    expect(orientationCorrection('right-mirrored')).toEqual({ rotation: 90, flipHorizontal: true });
    expect(orientationCorrection('left-mirrored')).toEqual({ rotation: 270, flipHorizontal: true });
  });

  it('defaults unknown or absent orientation to no correction', () => {
    expect(orientationCorrection(undefined)).toEqual({ rotation: 0, flipHorizontal: false });
    expect(orientationCorrection('nonsense')).toEqual({ rotation: 0, flipHorizontal: false });
  });
});

describe('computeAdjustedCrop (3.11B)', () => {
  it('cover-fits the smaller edge at the identity adjustment', () => {
    const crop = computeAdjustedCrop({ sourceWidth: 4000, sourceHeight: 3000, adjustment: IDENTITY_ADJUSTMENT });
    expect(crop.size).toBe(3000);
    expect(crop.originX).toBe(500);
    expect(crop.originY).toBe(0);
    expect(crop.adjustment).toEqual(IDENTITY_ADJUSTMENT);
  });

  it('slides the window along the surplus axis without leaving the image', () => {
    const farRight = computeAdjustedCrop({
      sourceWidth: 4000,
      sourceHeight: 3000,
      adjustment: { offsetX: 10, offsetY: 0, scale: 1 },
    });
    // The fraction clamps to the half-surplus in window sizes: (4000/3000 - 1)/2.
    expect(farRight.adjustment.offsetX).toBeCloseTo((4000 / 3000 - 1) / 2, 10);
    expect(farRight.originX).toBe(4000 - 3000);
    expect(farRight.originY).toBe(0);

    const farLeft = computeAdjustedCrop({
      sourceWidth: 4000,
      sourceHeight: 3000,
      adjustment: { offsetX: -10, offsetY: 0, scale: 1 },
    });
    expect(farLeft.originX).toBe(0);
  });

  it('shrinks the window with zoom and keeps pan inside the image', () => {
    const zoomed = computeAdjustedCrop({
      sourceWidth: 3000,
      sourceHeight: 3000,
      adjustment: { offsetX: 10, offsetY: -10, scale: 2 },
    });
    expect(zoomed.size).toBe(1500);
    // At 2x on a square, the pan fraction range is (3000/1500 - 1)/2 = 0.5.
    expect(zoomed.adjustment.offsetX).toBe(0.5);
    expect(zoomed.adjustment.offsetY).toBe(-0.5);
    expect(zoomed.originX).toBe(1500);
    expect(zoomed.originY).toBe(0);
  });

  it('swaps dimensions for rotated sources before clamping', () => {
    const rotated = computeAdjustedCrop({
      sourceWidth: 3000,
      sourceHeight: 4000,
      rotation: 90,
      adjustment: IDENTITY_ADJUSTMENT,
    });
    // Post-rotation the image is 4000x3000, so the window is the 3000 edge.
    expect(rotated.size).toBe(3000);
    expect(rotated.originX).toBe(500);
  });

  it('clamps non-finite and out-of-range adjustments defensively', () => {
    const crop = computeAdjustedCrop({
      sourceWidth: 2000,
      sourceHeight: 2000,
      adjustment: { offsetX: Number.NaN, offsetY: Number.NaN, scale: Number.NaN },
    });
    expect(crop.adjustment).toEqual({ offsetX: 0, offsetY: 0, scale: 1 });
    const zoomOut = computeAdjustedCrop({
      sourceWidth: 2000,
      sourceHeight: 2000,
      adjustment: { offsetX: 0, offsetY: 0, scale: 0.5 },
    });
    expect(zoomOut.adjustment.scale).toBe(1);
  });
});

describe('validateProcessedOutput (3.11B)', () => {
  it('accepts canonical artifacts within the contract', () => {
    expect(validateProcessedOutput({ mime: 'image/jpeg', bytes: 1024, width: 1024, height: 1024 })).toEqual({ ok: true, mime: 'image/jpeg' });
    expect(validateProcessedOutput({ mime: 'image/webp', bytes: MAX_UPLOAD_BYTES, width: 512, height: 512 })).toEqual({ ok: true, mime: 'image/webp' });
  });

  it('rejects oversized artifacts and non-canonical MIME', () => {
    expect(validateProcessedOutput({ mime: 'image/jpeg', bytes: MAX_UPLOAD_BYTES + 1, width: 512, height: 512 })).toEqual({ ok: false, reason: 'output-too-large' });
    expect(validateProcessedOutput({ mime: 'image/avif', bytes: 1000, width: 512, height: 512 })).toEqual({ ok: false, reason: 'unsupported-mime' });
    expect(validateProcessedOutput({ mime: 'image/heic', bytes: 1000, width: 512, height: 512 })).toEqual({ ok: false, reason: 'unsupported-mime' });
    expect(validateProcessedOutput({ mime: 'image/jpeg', bytes: 1000, width: 2048, height: 512 })).toEqual({ ok: false, reason: 'output-too-large-dimensions' });
    expect(validateProcessedOutput({ mime: 'image/jpeg', bytes: 1000, width: 0, height: 0 })).toEqual({ ok: false, reason: 'output-too-large-dimensions' });
  });
});
