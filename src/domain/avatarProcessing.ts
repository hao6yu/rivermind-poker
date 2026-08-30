/**
 * Pure image-processing contract for uploaded human avatars.
 *
 * The native steps (pick image, crop, correct orientation, resize, compress,
 * strip metadata, upload) live behind the avatar upload service, but every
 * decision — allowed source formats, size bounds, crop geometry, and resize
 * targets — is a deterministic pure function so it can be tested without a
 * device and reused by the server-side validation contract.
 *
 * Slice 3.11B contract: common phone sources are accepted generously (MIME is
 * a hint, HEIC/HEIF are decodable on device), bounded at the source (bytes +
 * decoded pixels), normalized into one canonical output (square ≤1024px,
 * ≤2 MiB, canonical MIME), and adjusted through user-controlled pan/zoom crop
 * geometry before anything persists.
 */

/** Largest *source* image accepted, in bytes (25 MiB): a modern phone photo. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/** Largest *processed artifact* accepted, in bytes (2 MiB). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
/** Largest square side accepted for the processed artifact, in pixels. */
export const MAX_AVATAR_SIDE_PX = 1024;
/** Smallest square side enforced after crop + resize. */
export const MIN_AVATAR_SIDE_PX = 128;
/** Largest single source side accepted, in pixels (decoded-dimension guard). */
export const MAX_SOURCE_SIDE_PX = 16384;
/** Largest decoded source area accepted, in pixels (48 MP guard). */
export const MAX_SOURCE_PIXELS = 48_000_000;

/** MIME types accepted for a square avatar upload. */
export const ALLOWED_AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'] as const;
export type AvatarMime = (typeof ALLOWED_AVATAR_MIME_TYPES)[number];

/**
 * Source formats the device can decode and normalize: the canonical output
 * set plus the iPhone-native HEIC/HEIF containers. AVIF re-encodes to WebP,
 * HEIC/HEIF re-encode to the canonical set; the *output* is never HEIC.
 */
export const SUPPORTED_SOURCE_MIME_HINTS = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
] as const;
export type SourceMimeHint = (typeof SUPPORTED_SOURCE_MIME_HINTS)[number];

/** File extensions accepted as a source-format hint when MIME is missing. */
export const SUPPORTED_SOURCE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'heic', 'heif'] as const;

/**
 * The identified source format. `image/heic` covers HEIC/HEIF containers for
 * processing purposes; `unknown` means no hint, extension, or magic bytes
 * agreed on a supported format — the decoder then gets one bounded attempt.
 */
export type SourceImageKind =
  | AvatarMime
  | 'image/heic'
  | 'image/heif'
  | 'unknown'
  /** Animated GIF input: rejected before decode with its own message. */
  | 'animated-unsupported';

export type ImageValidationResult =
  | { ok: true; mime: AvatarMime; bytes: number }
  | { ok: false; reason: 'unsupported-mime' | 'too-large' | 'not-an-image' };

/** Detect a supported avatar MIME type from magic bytes. */
export function detectAvatarMime(magicBytes: number[]): AvatarMime | null {
  const bytes = magicBytes ?? [];
  const byte = (index: number): number => bytes[index] ?? 0;
  const ascii = (index: number, length: number): string => {
    let out = '';
    for (let offset = 0; offset < length; offset += 1) {
      out += String.fromCharCode(bytes[index + offset] ?? 0);
    }
    return out;
  };

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // WebP: "RIFF"...."WEBP" (offset 8)
  if (
    bytes.length >= 12 &&
    ascii(0, 4) === 'RIFF' &&
    ascii(8, 4) === 'WEBP'
  ) {
    return 'image/webp';
  }
  // AVIF: "ftyp" brand box at offset 4. HEIC/HEIF containers are recognized
  // by `detectHeifMime` so an iPhone photo is never mislabeled `image/avif`.
  if (
    bytes.length >= 12 &&
    ascii(4, 4) === 'ftyp' &&
    ascii(8, 4) === 'avif'
  ) {
    return 'image/avif';
  }
  return null;
}

export function isAllowedMime(mime: string): mime is AvatarMime {
  return (ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(mime);
}

/** Validate an uploaded image's mime type and byte size. */
export function validateUpload(
  mime: string,
  bytes: number,
): ImageValidationResult {
  if (!isAllowedMime(mime)) {
    return { ok: false, reason: 'unsupported-mime' };
  }
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'too-large' };
  }
  return { ok: true, mime, bytes };
}

export interface CenterCrop {
  /** Crop origin x, in source pixels. */
  offsetX: number;
  /** Crop origin y, in source pixels. */
  offsetY: number;
  /** Side of the centered square crop, in source pixels. */
  cropSize: number;
  /** Final square side, in pixels, after resize. */
  targetSize: number;
  /** Source width, in pixels. */
  width: number;
  /** Source height, in pixels. */
  height: number;
}

/**
 * Center-crop a rectangle to a square (ignoring orientation, which the native
 * step corrects first) and resize it to the final avatar side. The crop side
 * is the smaller source edge, capped so the final square never exceeds the max.
 */
export function computeCenterCrop(
  sourceWidth: number,
  sourceHeight: number,
  maxSide = MAX_AVATAR_SIDE_PX,
): CenterCrop {
  const width = Math.max(1, Math.trunc(sourceWidth));
  const height = Math.max(1, Math.trunc(sourceHeight));
  let cropSize = Math.min(width, height);
  const targetSize = Math.max(MIN_AVATAR_SIDE_PX, Math.min(cropSize, maxSide));
  if (cropSize > maxSide) {
    cropSize = maxSide;
  }
  return {
    width,
    height,
    offsetX: Math.round((width - cropSize) / 2),
    offsetY: Math.round((height - cropSize) / 2),
    cropSize,
    targetSize,
  };
}

/** A deterministic resize target for a crop, given the desired final side. */
export function resizePlan(crop: CenterCrop, finalSide = MAX_AVATAR_SIDE_PX): { width: number; height: number } {
  const side = Math.max(MIN_AVATAR_SIDE_PX, Math.min(crop.cropSize, finalSide));
  return { width: side, height: side };
}

/**
 * Build the bounded upload descriptor carried after a successful upload. The
 * caller supplies the owner-scoped object path and content hash; the returned
 * shape never leaks the path outside the upload boundary.
 */
export interface AvatarUploadDescriptor {
  avatarId: string;
  version: number;
  mime: AvatarMime;
  bytes: number;
  width: number;
  height: number;
}

export function buildAvatarUploadDescriptor(
  avatarId: string,
  version: number,
  mime: AvatarMime,
  bytes: number,
  sourceWidth: number,
  sourceHeight: number,
  maxSide = MAX_AVATAR_SIDE_PX,
): AvatarUploadDescriptor {
  const crop = computeCenterCrop(sourceWidth, sourceHeight, maxSide);
  return {
    avatarId,
    version,
    mime,
    bytes,
    ...resizePlan(crop, maxSide),
  };
}

/** A neutral 1x1 baseline used when a source cannot be measured. */
export const EMPTY_AVATAR_SOURCE = { width: 1, height: 1 };

/* ------------------------------------------------------------------ *
 * Slice 3.11B — generous source intake, bounded sources, adjusted crop *
 * ------------------------------------------------------------------ */

/** Normalize a picker MIME hint into a supported source kind, or `null`. */
export function normalizeSourceMimeHint(hintMime?: string): SourceImageKind | null {
  const hint = (hintMime ?? '').toLowerCase().trim();
  if (!hint || hint === 'application/octet-stream' || hint === 'binary/octet-stream') return null;
  if (hint === 'image/jpg') return 'image/jpeg';
  if ((SUPPORTED_SOURCE_MIME_HINTS as readonly string[]).includes(hint)) {
    return hint === 'image/jpg' ? 'image/jpeg' : (hint as SourceImageKind);
  }
  return null;
}

/** Detect an iPhone-native HEIC/HEIF container from `ftyp` magic bytes. */
export function detectHeifMime(magicBytes: number[]): 'image/heic' | 'image/heif' | null {
  const bytes = magicBytes ?? [];
  const ascii = (index: number, length: number): string => {
    let out = '';
    for (let offset = 0; offset < length; offset += 1) {
      out += String.fromCharCode(bytes[index + offset] ?? 0);
    }
    return out;
  };
  if (bytes.length >= 12 && ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (brand === 'heic' || brand === 'heix' || brand === 'hevc') return 'image/heic';
    if (brand === 'mif1' || brand === 'msf1' || brand === 'heif') return 'image/heif';
  }
  return null;
}

export interface SourceIdentity {
  kind: SourceImageKind;
  /** Which signal decided the kind: magic bytes win over hints. */
  basis: 'magic' | 'hint' | 'extension' | 'unknown';
}

/** Detect animated GIF sources from magic bytes (GIF87a / GIF89a). Avatars
 * reject animated inputs with a specific error instead of silently taking
 * the first frame. */
export function detectAnimatedGif(magicBytes: number[]): boolean {
  const bytes = magicBytes ?? [];
  if (bytes.length < 6) return false;
  const ascii = (index: number, length: number): string => {
    let out = '';
    for (let offset = 0; offset < length; offset += 1) {
      out += String.fromCharCode(bytes[index + offset] ?? 0);
    }
    return out;
  };
  return ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a';
}

/**
 * Resolve one source image's format from every available hint. The picker's
 * MIME is a *hint*, never an authority: magic bytes win when readable, then
 * the hint, then the file extension. A missing or generic MIME (`image/heic`,
 * nothing at all, `application/octet-stream`) is not a rejection — that is
 * exactly what iPhone Photos supplies for ordinary library picks. Animated
 * GIF sources are identified and rejected before the decoder runs.
 */
export function resolveSourceIdentity(options: {
  hintMime?: string;
  fileExtension?: string;
  magicBytes?: number[] | null;
}): SourceIdentity {
  if (detectAnimatedGif(options.magicBytes ?? [])) {
    return { kind: 'animated-unsupported', basis: 'magic' };
  }
  const detected =
    detectHeifMime(options.magicBytes ?? []) ??
    detectAvatarMime(options.magicBytes ?? []);
  if (detected) return { kind: detected, basis: 'magic' };

  const hinted = normalizeSourceMimeHint(options.hintMime);
  if (hinted) return { kind: hinted, basis: 'hint' };

  const extension = (options.fileExtension ?? '').toLowerCase().replace(/^\./, '');
  const byExtension: Record<string, SourceImageKind> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  if (Object.prototype.hasOwnProperty.call(byExtension, extension)) {
    return { kind: byExtension[extension]!, basis: 'extension' };
  }
  return { kind: 'unknown', basis: 'unknown' };
}

export type SourceValidationReason =
  | 'unsupported-source'
  | 'source-too-large'
  | 'source-pixels-too-large';

export type SourceValidationResult =
  | { ok: true; kind: SourceImageKind }
  | { ok: false; reason: SourceValidationReason };

/**
 * Validate a picked source before any decode: a bounded byte size for modern
 * phone photos and a decoded-pixel guard so a hostile or enormous image is
 * rejected before the manipulator allocates for it. A source the identity
 * step could not name gets one bounded decoder attempt (`unknown` is allowed
 * through and fails later as `not-an-image` if decoding fails).
 */
export function validateSource(options: {
  kind: SourceImageKind;
  bytes?: number;
  width?: number;
  height?: number;
}): SourceValidationResult {
  const { kind, bytes, width, height } = options;
  if (
    kind !== 'unknown'
    && !(SUPPORTED_SOURCE_MIME_HINTS as readonly string[]).includes(kind)
    && kind !== 'image/heic'
    && kind !== 'image/heif'
  ) {
    return { ok: false, reason: 'unsupported-source' };
  }
  if (bytes !== undefined && (!Number.isFinite(bytes) || bytes < 0 || bytes > MAX_SOURCE_BYTES)) {
    return { ok: false, reason: 'source-too-large' };
  }
  if (width !== undefined && height !== undefined && width > 0 && height > 0) {
    if (width > MAX_SOURCE_SIDE_PX || height > MAX_SOURCE_SIDE_PX) {
      return { ok: false, reason: 'source-pixels-too-large' };
    }
    if (width * height > MAX_SOURCE_PIXELS) {
      return { ok: false, reason: 'source-pixels-too-large' };
    }
  }
  return { ok: true, kind };
}

/** The rotation (degrees, clockwise) that displays a source upright. */
export type SourceRotation = 0 | 90 | 180 | 270;

const EXIF_ROTATIONS: Record<string, SourceRotation> = {
  up: 0,
  right: 90,
  down: 180,
  left: 270,
};

/**
 * Map an Expo image-picker orientation (EXIF-derived) to the clockwise
 * rotation the manipulator must apply before cropping. Mirrored orientations
 * keep their base rotation; the horizontal flip is reported separately.
 */
export function orientationCorrection(orientation?: string): {
  rotation: SourceRotation;
  flipHorizontal: boolean;
} {
  const key = (orientation ?? '').toLowerCase();
  if (key.endsWith('-mirrored')) {
    const base = EXIF_ROTATIONS[key.replace(/-mirrored$/, '')] ?? 0;
    return { rotation: base, flipHorizontal: true };
  }
  return { rotation: EXIF_ROTATIONS[key] ?? 0, flipHorizontal: false };
}

export interface AvatarAdjustment {
  /**
   * Pan offset of the visible square, as a fraction of the viewport: the
   * fraction is relative to the cover-fit window size, and positive moves the
   * visible window toward the right/bottom of the source image. The UI
   * translates the image opposite to the gesture.
   */
  offsetX: number;
  offsetY: number;
  /** Zoom relative to the cover-fit scale (≥1: never smaller than cover). */
  scale: number;
}

export const IDENTITY_ADJUSTMENT: AvatarAdjustment = { offsetX: 0, offsetY: 0, scale: 1 };

/**
 * Clamp one adjustment to the pan/zoom ranges that keep the square inside the
 * image — the same ranges `computeAdjustedCrop` enforces, exported so the UI
 * can hold exactly the state that will be saved (screen and artifact share
 * one clamped value; the crop function's internal clamp stays as a defensive
 * invariant).
 */
export function clampAvatarAdjustment(options: {
  sourceWidth: number;
  sourceHeight: number;
  rotation?: SourceRotation;
  adjustment: AvatarAdjustment;
}): AvatarAdjustment {
  const rotation = options.rotation ?? 0;
  const swap = rotation === 90 || rotation === 270;
  const width = Math.max(1, Math.trunc(swap ? options.sourceHeight : options.sourceWidth));
  const height = Math.max(1, Math.trunc(swap ? options.sourceWidth : options.sourceHeight));
  const scale = clampAdjustmentScale(options.adjustment.scale);
  const windowSize = Math.max(1, Math.min(width, height) / scale);
  const rangeF = (axis: number): number => Math.max(0, (axis / windowSize - 1) / 2);
  return {
    offsetX: clampFraction(options.adjustment.offsetX, rangeF(width)),
    offsetY: clampFraction(options.adjustment.offsetY, rangeF(height)),
    scale,
  };
}

export interface AdjustedCrop {
  /** Crop origin in post-rotation source pixels. */
  originX: number;
  originY: number;
  /** Square crop side in post-rotation source pixels. */
  size: number;
  /** The clamped adjustment actually used, echoed for the UI. */
  adjustment: AvatarAdjustment;
}

/**
 * Compute the user-adjusted square crop for one source. The adjustment is
 * expressed against a cover-fit viewport: the whole image covers the square
 * viewport at scale 1, and zooming scales about the viewport center while the
 * pan offset slides the crop window. The crop is clamped so the square never
 * leaves the (post-rotation) image, and zoom is clamped to [1, 8]. Small
 * sources up to the max side are used at native resolution; the resize step
 * bounds the final artifact.
 */
export function computeAdjustedCrop(options: {
  sourceWidth: number;
  sourceHeight: number;
  rotation?: SourceRotation;
  adjustment: AvatarAdjustment;
}): AdjustedCrop {
  const rotation = options.rotation ?? 0;
  const swap = rotation === 90 || rotation === 270;
  const width = Math.max(1, Math.trunc(swap ? options.sourceHeight : options.sourceWidth));
  const height = Math.max(1, Math.trunc(swap ? options.sourceWidth : options.sourceHeight));

  const scale = clampAdjustmentScale(options.adjustment.scale);
  // The cover-fit window is the smaller edge; zooming shrinks the window.
  // The final artifact stays <= MAX_AVATAR_SIDE_PX through the resize step,
  // so the window itself is not capped: scale 1 always means "whole image".
  const windowSize = Math.max(1, Math.min(width, height) / scale);
  const size = Math.round(windowSize);

  // The pan fraction clamps to the range that keeps the square inside the
  // image: the window center may slide from the image center by half the
  // surplus of each axis, measured in window sizes.
  const rangeF = (fraction: number, axis: number): number => Math.max(0, (axis / windowSize - 1) / 2);
  const offsetX = clampFraction(options.adjustment.offsetX, rangeF(0, width));
  const offsetY = clampFraction(options.adjustment.offsetY, rangeF(0, height));

  return {
    originX: Math.round(Math.max(0, Math.min(width - size, width / 2 + offsetX * windowSize - size / 2))),
    originY: Math.round(Math.max(0, Math.min(height - size, height / 2 + offsetY * windowSize - size / 2))),
    size,
    adjustment: { offsetX, offsetY, scale },
  };
}

function clampAdjustmentScale(scale: number): number {
  if (!Number.isFinite(scale) || scale < 1) return 1;
  return Math.min(8, scale);
}

function clampFraction(offset: number, range: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(-range, Math.min(range, offset));
}

export type ProcessedValidationReason =
  | 'unsupported-mime'
  | 'output-too-large'
  | 'output-too-large-dimensions';

export type ProcessedValidationResult =
  | { ok: true; mime: AvatarMime }
  | { ok: false; reason: ProcessedValidationReason };

/**
 * Validate the processed artifact against the canonical output contract:
 * a decodable MIME (HEIC never survives processing), ≤2 MiB, ≤1024px square.
 */
export function validateProcessedOutput(options: {
  mime: string;
  bytes: number;
  width: number;
  height: number;
}): ProcessedValidationResult {
  if (!isAllowedMime(options.mime) || options.mime === 'image/avif') {
    return { ok: false, reason: 'unsupported-mime' };
  }
  if (!Number.isFinite(options.bytes) || options.bytes <= 0 || options.bytes > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'output-too-large' };
  }
  if (
    !Number.isInteger(options.width) || !Number.isInteger(options.height)
    || options.width < MIN_AVATAR_SIDE_PX || options.height < MIN_AVATAR_SIDE_PX
    || options.width > MAX_AVATAR_SIDE_PX || options.height > MAX_AVATAR_SIDE_PX
  ) {
    // Covers non-square, sub-floor (the resize enforces the 128px floor the
    // descriptor records), and oversized dimensions.
    return { ok: false, reason: 'output-too-large-dimensions' };
  }
  return { ok: true, mime: options.mime };
}
