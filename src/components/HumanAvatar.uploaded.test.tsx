/**
 * DT-04 (Slice 3.11): an uploaded avatar must be durable identity that renders
 * through the real `HumanAvatar` boundary, not just a storage-unit test. This
 * renders the actual component with a seeded localStorage avatar registry and
 * proves:
 *
 *  - a matching, authorized uploaded reference resolves its persisted URI and
 *    renders the uploaded image (`human-avatar-uploaded`);
 *  - an unmatched avatar id, a stale version, or a foreign avatar rendered
 *    outside its room falls back to initials without rendering the image.
 *
 * The authored PNG asset map is mocked, so neither the binary assets nor any
 * picker/crop state are required; the avatar registry reads real localStorage.
 */
import { createElement, type ReactNode } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../services/betaFeedback', () => ({ recordAppDiagnostic: () => undefined }));
vi.mock('./humanAvatarAssets', () => ({
  humanAvatarSources: {
    'human-ash': 'human-ash', 'human-bay': 'human-bay', 'human-cove': 'human-cove',
    'human-dawn': 'human-dawn', 'human-ember': 'human-ember', 'human-fern': 'human-fern',
  },
}));

vi.mock('react-native', () => {
  const host = (name: string) => {
    const Component = (props: { children?: ReactNode }) => createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  };
  return {
    Image: host('image'),
    StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
    Text: host('text'),
    View: host('view'),
  };
});

vi.mock('../theme', () => ({
  useAppTheme: () => ({
    palette: {
      aqua: '#0a7ea4', aquaSoft: '#e0f4f8', background: '#fff', border: '#ccc',
      muted: '#888', primary: '#123456', primaryText: '#fff', shadow: '#000',
      soft: '#f0f0f0', surface: '#fff', text: '#111', tableLine: '#377566',
      accentSoft: '#e0f4f8', danger: '#BD4052',
    },
  }),
}));

import { AVATAR_REGISTRY_STORAGE_KEY, type UploadedAvatar } from '../services/avatarStorage';
import type { HumanAvatarReference } from '../domain/playerProfile';
import { HumanAvatar } from './HumanAvatar';

/** A memory-backed localStorage so the real avatar registry read runs. */
interface MemoryStorage {
  data: Map<string, string>;
}
const memory = { data: new Map<string, string>() } as MemoryStorage & Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
memory.getItem = (key) => memory.data.get(key) ?? null;
memory.setItem = (key, value) => { memory.data.set(key, String(value)); };
memory.removeItem = (key) => { memory.data.delete(key); };
(globalThis as { localStorage?: Storage }).localStorage = memory as unknown as Storage;

const PERSISTENT_URI = 'file:///library/documents/rivermind/avatars/avatar0001.jpg';

const seededEntry: UploadedAvatar = {
  avatarId: 'avatar0001',
  version: 3,
  ownerId: 'user-1',
  objectPath: 'local:avatar0001.jpg',
  uri: PERSISTENT_URI,
  descriptor: { avatarId: 'avatar0001', version: 3, mime: 'image/jpeg', bytes: 12345, width: 512, height: 512 },
  savedAtMs: 1_700_000_000_000,
};

function renderHumanAvatar(props: { avatar: HumanAvatarReference; displayName?: string; roomId?: string }): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(createElement(HumanAvatar, {
      avatar: props.avatar,
      displayName: props.displayName ?? 'Hao',
      size: 40,
      ...(props.roomId ? { roomId: props.roomId } : {}),
    }));
  });
  if (!renderer) throw new Error('HumanAvatar failed to mount.');
  return renderer;
}

function uploadedImageUris(renderer: ReactTestRenderer): Array<string | undefined> {
  return renderer.root.findAll((node) => node.type === 'image')
    .map((node) => (node.props.source as { uri?: string } | undefined)?.uri);
}

function hasUploadedImage(renderer: ReactTestRenderer): boolean {
  return uploadedImageUris(renderer).includes(PERSISTENT_URI);
}

describe('HumanAvatar uploaded-avatar rendering (DT-04)', () => {
  beforeEach(() => {
    memory.data.clear();
  });

  it('renders the persisted uploaded image for a matching, authorized reference', () => {
    memory.setItem(AVATAR_REGISTRY_STORAGE_KEY, JSON.stringify([seededEntry]));
    const renderer = renderHumanAvatar({ avatar: { kind: 'uploaded', avatarId: 'avatar0001', version: 3 } });
    expect(hasUploadedImage(renderer)).toBe(true);
  });

  it('falls back to initials when the avatar id is unknown', () => {
    memory.setItem(AVATAR_REGISTRY_STORAGE_KEY, JSON.stringify([seededEntry]));
    const renderer = renderHumanAvatar({ avatar: { kind: 'uploaded', avatarId: 'avatar9999', version: 3 } });
    expect(hasUploadedImage(renderer)).toBe(false);
  });

  it('falls back to initials when the persisted version is stale', () => {
    memory.setItem(AVATAR_REGISTRY_STORAGE_KEY, JSON.stringify([seededEntry]));
    const renderer = renderHumanAvatar({ avatar: { kind: 'uploaded', avatarId: 'avatar0001', version: 2 } });
    expect(hasUploadedImage(renderer)).toBe(false);
  });

  it('never renders a foreign room-resolved avatar outside its room', () => {
    const foreign: UploadedAvatar = {
      ...seededEntry,
      ownerId: undefined,
      objectPath: 'signed:room-a:avatar0001.jpg',
    };
    memory.setItem(AVATAR_REGISTRY_STORAGE_KEY, JSON.stringify([foreign]));
    const renderer = renderHumanAvatar({ avatar: { kind: 'uploaded', avatarId: 'avatar0001', version: 3 } });
    expect(hasUploadedImage(renderer)).toBe(false);
  });

  it('renders a foreign room-resolved avatar only inside the room it was learned in', () => {
    const foreign: UploadedAvatar = {
      ...seededEntry,
      ownerId: undefined,
      objectPath: 'signed:room-a:avatar0001.jpg',
    };
    memory.setItem(AVATAR_REGISTRY_STORAGE_KEY, JSON.stringify([foreign]));
    const renderer = renderHumanAvatar({ avatar: { kind: 'uploaded', avatarId: 'avatar0001', version: 3 }, roomId: 'room-a' });
    expect(hasUploadedImage(renderer)).toBe(true);
  });

  it('renders the device-owned avatar anywhere even without a room', () => {
    memory.setItem(AVATAR_REGISTRY_STORAGE_KEY, JSON.stringify([seededEntry]));
    const renderer = renderHumanAvatar({ avatar: { kind: 'uploaded', avatarId: 'avatar0001', version: 3 }, roomId: 'room-b' });
    expect(hasUploadedImage(renderer)).toBe(true);
  });
});
