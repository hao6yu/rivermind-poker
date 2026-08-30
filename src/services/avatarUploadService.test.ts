import { describe, expect, it, vi } from 'vitest';

import {
  prepareAvatarSource,
  processAdjustedAvatar,
  pickAndPrepareAvatar,
  type AvatarUploadClient,
  type ProcessedImage,
} from './avatarUploadService';
import { IDENTITY_ADJUSTMENT, MAX_SOURCE_BYTES } from '../domain/avatarProcessing';

// The native image modules are loaded dynamically by the service boundary.
// Mocking them lets the pure contract run in Node without Expo installed, while
// still exercising the real pick → validate → crop → descriptor pipeline.
vi.mock('expo-image-picker', () => ({
  ImagePicker: {
    pickImageAsync: async () => ({
      canceled: false,
      assets: [{ uri: 'file:///avatar.jpg', mimeType: 'image/jpeg', fileSize: 4096, width: 720, height: 1280 }],
    }),
  },
}));

vi.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: () => ({
      apply: () => ({
        resize: () => ({
          saveAsync: async () => ({ uri: 'file:///avatar.webp', size: 1234 }),
        }),
      }),
    }),
  },
}));

describe('pickAndPrepareAvatar', () => {
  it('threads the picked source dimensions into processing and builds a square descriptor', async () => {
    let seen: { sourceWidth: number; sourceHeight: number } | null = null;

    const client = {
      pickImageAsync: async () => ({ uri: 'file:///avatar.jpg', mimeType: 'image/jpeg', fileSize: 4096, width: 720, height: 1280 }),
      processImageAsync: async (
        _uri: string,
        options: { sourceWidth: number; sourceHeight: number },
      ): Promise<ProcessedImage> => {
        seen = { sourceWidth: options.sourceWidth, sourceHeight: options.sourceHeight };
        // The client crops the source to its smaller edge and returns that square.
        return { uri: 'file:///avatar.webp', mimeType: 'image/webp', fileSize: 1234, width: 720, height: 720 };
      },
    };

    const outcome = await pickAndPrepareAvatar(client);
    expect(outcome.status).toBe('ok');
    // The fix: processing receives the real 720×1280 source, not 1024×1024.
    expect(seen).toEqual({ sourceWidth: 720, sourceHeight: 1280 });
    // A portrait source resolves to a 720×720 square (the source's smaller edge).
    if (outcome.status === 'ok') {
      expect([outcome.descriptor.width, outcome.descriptor.height]).toEqual([720, 720]);
    }
  });

  it('defaults to the empty 1×1 baseline when the picker reports no dimensions', async () => {
    const client = {
      pickImageAsync: async () => ({ uri: 'file:///avatar.jpg', mimeType: 'image/jpeg', fileSize: 4096 }),
      processImageAsync: async (
        _uri: string,
        options: { sourceWidth: number; sourceHeight: number },
      ): Promise<ProcessedImage> => ({
        uri: 'file:///avatar.webp',
        mimeType: 'image/webp',
        fileSize: 50,
        width: options.sourceWidth,
        height: options.sourceHeight,
      }),
    };
    const outcome = await pickAndPrepareAvatar(client);
    expect(outcome.status).toBe('ok');
    if (outcome.status === 'ok') {
      // 1×1 source → enforce minimum side, so the descriptor is 128×128.
      expect([outcome.descriptor.width, outcome.descriptor.height]).toEqual([128, 128]);
    }
  });
});

describe('staged avatar flow (3.11B)', () => {
  const heicSource = {
    uri: 'file:///photo.heic',
    // iPhone Photos commonly supplies image/heic.
    mimeType: 'image/heic',
    fileSize: 4_000_000,
    width: 4032,
    height: 3024,
    orientation: 'up',
  };

  it('prepares an iPhone HEIC source that the old MIME gate rejected', async () => {
    const prepared = await prepareAvatarSource(heicSource);
    expect(prepared.status).toBe('ok');
    if (prepared.status === 'ok') {
      expect(prepared.identity).toEqual({ kind: 'image/heic', basis: 'hint' });
      expect(prepared.rotation).toBe(0);
    }
  });

  it('resolves missing MIME from magic bytes', async () => {
    const prepared = await prepareAvatarSource(
      { uri: 'file:///IMG_0001', fileSize: 3_000_000, width: 4032, height: 3024 },
      { readMagicBytes: async () => [...Buffer.from('....ftypheic', 'latin1')] },
    );
    expect(prepared.status).toBe('ok');
    if (prepared.status === 'ok') {
      expect(prepared.identity).toEqual({ kind: 'image/heic', basis: 'magic' });
    }
  });

  it('rejects a source past the 25 MiB bound before any processing', async () => {
    const prepared = await prepareAvatarSource({
      ...heicSource,
      fileSize: MAX_SOURCE_BYTES + 1,
    });
    expect(prepared.status).toBe('source-too-large');
  });

  it('processes a confirmed HEIC adjustment into a canonical JPEG artifact', async () => {
    const prepared = await prepareAvatarSource(heicSource);
    if (prepared.status !== 'ok') throw new Error('expected ok preparation');
    const calls: Array<{ compress?: number; rotate?: number; crop?: { originX: number; originY: number; size: number } }> = [];
    const client: AvatarUploadClient = {
      pickImageAsync: async () => null,
      processImageAsync: async (_uri, options) => {
        calls.push({ compress: options.compress, rotate: options.rotate, crop: options.crop });
        return { uri: 'file:///avatar', mimeType: 'image/jpeg', fileSize: 900_000, width: 1024, height: 1024 };
      },
    };
    const outcome = await processAdjustedAvatar(client, prepared, { offsetX: 0.1, offsetY: 0, scale: 1.4 });
    expect(outcome.status).toBe('ok');
    if (outcome.status === 'ok') {
      // HEIC re-encodes to the canonical JPEG output.
      expect(outcome.mimeType).toBe('image/jpeg');
      expect([outcome.descriptor.width, outcome.descriptor.height]).toEqual([1024, 1024]);
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]?.rotate).toBe(0);
    expect(calls[0]?.compress).toBe(1);
    expect(calls[0]?.crop).toEqual({ originX: expect.any(Number), originY: expect.any(Number), size: expect.any(Number) });
  });

  it('walks the compress ladder until the artifact fits 2 MiB', async () => {
    const prepared = await prepareAvatarSource({ ...heicSource, mimeType: 'image/jpeg' });
    if (prepared.status !== 'ok') throw new Error('expected ok preparation');
    const compressions: Array<number | undefined> = [];
    const client: AvatarUploadClient = {
      pickImageAsync: async () => null,
      processImageAsync: async (_uri, options) => {
        compressions.push(options.compress);
        const tooBig = (options.compress ?? 1) > 0.7;
        return {
          uri: 'file:///avatar',
          mimeType: 'image/jpeg',
          fileSize: tooBig ? 3_000_000 : 1_500_000,
          width: 1024,
          height: 1024,
        };
      },
    };
    const outcome = await processAdjustedAvatar(client, prepared, IDENTITY_ADJUSTMENT);
    expect(outcome.status).toBe('ok');
    expect(compressions).toEqual([1, 0.85, 0.7]);
  });

  it('fails closed with output-too-large when the whole ladder overflows', async () => {
    const prepared = await prepareAvatarSource(heicSource);
    if (prepared.status !== 'ok') throw new Error('expected ok preparation');
    const client: AvatarUploadClient = {
      pickImageAsync: async () => null,
      processImageAsync: async () => ({
        uri: 'file:///avatar',
        mimeType: 'image/jpeg',
        fileSize: 5_000_000,
        width: 1024,
        height: 1024,
      }),
    };
    const outcome = await processAdjustedAvatar(client, prepared, IDENTITY_ADJUSTMENT);
    expect(outcome.status).toBe('output-too-large');
  });

  it('reports corrupt sources that cannot decode as not-an-image', async () => {
    const prepared = await prepareAvatarSource(heicSource);
    if (prepared.status !== 'ok') throw new Error('expected ok preparation');
    const client: AvatarUploadClient = {
      pickImageAsync: async () => null,
      processImageAsync: async () => null,
    };
    const outcome = await processAdjustedAvatar(client, prepared, IDENTITY_ADJUSTMENT);
    expect(outcome.status).toBe('not-an-image');
  });

  it('maps a cancelled pick to the cancelled status', async () => {
    const prepared = await prepareAvatarSource(null);
    expect(prepared.status).toBe('cancelled');
  });
});
