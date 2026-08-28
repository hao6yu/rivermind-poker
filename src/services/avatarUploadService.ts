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
  isAllowedMime,
  MAX_AVATAR_SIDE_PX,
  EMPTY_AVATAR_SOURCE,
  validateUpload,
  type AvatarMime,
  type AvatarUploadDescriptor,
  type ImageValidationResult,
} from '../domain/avatarProcessing';

/** Extract the rejection reason from the (distributed) image-validation union. */
type ExtractError<T> = T extends { ok: false; reason: infer E } ? E : never;
type AvatarUploadError = ExtractError<ImageValidationResult> | 'cancelled' | 'unavailable';

export interface PickedImage {
  uri: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
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
  /** Crop to the center square, correct orientation, resize, and compress. */
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
    },
  ): Promise<ProcessedImage | null | undefined>;
}

export type AvatarUploadOutcome =
  | { status: 'ok'; error: 'ok'; description: string; avatarId: string; version: number; uri: string; mimeType: AvatarMime; descriptor: AvatarUploadDescriptor }
  | { status: AvatarUploadError; error: AvatarUploadError; description: string };

function run<T>(fn: () => Promise<T | null | undefined>): Promise<T | null> {
  return fn().then((value) => (value === null || value === undefined ? null : value));
}

/**
 * Pick a single image, validate it, crop + compress to the canonical avatar
 * square, and return a bounded descriptor. Returns an error outcome (so the UI
 * can surface a message) or an "unavailable" outcome when the native modules
 * cannot be loaded.
 */
export async function pickAndPrepareAvatar(
  client: AvatarUploadClient,
  options?: { avatarId?: string; version?: number },
): Promise<AvatarUploadOutcome> {
  const avatarId = options?.avatarId ?? generateAvatarId();
  const version = options?.version ?? 1;

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

  const mime = picked.mimeType && isAllowedMime(picked.mimeType) ? picked.mimeType : undefined;
  if (!mime) {
    return { status: 'unsupported-mime', error: 'unsupported-mime', description: 'That image format is not supported.' };
  }
  const validation = validateUpload(mime, picked.fileSize ?? 0);
  if (!validation.ok) {
    return { status: validation.reason, error: validation.reason, description: 'The selected image could not be used.' };
  }

  const sourceWidth = picked.width ?? EMPTY_AVATAR_SOURCE.width;
  const sourceHeight = picked.height ?? EMPTY_AVATAR_SOURCE.height;
  const processed = await run(() =>
    client.processImageAsync(picked.uri, {
      outputFormat: mime,
      sourceWidth,
      sourceHeight,
      targetWidth: MAX_AVATAR_SIDE_PX,
      targetHeight: MAX_AVATAR_SIDE_PX,
      compress: 1,
    }),
  );
  if (!processed) {
    return { status: 'not-an-image', error: 'not-an-image', description: 'The image could not be processed.' };
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
