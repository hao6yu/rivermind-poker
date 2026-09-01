/**
 * Production avatar-upload client: picks an image, center-crops + resizes it to
 * the canonical avatar square, and returns the bounded descriptor built by the
 * pure `avatarUploadService`. The Expo image modules are loaded dynamically so
 * the service boundary compiles without them and degrades to an
 * "unavailable" outcome when a module is absent (offline / unsupported device).
 *
 * The adapters target the Expo SDK 54 surface:
 *  - `expo-image-picker`'s `launchImageLibraryAsync`, which returns
 *    `{ canceled, assets }` (no `asset`, no `pickImageAsync`);
 *  - `expo-image-manipulator`'s `ImageManipulator.manipulate(source)` chain
 *    — `crop(rect)`, `resize(size)`, then `renderAsync()` to await the scheduled
 *    transformations and `saveAsync(options)` to persist + read the result.
 */
import {
  computeCenterCrop,
  MAX_AVATAR_SIDE_PX,
  MAX_SOURCE_BYTES,
  MIN_AVATAR_SIDE_PX,
  type AvatarMime,
} from '../domain/avatarProcessing';
import {
  pickAndPrepareAvatar,
  type AvatarUploadClient,
  type AvatarUploadOutcome,
  type PickedImage,
  type ProcessedImage,
} from './avatarUploadService';
import type {
  ImagePickerAsset,
  ImagePickerOptions,
  ImagePickerResult,
} from 'expo-image-picker';
import { FlipType, SaveFormat } from 'expo-image-manipulator';
import type {
  ImageManipulatorContext,
  ImageResult,
  SaveOptions,
} from 'expo-image-manipulator';

/** A loaded `expo-image-picker` module exposing the real SDK 54 launchers.
 * The option/result types are the package's own, so a nonexistent method or
 * option shape can never satisfy this interface. */
interface ImagePickerModule {
  launchImageLibraryAsync?: (options?: ImagePickerOptions) => Promise<ImagePickerResult>;
  launchCameraAsync?: (options?: ImagePickerOptions) => Promise<ImagePickerResult>;
}

/** A loaded `expo-image-manipulator` module, mirroring its real chain:
 * `ImageManipulator.manipulate(uri)` → context `crop(...)`/`resize(...)` →
 * `renderAsync()` → `ImageRef.saveAsync(options)`. The context/ref/result
 * types are the package's own exports. */
interface ImageManipulatorModule {
  ImageManipulator?: {
    manipulate: (source: string) => ImageManipulatorContext;
  };
}

/** Load the picker through a literal import so Metro can include it in the bundle. */
async function loadImagePicker(): Promise<ImagePickerModule | null> {
  try {
    return await import('expo-image-picker');
  } catch {
    return null;
  }
}

/** Load the manipulator through a literal import so Metro can include it in the bundle. */
async function loadImageManipulator(): Promise<ImageManipulatorModule | null> {
  try {
    return await import('expo-image-manipulator');
  } catch {
    return null;
  }
}

/** The supported save format for each accepted avatar MIME. AVIF re-encodes to webp. */
const SAVE_FORMAT: Record<AvatarMime, SaveFormat> = {
  'image/png': SaveFormat.PNG,
  'image/jpeg': SaveFormat.JPEG,
  'image/webp': SaveFormat.WEBP,
  'image/avif': SaveFormat.WEBP,
};

/**
 * The actual MIME of the processed bytes, keyed by the save format that
 * produced them. The save format — not the input MIME — determines what is
 * really on disk, so a WebP-encoded AVIF input must report `image/webp`; the
 * mislabeled `image/avif` would otherwise travel into the descriptor, the
 * upload header, and the `avatar-access` response.
 */
const OUTPUT_MIME: Record<SaveFormat, AvatarMime> = {
  [SaveFormat.PNG]: 'image/png',
  [SaveFormat.JPEG]: 'image/jpeg',
  [SaveFormat.WEBP]: 'image/webp',
};

/** Durable extension for the bytes produced by each manipulator format. */
const OUTPUT_EXTENSION: Record<SaveFormat, string> = {
  [SaveFormat.PNG]: 'png',
  [SaveFormat.JPEG]: 'jpg',
  [SaveFormat.WEBP]: 'webp',
};

/**
 * `ImageRef.saveAsync()` writes to Expo's cache directory, which the OS may
 * purge. Move the validated candidate into the app document directory before
 * its URI is returned to the profile registry. Documents survive ordinary
 * cache cleanup and application upgrades; explicit avatar cleanup still owns
 * deletion when a photo is replaced, removed, or the account is deleted.
 */
async function moveProcessedAvatarToDocuments(
  cacheUri: string,
  avatarId: string,
  format: SaveFormat,
): Promise<string> {
  const { Directory, File, Paths } = await import('expo-file-system');
  const avatarDirectory = new Directory(Paths.document, 'rivermind', 'avatars');
  avatarDirectory.create({ idempotent: true, intermediates: true });
  const destination = new File(
    avatarDirectory,
    `${avatarId}.${OUTPUT_EXTENSION[format] ?? 'webp'}`,
  );
  if (destination.exists) destination.delete();
  const candidate = new File(cacheUri);
  candidate.move(destination);
  return candidate.uri;
}

/** Derive byte length from a base64 body: 3 bytes per 4 base64 chars, minus padding. */
function bytesFromBase64(base64?: string): number {
  if (!base64) return 0;
  const padding = (base64.match(/=+$/) ?? [''])[0].length;
  return Math.round((base64.length / 4) * 3 - padding);
}

/** The shared launch options for a single still-image selection. Camera
 * capture and the library use the same bounded options so both paths feed one
 * processing pipeline. */
const STILL_IMAGE_OPTIONS: ImagePickerOptions = {
  allowsEditing: false,
  allowsMultipleSelection: false,
  mediaTypes: 'images',
  quality: 1,
  // Orientation correction (3.11B) needs the EXIF block; metadata never
  // reaches the processed artifact because the manipulator re-encodes.
  exif: true,
};

function pickImageAsync(): Promise<PickedImage | null> {
  return loadImagePicker().then(async (mod) => {
    const launch = mod?.launchImageLibraryAsync;
    if (typeof launch !== 'function') return null;
    let result: ImagePickerResult;
    try {
      result = await launch(STILL_IMAGE_OPTIONS);
    } catch {
      return null;
    }
    if (result?.canceled || !result.assets || result.assets.length === 0) return null;
    const asset = result.assets[0] as ImagePickerAsset | undefined;
    if (!asset?.uri) return null;
    return pickedImageFrom(asset);
  });
}

function captureImageAsync(): Promise<PickedImage | null> {
  return loadImagePicker().then(async (mod) => {
    const launch = mod?.launchCameraAsync;
    if (typeof launch !== 'function') return null;
    let result: ImagePickerResult;
    try {
      result = await launch(STILL_IMAGE_OPTIONS);
    } catch {
      return null;
    }
    if (result?.canceled || !result.assets || result.assets.length === 0) return null;
    const asset = result.assets[0] as ImagePickerAsset | undefined;
    if (!asset?.uri) return null;
    return pickedImageFrom(asset);
  });
}

/**
 * One shared adapter from an Expo picker asset to the service contract,
 * including the normalized EXIF orientation the staged flow needs. SDK 54
 * reports orientation inside the EXIF block — iOS as the numeric tag
 * (1..8), Android sometimes as degrees — so both shapes normalize to the
 * pure module's orientation names. Absent/unknown EXIF maps to `up` (no
 * correction), which is the honest default for already-displayed images.
 */
function pickedImageFrom(asset: ImagePickerAsset): PickedImage {
  return {
    uri: asset.uri,
    mimeType: asset.mimeType,
    fileSize: asset.fileSize,
    width: asset.width,
    height: asset.height,
    ...{ orientation: exifOrientationName(asset.exif) },
  };
}

/** Normalize the picker's EXIF orientation into `up|right|down|left` with the
 * `-mirrored` suffix where the EXIF tag mirrors the frame. */
function exifOrientationName(exif?: Record<string, unknown> | null): string {
  if (!exif) return 'up';
  const raw = exif.Orientation ?? exif['{Orientation}'];
  if (typeof raw === 'number') {
    switch (raw) {
      case 1: return 'up';
      case 2: return 'up-mirrored';
      case 3: return 'down';
      case 4: return 'down-mirrored';
      // EXIF 5 corrects with a 90-degree rotation plus horizontal flip;
      // EXIF 7 corrects with 270 degrees plus the flip.
      case 5: return 'right-mirrored';
      case 6: return 'right';
      case 7: return 'left-mirrored';
      case 8: return 'left';
      default: return 'up';
    }
  }
  if (typeof raw === 'string') {
    const name = raw.toLowerCase();
    if (['up', 'down', 'left', 'right', 'up-mirrored', 'down-mirrored', 'left-mirrored', 'right-mirrored'].includes(name)) return name;
    // Some Android providers report plain degrees instead of a tag.
    if (raw === '90') return 'right';
    if (raw === '180') return 'down';
    if (raw === '270') return 'left';
  }
  return 'up';
}

/** Read the first bytes of one image for magic-byte format detection. The
 * file is read only when its size is within the source bound; the reader
 * degrades to `null` (hint/extension-only resolution) when the file module is
 * unavailable or the read fails. */
export async function readImageMagicBytes(uri: string): Promise<number[] | null> {
  try {
    const { File } = await import('expo-file-system' as unknown as string);
    const file = new File(uri);
    if (file.size > MAX_SOURCE_BYTES) return null;
    const bytes = await file.bytes();
    return Array.from(bytes.slice(0, 12), (value: number) => value);
  } catch {
    return null;
  }
}

function processImageAsync(
  uri: string,
  options: {
    avatarId: string;
    outputFormat: AvatarMime;
    /** The picked source image width, in pixels. */
    sourceWidth: number;
    /** The picked source image height, in pixels. */
    sourceHeight: number;
    targetWidth: number;
    targetHeight: number;
    compress?: number;
    /** EXIF orientation correction, applied before the crop. */
    rotate?: 0 | 90 | 180 | 270;
    flipHorizontal?: boolean;
    /** Square crop in post-rotation pixels; defaults to the center square. */
    crop?: { originX: number; originY: number; size: number };
  },
): Promise<ProcessedImage | null> {
  return loadImageManipulator().then(async (mod) => {
    const manipulate = mod?.ImageManipulator?.manipulate;
    if (typeof manipulate !== 'function') return null;
    try {
      const maxSide = options.targetWidth > 0 ? options.targetWidth : MAX_AVATAR_SIDE_PX;
      // The crop rect arrives in post-rotation pixels when the adjust stage
      // supplied one; the legacy one-shot path center-crops the source.
      const cropRect = options.crop
        ? { originX: options.crop.originX, originY: options.crop.originY, side: options.crop.size }
        : (() => {
            const center = computeCenterCrop(options.sourceWidth, options.sourceHeight, maxSide);
            return { originX: center.offsetX, originY: center.offsetY, side: center.cropSize };
          })();
      // The resize enforces the MIN side the descriptor contract records: a
      // tiny source is brought up to the 128px floor, a large source is
      // bounded by the max side, and nothing in between changes.
      const resizeSide = Math.max(
        MIN_AVATAR_SIDE_PX,
        Math.min(cropRect.side, maxSide),
      );
      // Chain order matters: the crop rect is in post-rotation pixels, and
      // the horizontal flip is applied AFTER crop+resize so the crop
      // coordinates stay in the unflipped post-rotation frame the pure crop
      // contract models (review P1: mirrored EXIF photos).
      let chain = manipulate(uri);
      if (options.rotate && options.rotate > 0) chain = chain.rotate(options.rotate);
      chain = chain.crop({
        originX: cropRect.originX,
        originY: cropRect.originY,
        width: cropRect.side,
        height: cropRect.side,
      }).resize({
        width: resizeSide > 0 ? resizeSide : undefined,
        height: resizeSide > 0 ? resizeSide : undefined,
      });
      if (options.flipHorizontal) chain = chain.flip(FlipType.Horizontal);
      const ref = await chain.renderAsync();
      // The service picks the canonical output format; the ACTUAL saved bytes
      // label the result — never the input MIME.
      const format = SAVE_FORMAT[options.outputFormat] ?? SaveFormat.WEBP;
      const result = await ref.saveAsync({
        format,
        compress: options.compress ?? 1,
        base64: true,
      });
      const width = result.width > 0 ? result.width : resizeSide;
      const height = result.height > 0 ? result.height : resizeSide;
      // Report the MIME of the actual saved bytes: an AVIF source was re-encoded
      // to WebP above, so its result must be labeled `image/webp`, never
      // `image/avif`.
      const mimeType = OUTPUT_MIME[format] ?? 'image/webp';
      const durableUri = await moveProcessedAvatarToDocuments(
        result.uri,
        options.avatarId,
        format,
      );
      return {
        uri: durableUri,
        mimeType,
        fileSize: bytesFromBase64(result.base64),
        width,
        height,
      } satisfies ProcessedImage;
    } catch {
      return null;
    }
  });
}

/** The production client handed to the staged service functions. */
export const client: AvatarUploadClient = {
  pickImageAsync,
  processImageAsync,
};

/**
 * Staged pick (3.11B): launch the library or camera and return the raw source
 * for the editor's adjust stage — nothing is processed or persisted yet. The
 * reader lets the service resolve HEIC/HEIF/missing-MIME sources from magic
 * bytes before showing the adjust surface.
 */
export async function pickProfileImage(
  source: 'library' | 'camera',
): Promise<PickedImage | null> {
  return source === 'camera' ? captureImageAsync() : pickImageAsync();
}

/** The camera shares the processing pipeline; only the launcher differs. */
const cameraClient: AvatarUploadClient = {
  pickImageAsync: captureImageAsync,
  processImageAsync,
};

/** Pick, crop, compress, and validate a single image for the avatar. */
export function pickProfileAvatar(): Promise<AvatarUploadOutcome> {
  return pickAndPrepareAvatar(client, undefined, { readMagicBytes: readImageMagicBytes });
}

/** Capture, crop, compress, and validate a single camera photo for the avatar. */
export function captureProfileAvatar(): Promise<AvatarUploadOutcome> {
  return pickAndPrepareAvatar(cameraClient, undefined, { readMagicBytes: readImageMagicBytes });
}

/** True when the native image engine is loadable on the current device. */
export async function isAvatarUploadAvailable(): Promise<boolean> {
  const [picker, manipulator] = await Promise.all([
    loadImagePicker(),
    loadImageManipulator(),
  ]);
  return typeof picker?.launchImageLibraryAsync === 'function'
    && typeof manipulator?.ImageManipulator?.manipulate === 'function';
}

/** True when camera capture is available on the current device. */
export async function isAvatarCaptureAvailable(): Promise<boolean> {
  const [picker, manipulator] = await Promise.all([
    loadImagePicker(),
    loadImageManipulator(),
  ]);
  return typeof picker?.launchCameraAsync === 'function'
    && typeof manipulator?.ImageManipulator?.manipulate === 'function';
}
