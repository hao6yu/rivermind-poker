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
import { SaveFormat } from 'expo-image-manipulator';
import type {
  ImageManipulatorContext,
  ImageResult,
  SaveOptions,
} from 'expo-image-manipulator';

/** A loaded `expo-image-picker` module exposing the real SDK 54 launcher.
 * The option/result types are the package's own, so a nonexistent method or
 * option shape can never satisfy this interface. */
interface ImagePickerModule {
  launchImageLibraryAsync?: (options?: ImagePickerOptions) => Promise<ImagePickerResult>;
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

/** Load a native module by non-literal specifier (tsc can't resolve it statically). */
async function loadNative<TNative>(specifier: string): Promise<TNative | null> {
  try {
    const dynamic = await import(specifier as unknown as string);
    return dynamic as unknown as TNative;
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

/** Derive byte length from a base64 body: 3 bytes per 4 base64 chars, minus padding. */
function bytesFromBase64(base64?: string): number {
  if (!base64) return 0;
  const padding = (base64.match(/=+$/) ?? [''])[0].length;
  return Math.round((base64.length / 4) * 3 - padding);
}

function pickImageAsync(): Promise<PickedImage | null> {
  return loadNative<ImagePickerModule>('expo-image-picker').then(async (mod) => {
    const launch = mod?.launchImageLibraryAsync;
    if (typeof launch !== 'function') return null;
    let result: ImagePickerResult;
    try {
      result = await launch({
        allowsEditing: false,
        allowsMultipleSelection: false,
        mediaTypes: 'images',
        quality: 1,
        exif: false,
      });
    } catch {
      return null;
    }
    if (result?.canceled || !result.assets || result.assets.length === 0) return null;
    const asset = result.assets[0] as ImagePickerAsset | undefined;
    if (!asset?.uri) return null;
    return {
      uri: asset.uri,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      width: asset.width,
      height: asset.height,
    } satisfies PickedImage;
  });
}

function processImageAsync(
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
): Promise<ProcessedImage | null> {
  return loadNative<ImageManipulatorModule>('expo-image-manipulator').then(async (mod) => {
    const manipulate = mod?.ImageManipulator?.manipulate;
    if (typeof manipulate !== 'function') return null;
    try {
      const maxSide = options.targetWidth > 0 ? options.targetWidth : MAX_AVATAR_SIDE_PX;
      // The crop is computed from the *source* pixel dimensions (orientation has
      // already been applied by the picker), not the final square side, so a
      // portrait or landscape source is center-cropped around its smaller edge.
      const crop = computeCenterCrop(options.sourceWidth, options.sourceHeight, maxSide);
      const ref = await manipulate(uri)
        .crop({
          originX: crop.offsetX,
          originY: crop.offsetY,
          width: crop.cropSize,
          height: crop.cropSize,
        })
        .resize({
          width: crop.targetSize > 0 ? crop.targetSize : undefined,
          height: crop.targetSize > 0 ? crop.targetSize : undefined,
        })
        .renderAsync();
      const result = await ref.saveAsync({
        format: SAVE_FORMAT[options.outputFormat] ?? SaveFormat.WEBP,
        compress: options.compress ?? 1,
        base64: true,
      });
      const width = result.width > 0 ? result.width : crop.targetSize;
      const height = result.height > 0 ? result.height : crop.targetSize;
      return {
        uri: result.uri,
        mimeType: options.outputFormat,
        fileSize: bytesFromBase64(result.base64),
        width,
        height,
      } satisfies ProcessedImage;
    } catch {
      return null;
    }
  });
}

const client: AvatarUploadClient = {
  pickImageAsync,
  processImageAsync,
};

/** Pick, crop, compress, and validate a single image for the avatar. */
export function pickProfileAvatar(): Promise<AvatarUploadOutcome> {
  return pickAndPrepareAvatar(client);
}

/** True when the native image engine is loadable on the current device. */
export async function isAvatarUploadAvailable(): Promise<boolean> {
  const [picker, manipulator] = await Promise.all([
    loadNative<ImagePickerModule>('expo-image-picker'),
    loadNative<ImageManipulatorModule>('expo-image-manipulator'),
  ]);
  return typeof picker?.launchImageLibraryAsync === 'function'
    && typeof manipulator?.ImageManipulator?.manipulate === 'function';
}
