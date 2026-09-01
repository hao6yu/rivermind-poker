import { afterEach, describe, expect, it, vi } from 'vitest';

import { pickProfileAvatar } from './avatarUploadClient';

// The production client loads these native modules dynamically. Mocking them
// lets us verify the real crop geometry (center-crop derived from the source's
// real dimensions) in Node, without Expo installed.
//
// The source image is configurable per-test via the hoistable `sourceImage`
// variable so the crop is exercised against several source shapes.
let sourceImage = { uri: 'file:///source.jpg', mimeType: 'image/jpeg', fileSize: 4096, width: 720, height: 1280 };
let capturedCrop: { x: number; y: number; width: number; height: number } | null = null;
let capturedResize: { width: number; height: number } | null = null;
let capturedSaveFormat: string | null = null;
const fileSystemState = vi.hoisted(() => ({
  deleted: [] as string[],
  existing: new Set<string>(),
  moved: [] as Array<{ from: string; to: string }>,
}));

vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: async () => ({ canceled: false, assets: [sourceImage] }),
}));

vi.mock('expo-image-manipulator', () => {
  const context = {
    crop: (rect: { originX: number; originY: number; width: number; height: number }) => {
      capturedCrop = { x: rect.originX, y: rect.originY, width: rect.width, height: rect.height };
      return context;
    },
    resize: (size: { width?: number | null; height?: number | null }) => {
      capturedResize = { width: size.width ?? 0, height: size.height ?? 0 };
      return context;
    },
    renderAsync: async () => ({
      saveAsync: async (options: { format?: string }) => {
        capturedSaveFormat = options.format ?? null;
        return {
          uri: 'file:///avatar.webp',
          width: capturedResize?.width ?? 0,
          height: capturedResize?.height ?? 0,
          base64: 'AQID',
        };
      },
    }),
  };
  return {
    ImageManipulator: {
      manipulate: (_uri: string) => context,
    },
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  };
});

vi.mock('expo-file-system', () => {
  const segmentUri = (value: string | { uri: string }): string =>
    typeof value === 'string' ? value : value.uri;
  const joinedUri = (segments: Array<string | { uri: string }>): string => {
    const [first = '', ...rest] = segments.map(segmentUri);
    return rest.reduce(
      (current, segment) => `${current.replace(/\/$/, '')}/${segment.replace(/^\//, '')}`,
      first,
    );
  };
  class Directory {
    uri: string;
    constructor(...segments: Array<string | { uri: string }>) {
      this.uri = joinedUri(segments);
    }
    create(): void {
      // Directory creation is idempotent in production.
    }
  }
  class File {
    uri: string;
    constructor(...segments: Array<string | { uri: string }>) {
      this.uri = joinedUri(segments);
    }
    get exists(): boolean {
      return this.uri === 'file:///avatar.webp'
        || this.uri.startsWith('file:///source')
        || fileSystemState.existing.has(this.uri);
    }
    get size(): number {
      return 4096;
    }
    async bytes(): Promise<Uint8Array> {
      return new Uint8Array();
    }
    delete(): void {
      fileSystemState.deleted.push(this.uri);
      fileSystemState.existing.delete(this.uri);
    }
    move(destination: File): void {
      fileSystemState.moved.push({ from: this.uri, to: destination.uri });
      fileSystemState.existing.delete(this.uri);
      this.uri = destination.uri;
      fileSystemState.existing.add(this.uri);
    }
  }
  return {
    Directory,
    File,
    Paths: { document: 'file:///documents' },
  };
});

afterEach(() => {
  capturedCrop = null;
  capturedResize = null;
  capturedSaveFormat = null;
  fileSystemState.deleted.length = 0;
  fileSystemState.existing.clear();
  fileSystemState.moved.length = 0;
  sourceImage = { uri: 'file:///source.jpg', mimeType: 'image/jpeg', fileSize: 4096, width: 720, height: 1280 };
});

describe('avatarUploadClient center-crop (Expo SDK 54 chain)', () => {
  it('center-crops a portrait source around its smaller, vertical edge', async () => {
    sourceImage = { uri: 'file:///portrait.jpg', mimeType: 'image/jpeg', fileSize: 4096, width: 720, height: 1280 };
    const outcome = await pickProfileAvatar();
    expect(outcome.status).toBe('ok');
    // 720×1280 → central 720×720 square, vertically centered (offsetY 280).
    expect(capturedCrop).toEqual({ x: 0, y: 280, width: 720, height: 720 });
    if (outcome.status === 'ok') {
      expect([outcome.descriptor.width, outcome.descriptor.height]).toEqual([720, 720]);
    }
  });

  it('covers the full smaller edge of a large landscape source and bounds the output at 1024', async () => {
    sourceImage = { uri: 'file:///landscape.jpg', mimeType: 'image/jpeg', fileSize: 8192, width: 1920, height: 1080 };
    const outcome = await pickProfileAvatar();
    expect(outcome.status).toBe('ok');
    // The 3.11B contract crops the whole cover square (1080×1080 centered on
    // the long axis) and bounds the artifact through the resize step, so the
    // saved square is 1024×1024 without silently zooming the crop.
    expect(capturedCrop).toEqual({ x: 420, y: 0, width: 1080, height: 1080 });
    expect(capturedResize).toEqual({ width: 1024, height: 1024 });
    if (outcome.status === 'ok') {
      expect([outcome.descriptor.width, outcome.descriptor.height]).toEqual([1024, 1024]);
    }
  });

  it('does not exceed the source side even when the source is smaller than 1024', async () => {
    sourceImage = { uri: 'file:///small.jpg', mimeType: 'image/jpeg', fileSize: 512, width: 500, height: 500 };
    const outcome = await pickProfileAvatar();
    expect(outcome.status).toBe('ok');
    expect(capturedCrop).toEqual({ x: 0, y: 0, width: 500, height: 500 });
    if (outcome.status === 'ok') {
      expect([outcome.descriptor.width, outcome.descriptor.height]).toEqual([500, 500]);
    }
  });

  it('re-encodes an AVIF source to WebP and labels the result image/webp', async () => {
    // AVIF is accepted as an input, but the client pipeline re-encodes it to
    // WebP; the descriptor, upload header, and worker response must report the
    // ACTUAL bytes (image/webp), never the input MIME (image/avif).
    sourceImage = { uri: 'file:///avatar.avif', mimeType: 'image/avif', fileSize: 4096, width: 512, height: 512 };
    const outcome = await pickProfileAvatar();
    expect(outcome.status).toBe('ok');
    expect(capturedSaveFormat).toBe('webp');
    if (outcome.status === 'ok') {
      expect(outcome.mimeType).toBe('image/webp');
      expect(outcome.descriptor.mime).toBe('image/webp');
    }
  });

  it('keeps a PNG source as PNG and requests the PNG save format', async () => {
    sourceImage = { uri: 'file:///avatar.png', mimeType: 'image/png', fileSize: 4096, width: 512, height: 512 };
    const outcome = await pickProfileAvatar();
    expect(outcome.status).toBe('ok');
    expect(capturedSaveFormat).toBe('png');
    if (outcome.status === 'ok') {
      expect(outcome.mimeType).toBe('image/png');
      expect(outcome.descriptor.mime).toBe('image/png');
    }
  });

  it('moves the processed cache file into the durable document directory', async () => {
    const outcome = await pickProfileAvatar();
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    const expected = `file:///documents/rivermind/avatars/${outcome.avatarId}.jpg`;
    expect(outcome.uri).toBe(expected);
    expect(fileSystemState.moved).toEqual([{ from: 'file:///avatar.webp', to: expected }]);
    expect(fileSystemState.existing.has(expected)).toBe(true);
  });
});
