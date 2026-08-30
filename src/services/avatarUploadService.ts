/**
 * Avatar upload boundary: pick, crop, compress, and hand back a bounded
 * descriptor. All the *decisions* — allowed MIME types, size bounds,
 * center-crop geometry, and resize targets — live in the pure, device-free
 * `avatarProcessing` module, which is unit tested. The native steps (image
 * picker, image manipulation) are loaded dynamically so the pure contract is
 * exercised without a device.
 *
 * Runtime requirement (production): this service dynamically loads
 * `expo-image-picker` for selection and `expo-image-manipulator` for
 * crop/compress. They must be installed (Expo SDK 54 pinned) before uploads are
 * enabled on a device; the service degrades to an "unavailable" outcome when
 * either module cannot be loaded, so the UI can fall back to initials/authored
 * avatars. No local file paths or signed URLs are serialized: the descriptor
 * and registry carry only the bounded `avatarId` + `version`.
 */
import {
  buildAvatarUploadDescriptor,
  computeAdjustedCrop,
  IDENTITY_ADJUSTMENT,
  isAllowedMime,
  MAX_AVATAR_SIDE_PX,
  EMPTY_AVATAR_SOURCE,
  orientationCorrection,
  resolveSourceIdentity,
  validateProcessedOutput,
  validateSource,
  type AvatarAdjustment,
  type AvatarMime,
  type AvatarUploadDescriptor,
  type ImageValidationResult,
  type SourceIdentity,
} from '../domain/avatarProcessing';

/** Extract the rejection reason from the (distributed) image-validation union. */
type ExtractError<T> = T extends { ok: false; reason: infer E } ? E : never;
type SourceError = ExtractError<ReturnType<typeof validateSource> extends infer T ? T : never>;
type AvatarUploadError =
  | ExtractError<ImageValidationResult>
  | SourceError
  | 'animated-unsupported'
  | 'output-too-large'
  | 'output-too-large-dimensions'
  | 'cancelled'
  | 'unavailable';

export interface PickedImage {
  uri: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  /** EXIF-derived orientation reported by the picker, when present. */
  orientation?: string;
}

export interface ProcessedImage {
  uri: string;
  mimeType: AvatarMime;
  fileSize: number;
  width: number;
  height: number;
}

/** A stable, bounded, opaque identifier for an uploaded avatar. */
export function generateAvatarId(): string {
  const alphabet = '0123456789abcdef';
  let bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    bytes = crypto.getRandomValues(bytes);
  }
  let chars = '';
  for (let i = 0; i < bytes.length; i += 1) {
    chars += alphabet[(bytes[i] ?? 0) % alphabet.length];
  }
  return chars.slice(0, 16);
}

/** Literal imports let Metro include the optional native modules in the bundle. */
async function loadImagePickerModule(): Promise<object | null> {
  try {
    return await import('expo-image-picker');
  } catch {
    return null;
  }
}

async function loadImageManipulatorModule(): Promise<{ ImageManipulator?: unknown } | null> {
  try {
    return await import('expo-image-manipulator');
  } catch {
    return null;
  }
}

/**
 * The native surface the service depends on. In production this is satisfied by
 * `expo-image-picker` and `expo-image-manipulator`; tests or fallback paths need
 * only provide one of these operations.
 */
export interface AvatarUploadClient {
  /** Pick a single image; `null`/`undefined` means the user cancelled. */
  pickImageAsync(): Promise<PickedImage | null | undefined>;
  /**
   * Correct orientation (rotate + optional flip), apply the square crop in
   * post-rotation source pixels, resize, compress, strip metadata, and persist
   * the result. Returns `null`/`undefined` on decoder failure.
   */
  processImageAsync(
    uri: string,
    options: {
      outputFormat: AvatarMime;
      /** The picked source image width, in pixels. */
      sourceWidth: number;
      /** The picked source image height, in pixels. */
      sourceHeight: number;
      targetWidth: number;
      targetHeight: number;
      compress?: number;
      /** EXIF orientation correction applied before the crop. */
      rotate?: 0 | 90 | 180 | 270;
      flipHorizontal?: boolean;
      /** Square crop in post-rotation source pixels; defaults to center. */
      crop?: { originX: number; originY: number; size: number };
    },
  ): Promise<ProcessedImage | null | undefined>;
}

export type AvatarUploadOutcome =
  | { status: 'ok'; error: 'ok'; description: string; avatarId: string; version: number; uri: string; mimeType: AvatarMime; descriptor: AvatarUploadDescriptor }
  | { status: AvatarUploadError; error: AvatarUploadError; description: string; /** Present when a processing attempt already wrote an artifact the caller must clean up. */ avatarId?: string; uri?: string };

function run<T>(fn: () => Promise<T | null | undefined>): Promise<T | null> {
  return fn().then((value) => (value === null || value === undefined ? null : value));
}

/**
 * The validated source stage of the 3.11B flow: a picked image that passed
 * the generous source contract (MIME as hint, HEIC/HEIF and missing MIME
 * accepted, bounded bytes and decoded pixels) and is ready for the user's
 * adjust stage. Nothing is persisted or processed yet.
 */
export type AvatarSourcePreparation =
  | { status: 'ok'; source: PickedImage; identity: SourceIdentity; rotation: 0 | 90 | 180 | 270; flipHorizontal: boolean }
  | { status: 'cancelled' }
  | { status: 'animated-unsupported' }
  | { status: 'unsupported-source' }
  | { status: 'source-too-large' }
  | { status: 'source-pixels-too-large' };

/**
 * Validate one picked image as an avatar *source*: resolve its format from
 * the MIME hint, extension, and (when available) magic bytes; bound the bytes
 * and decoded dimensions; and report the orientation correction the crop
 * needs. No native module is required for this stage beyond the reader.
 */
export function prepareAvatarSource(
  picked: PickedImage | null | undefined,
  reader?: { readMagicBytes(uri: string): Promise<number[] | null> },
): Promise<AvatarSourcePreparation> {
  if (!picked || !picked.uri) return Promise.resolve({ status: 'cancelled' });
  const readMagic = reader
    ? reader.readMagicBytes(picked.uri).catch(() => null)
    : Promise.resolve(null);
  return readMagic.then((magicBytes) => {
    const identity = resolveSourceIdentity({
      hintMime: picked.mimeType,
      fileExtension: extensionOf(picked.uri),
      magicBytes,
    });
    if (identity.kind === 'animated-unsupported') return { status: 'animated-unsupported' };
    const validation = validateSource({
      kind: identity.kind,
      bytes: picked.fileSize,
      width: picked.width,
      height: picked.height,
    });
    if (!validation.ok) return { status: validation.reason };
    const correction = orientationCorrection(picked.orientation);
    return {
      status: 'ok',
      source: picked,
      identity,
      rotation: correction.rotation,
      flipHorizontal: correction.flipHorizontal,
    };
  });
}

function extensionOf(uri: string): string {
  const clean = uri.split('?')[0] ?? uri;
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1) : '';
}

/**
 * The compress ladder the output contract walks: canonical quality first,
 * then progressively lower quality until the artifact fits 2 MiB. A PNG that
 * still will not fit is re-encoded as JPEG (photographic avatar content),
 * which the client reports honestly in the result MIME.
 */
const OUTPUT_COMPRESS_LADDER = [1, 0.85, 0.7, 0.55, 0.4] as const;

/**
 * Process the user-confirmed adjustment into the canonical avatar artifact:
 * orientation correction, adjusted square crop, resize to ≤1024px, bounded
 * compression, metadata stripping, and the bounded descriptor. Nothing here
 * touches the registry — persistence remains the caller's (editor's) job, so
 * Cancel before this point leaves zero artifacts behind.
 */
export async function processAdjustedAvatar(
  client: AvatarUploadClient,
  prepared: Extract<AvatarSourcePreparation, { status: 'ok' }>,
  adjustment: AvatarAdjustment,
  options?: { avatarId?: string; version?: number },
): Promise<AvatarUploadOutcome> {
  const avatarId = options?.avatarId ?? generateAvatarId();
  const version = options?.version ?? 1;
  const source = prepared.source;
  const sourceWidth = source.width ?? EMPTY_AVATAR_SOURCE.width;
  const sourceHeight = source.height ?? EMPTY_AVATAR_SOURCE.height;

  // The canonical output MIME: PNG and WebP keep their decodable family;
  // photographic sources (JPEG/HEIC/HEIF) and unknown kinds re-encode to
  // JPEG; AVIF re-encodes to WebP, and the actual saved bytes label the
  // result — a HEIC source never survives processing as image/heic.
  const outputFormat: AvatarMime = prepared.identity.kind === 'image/png'
    ? 'image/png'
    : prepared.identity.kind === 'image/webp' || prepared.identity.kind === 'image/avif'
      ? 'image/webp'
      : 'image/jpeg';

  const crop = computeAdjustedCrop({
    sourceWidth,
    sourceHeight,
    rotation: prepared.rotation,
    adjustment: adjustment ?? IDENTITY_ADJUSTMENT,
  });

  // JPEG/WebP degrade gracefully under compression; PNG ignores `compress`
  // entirely, so a PNG walks exactly one lossless rung before falling through
  // to the JPEG re-encode ladder instead of five identical encodes.
  const ladder: Array<{ format: AvatarMime; compress: number }> = outputFormat === 'image/png'
    ? [
      { format: 'image/png', compress: 1 },
      { format: 'image/jpeg', compress: 0.85 },
      { format: 'image/jpeg', compress: 0.7 },
      { format: 'image/jpeg', compress: 0.55 },
      { format: 'image/jpeg', compress: 0.4 },
    ]
    : OUTPUT_COMPRESS_LADDER.map((compress) => ({ format: outputFormat, compress }));

  let processed: ProcessedImage | null = null;
  for (const rung of ladder) {
    const attempt = await run(() =>
      client.processImageAsync(source.uri, {
        outputFormat: rung.format,
        sourceWidth,
        sourceHeight,
        targetWidth: MAX_AVATAR_SIDE_PX,
        targetHeight: MAX_AVATAR_SIDE_PX,
        compress: rung.compress,
        rotate: prepared.rotation,
        flipHorizontal: prepared.flipHorizontal,
        crop: { originX: crop.originX, originY: crop.originY, size: crop.size },
      }),
    );
    if (!attempt) {
      return { status: 'not-an-image', error: 'not-an-image', description: 'The image could not be processed.', avatarId };
    }
    const validation = validateProcessedOutput({
      mime: attempt.mimeType,
      bytes: attempt.fileSize,
      width: attempt.width,
      height: attempt.height,
    });
    if (validation.ok) {
      processed = attempt;
      break;
    }
    if (validation.reason !== 'output-too-large') {
      // The attempt already wrote a cache file; hand its reference back so
      // the caller can dispose of it through the tracked cleanup path.
      return { status: validation.reason, error: validation.reason, description: 'The processed image is not a valid avatar.', avatarId, uri: attempt.uri };
    }
    processed = attempt;
  }

  if (!processed) {
    return { status: 'output-too-large', error: 'output-too-large', description: 'The processed image is too large.', avatarId };
  }
  const outputValidation = validateProcessedOutput({
    mime: processed.mimeType,
    bytes: processed.fileSize,
    width: processed.width,
    height: processed.height,
  });
  if (!outputValidation.ok) {
    return { status: outputValidation.reason, error: outputValidation.reason, description: 'The processed image is not a valid avatar.', avatarId, uri: processed.uri };
  }

  const width = processed.width > 0 ? processed.width : EMPTY_AVATAR_SOURCE.width;
  const height = processed.height > 0 ? processed.height : EMPTY_AVATAR_SOURCE.height;
  const descriptor = buildAvatarUploadDescriptor(
    avatarId,
    version,
    processed.mimeType,
    processed.fileSize,
    width,
    height,
    MAX_AVATAR_SIDE_PX,
  );
  return {
    status: 'ok',
    error: 'ok',
    description: 'The avatar was prepared.',
    avatarId,
    version,
    uri: processed.uri,
    mimeType: processed.mimeType,
    descriptor,
  };
}

/**
 * Legacy one-shot path: pick, validate, center-crop, compress to the
 * canonical avatar square, and return a bounded descriptor — the adjust-less
 * equivalent of `prepareAvatarSource` + `processAdjustedAvatar`, retained for
 * callers that have no adjustment surface. HEIC/HEIF/missing-MIME sources are
 * accepted exactly as in the staged flow.
 */
export async function pickAndPrepareAvatar(
  client: AvatarUploadClient,
  options?: { avatarId?: string; version?: number },
  reader?: { readMagicBytes(uri: string): Promise<number[] | null> },
): Promise<AvatarUploadOutcome> {
  const [picker, manipulator] = await Promise.all([
    loadImagePickerModule(),
    loadImageManipulatorModule(),
  ]);
  if (!picker || !manipulator) {
    return {
      status: 'unavailable',
      error: 'unavailable',
      description: 'The image engine is unavailable on this device.',
    };
  }

  const picked = await run(() => client.pickImageAsync());
  if (!picked) {
    return { status: 'cancelled', error: 'cancelled', description: 'No image was selected.' };
  }
  const prepared = await prepareAvatarSource(picked, reader);
  if (prepared.status !== 'ok') {
    const descriptions: Record<Exclude<AvatarSourcePreparation['status'], 'ok'>, string> = {
      cancelled: 'No image was selected.',
      'animated-unsupported': 'Animated images are not supported for avatars.',
      'unsupported-source': 'That image format is not supported.',
      'source-too-large': 'That image is too large to use.',
      'source-pixels-too-large': 'That image is too large to decode.',
    };
    return { status: prepared.status, error: prepared.status, description: descriptions[prepared.status] };
  }
  return processAdjustedAvatar(client, prepared, IDENTITY_ADJUSTMENT, options);
}
