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

vi.mock('expo-image-picker', () => ({
  ImagePicker: {
    pickImageAsync: async () => ({ canceled: false, assets: [sourceImage] }),
  },
}));

vi.mock('expo-image-manipulator', () => {
  const manipulator = {
    manipulate: (_uri: string) => ({
      apply: (ops: Array<{ type: string; x?: number; y?: number; width?: number; height?: number }>) => {
        const op = ops[0];
        capturedCrop = op
          ? { x: op.x ?? 0, y: op.y ?? 0, width: op.width ?? 0, height: op.height ?? 0 }
          : null;
        return {
          resize: (_size: { width: number; height: number }) => ({
            saveAsync: async () => ({ uri: 'file:///avatar.webp', size: 2048 }),
          }),
        };
      },
    }),
  };
  return { ImageManipulator: manipulator };
});

afterEach(() => {
  capturedCrop = null;
  sourceImage = { uri: 'file:///source.jpg', mimeType: 'image/jpeg', fileSize: 4096, width: 720, height: 1280 };
});

describe('avatarUploadClient center-crop', () => {
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

  it('limits the crop to the max avatar side even for a large landscape source', async () => {
    sourceImage = { uri: 'file:///landscape.jpg', mimeType: 'image/jpeg', fileSize: 8192, width: 1920, height: 1080 };
    const outcome = await pickProfileAvatar();
    expect(outcome.status).toBe('ok');
    // 1920×1080's smaller edge (1080) still exceeds the 1024 cap, so the crop
    // square is 1024×1024 centered at (448, 28) — not a 1080 square.
    expect(capturedCrop).toEqual({ x: 448, y: 28, width: 1024, height: 1024 });
  });

  it('does not exceed the source side even when the source is smaller than 1024', async () => {
    sourceImage = { uri: 'file:///small.jpg', mimeType: 'image/jpeg', fileSize: 512, width: 500, height: 500 };
    const outcome = await pickProfileAvatar();
    expect(outcome.status).toBe('ok');
    expect(capturedCrop).toEqual({ x: 0, y: 0, width: 500, height: 500 });
  });
});
