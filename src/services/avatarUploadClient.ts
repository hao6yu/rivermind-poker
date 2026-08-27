/**
 * Production avatar-upload client: picks an image, center-crops + resizes it to
 * the canonical avatar square, and returns the bounded descriptor built by the
 * pure `avatarUploadService`. The Expo image modules are loaded dynamically so
 * the service boundary compiles without them and degrades to an
 * "unavailable" outcome when a module is absent (offline / unsupported device).
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

/** A `expo-image-picker` asset exposing the raw source dimensions. */
interface PickerAsset {
  uri?: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
}

/** A loaded `expo-image-picker` module, loosely typed for the dynamic import. */
interface ImagePickerModule {
  ImagePicker?: { pickImageAsync: (options?: Record<string, unknown>) => Promise<unknown> };
}
/** A loaded `expo-image-manipulator` module, loosely typed for the dynamic import. */
interface ImageManipulatorModule {
  ImageManipulator?: {
    manipulate: (source: string) => {
      apply: (ops: Array<{ type: string; x?: number; y?: number; width?: number; height?: number }>) => {
        resize: (size: { width: number; height: number }) => {
          saveAsync: (save: { format: string; compress?: number; base64?: boolean }) => Promise<{ uri: string; size?: number }>;
        };
      };
    };
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

const SAVE_FORMAT: Record<AvatarMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

function pickImageAsync(): Promise<PickedImage | null> {
  return loadNative<ImagePickerModule>('expo-image-picker').then((mod) => {
    const picker = mod?.ImagePicker;
    if (!picker?.pickImageAsync) return null;
    return picker
      .pickImageAsync({ allowsPick: true, allowsMultipick: false, quality: 1, extension: 'webp' })
      .then((result) => {
        const r = result as {
          canceled?: boolean;
          asset?: PickerAsset;
          assets?: PickerAsset[];
          mimeType?: PickedImage['mimeType'];
          fileSize?: PickedImage['fileSize'];
        };
        if (!r || r.canceled) return null;
        const asset = r.asset ?? r.assets?.[0];
        if (!asset?.uri) return null;
        return {
          uri: asset.uri,
          mimeType: asset.mimeType,
          fileSize: asset.fileSize,
          width: asset.width,
          height: asset.height,
        } satisfies PickedImage;
      })
      .catch(() => null);
  });
}

function processImageAsync(
  uri: string,
  options: {
    outputFormat: AvatarMime;
    sourceWidth: number;
    sourceHeight: number;
    targetWidth: number;
    targetHeight: number;
    compress?: number;
  },
): Promise<ProcessedImage | null> {
  return loadNative<ImageManipulatorModule>('expo-image-manipulator').then((mod) => {
    const manipulator = mod?.ImageManipulator;
    if (!manipulator) return null;
    // The crop is computed from the *source* pixel dimensions, not the final
    // square side, so a portrait or landscape source is center-cropped
    // (not top/bottom/side cropped) around its smaller edge.
    const sourceWidth = Math.max(1, Math.trunc(options.sourceWidth));
    const sourceHeight = Math.max(1, Math.trunc(options.sourceHeight));
    const crop = computeCenterCrop(sourceWidth, sourceHeight, MAX_AVATAR_SIDE_PX);
    return manipulator
      .manipulate(uri)
      .apply([{ type: 'crop', x: crop.offsetX, y: crop.offsetY, width: crop.cropSize, height: crop.cropSize }])
      .resize({ width: crop.targetSize > 0 ? crop.targetSize : options.targetWidth, height: crop.targetSize > 0 ? crop.targetSize : options.targetHeight })
      .saveAsync({ format: SAVE_FORMAT[options.outputFormat] ?? 'webp', compress: options.compress ?? 1, base64: false })
      .then((saveResult) => ({
        uri: saveResult.uri,
        mimeType: options.outputFormat,
        fileSize: saveResult.size ?? 0,
        width: crop.targetSize > 0 ? crop.targetSize : options.targetWidth,
        height: crop.targetSize > 0 ? crop.targetSize : options.targetHeight,
      }) satisfies ProcessedImage)
      .catch(() => null);
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
  return Boolean(picker?.ImagePicker?.pickImageAsync && manipulator?.ImageManipulator);
}
