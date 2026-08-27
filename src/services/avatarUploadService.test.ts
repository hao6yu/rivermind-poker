import { describe, expect, it, vi } from 'vitest';

import { pickAndPrepareAvatar, type ProcessedImage } from './avatarUploadService';

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
