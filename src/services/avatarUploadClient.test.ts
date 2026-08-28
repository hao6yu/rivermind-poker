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
      saveAsync: async () => ({
        uri: 'file:///avatar.webp',
        width: capturedResize?.width ?? 0,
        height: capturedResize?.height ?? 0,
        base64: 'AQID',
      }),
    }),
  };
  return {
    ImageManipulator: {
      manipulate: (_uri: string) => context,
    },
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  };
});

afterEach(() => {
  capturedCrop = null;
  capturedResize = null;
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

  it('limits the crop to the max avatar side even for a large landscape source', async () => {
    sourceImage = { uri: 'file:///landscape.jpg', mimeType: 'image/jpeg', fileSize: 8192, width: 1920, height: 1080 };
    const outcome = await pickProfileAvatar();
    expect(outcome.status).toBe('ok');
    // 1920×1080's smaller edge (1080) still exceeds the 1024 cap, so the crop
    // square is 1024×1024 centered at (448, 28) — not a 1080 square.
    expect(capturedCrop).toEqual({ x: 448, y: 28, width: 1024, height: 1024 });
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
});
