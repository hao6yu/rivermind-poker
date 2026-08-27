/**
 * Pure image-processing contract for uploaded human avatars.
 *
 * The native steps (pick image, crop, correct orientation, resize, compress,
 * strip metadata, upload) live behind the avatar upload service, but every
 * decision — allowed MIME types, size bounds, center-crop geometry, and resize
 * targets — is a deterministic pure function so it can be tested without a
 * device and reused by the server-side validation contract.
 */

/** Largest upload accepted, in bytes (8 MiB). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Largest square side accepted, in pixels. */
export const MAX_AVATAR_SIDE_PX = 1024;
/** Smallest square side enforced after crop + resize. */
export const MIN_AVATAR_SIDE_PX = 128;

/** MIME types accepted for a square avatar upload. */
export const ALLOWED_AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'] as const;
export type AvatarMime = (typeof ALLOWED_AVATAR_MIME_TYPES)[number];

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
  // AVIF/HEIF: "ftyp" brand box at offset 4 (avif/heic).
  if (
    bytes.length >= 12 &&
    ascii(4, 4) === 'ftyp' &&
    (ascii(8, 4) === 'avif' || ascii(8, 4) === 'heic' || ascii(8, 4) === 'heix')
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
