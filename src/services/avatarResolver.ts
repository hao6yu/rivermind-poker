/**
 * Avatar resolution: cache-first, device-local, and room-authorized.
 *
 * Uploaded avatars resolve *exclusively* through the current device's local
 * registry. A seat never renders a raw remote or signed URL: it renders the
 * local-registry cache. When the cache is missing or stale, the cache is filled
 * once from the room-authorized, short-lived remote accessor, and that filled
 * entry is what HumanAvatar renders.
 *
 * The remote accessor is injectable so the resolution logic (cache key +
 * version match + local persistence) is unit tested without Expo or the signed
 * worker. The production accessor, `signedAvatarAccessor`, is the boundary that
 * asks the private bucket for a short-lived, room-authorized image and caches
 * it locally — so neither the object path nor the signed token ever leaves the
 * accessor.
 */
import {
  getUploadedAvatar,
  listUploadedAvatars,
  persistUploadedAvatar,
  type AvatarRegistryStorage,
  type UploadedAvatar,
} from './avatarStorage';
import type { AvatarMime } from '../domain/avatarProcessing';

/** The bounded reference carried on the wire and resolved against the cache. */
export interface AvatarReference {
  avatarId: string;
  version: number;
}

/** The raw image bytes a room-authorized accessor resolves, cached locally. */
export interface RemoteAvatarBytes {
  /** A local, file-backed URI the client can render. */
  uri: string;
  mimeType: AvatarMime;
}

/**
 * A room-authorized remote accessor: returns the image bytes for a reference
 * within a room, or `null` when the caller is not authorized (wrong room, or
 * not a room member). `null` is the contract's "I cannot see this avatar", not
 * an error.
 */
export interface AvatarRemoteAccessor {
  fetchAvatar(reference: AvatarReference, roomId: string): Promise<RemoteAvatarBytes | null>;
}

/** A remote-resolved cache entry belongs to the room it was resolved under. */
function belongsToRoom(entry: UploadedAvatar, roomId: string): boolean {
  return typeof entry.objectPath === 'string' && entry.objectPath.startsWith(`signed:${roomId}:`);
}

/**
 * Resolve a single avatar reference: return the local-registry entry when it is
 * present, current, and belongs to the requesting room — otherwise fill it from
 * the room-authorized accessor, persist it, and return the entry. Returns
 * `null` when the accessor declines (unauthorized), so a seat simply falls back
 * to initials. A cache entry resolved under another room never leaks here.
 */
export function resolveAvatar(
  accessor: AvatarRemoteAccessor,
  reference: AvatarReference,
  roomId: string,
  storage: AvatarRegistryStorage | null = null,
): Promise<UploadedAvatar | null> {
  const cached = storage ? getUploadedAvatar(reference.avatarId, storage) : getUploadedAvatar(reference.avatarId);
  if (cached && cached.version === reference.version && belongsToRoom(cached, roomId)) {
    return Promise.resolve(cached);
  }
  return accessor.fetchAvatar(reference, roomId).then((bytes) => {
    if (!bytes) return null;
    // Preserve an existing entry's owner so a self-uploaded avatar keeps its
    // ownership marker when the room resolves it: the object path becomes the
    // room-scoped `signed` marker, but the device must still know this device
    // hosts the user's OWN object (so cleanup targets `${ownerId}/${avatarId}`).
    const existing = storage ? getUploadedAvatar(reference.avatarId, storage) : getUploadedAvatar(reference.avatarId);
    const ownerId = existing?.ownerId;
    const avatar: UploadedAvatar = {
      avatarId: reference.avatarId,
      version: reference.version,
      ownerId,
      objectPath: `signed:${roomId}:${reference.avatarId}`,
      uri: bytes.uri,
      descriptor: {
        avatarId: reference.avatarId,
        version: reference.version,
        mime: bytes.mimeType,
        bytes: 0,
        width: 0,
        height: 0,
      },
      savedAtMs: Date.now(),
    };
    return storage ? persistUploadedAvatar(avatar, storage) : persistUploadedAvatar(avatar);
  });
}

/**
 * Resolve (fill, when needed) every reference in a room, in parallel. Each fill
 * is independent and unauthorized results are skipped, so a partial set never
 * blocks the room.
 */
export async function resolveRoomAvatars(
  roomId: string,
  references: AvatarReference[],
  accessor: AvatarRemoteAccessor,
  storage: AvatarRegistryStorage | null = null,
): Promise<number> {
  const filled = await Promise.all(
    references.map((reference) => resolveAvatar(accessor, reference, roomId, storage)),
  );
  // Count how many references were actually present or freshly resolved.
  return filled.reduce((count, avatar) => (avatar ? count + 1 : count), 0);
}

/** The references currently registered on this device. */
export function deviceAvatarReferences(storage: AvatarRegistryStorage | null = null): AvatarReference[] {
  return listUploadedAvatars(storage).map(({ avatarId, version }) => ({ avatarId, version }));
}

/**
 * The absolute base URL of the hosted Edge Functions, or '' when the release
 * configuration provides none. `EXPO_PUBLIC_AVATAR_ACCESS_URL` wins (it lets a
 * deployment front the worker with its own domain); otherwise the URL is
 * derived from `EXPO_PUBLIC_SUPABASE_URL`, which every release already
 * configures: `https://<ref>.supabase.co` → `https://<ref>.supabase.co/functions/v1`.
 * A relative URL can never reach `fetch` — React Native rejects it — so when
 * neither env value exists the accessor degrades to "not resolvable" and every
 * seat falls back to initials.
 */
function edgeFunctionsBaseUrl(): string {
  const configured = typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_AVATAR_ACCESS_URL : undefined;
  const trimmed = typeof configured === 'string' ? configured.trim().replace(/\/+$/, '') : '';
  if (trimmed) return trimmed;
  const supabaseUrl = typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_SUPABASE_URL : undefined;
  const base = typeof supabaseUrl === 'string' ? supabaseUrl.trim().replace(/\/+$/, '') : '';
  return base ? `${base}/functions/v1` : '';
}

/**
 * The production room-authorized accessor. Asks the private avatar-access
 * worker for the image bytes of the reference, then caches them locally. A
 * non-OK response (not a room member) resolves to `null` so the seat falls back
 * to initials without ever seeing the caller token. The worker URL and object
 * path never leave this function.
 */
export function signedAvatarAccessor(accessToken: string): AvatarRemoteAccessor {
  const baseUrl = edgeFunctionsBaseUrl();
  return {
    fetchAvatar: async (reference, roomId) => {
      if (!baseUrl) return null;
      const url = `${baseUrl}/avatar-access/${encodeURIComponent(roomId)}/${encodeURIComponent(reference.avatarId)}`
        + `?v=${reference.version}`;
      let response: Response;
      try {
        response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      } catch {
        return null;
      }
      if (!response.ok || !response.body) return null;

      // Persist the bytes to a local file so the rendered image is always the
      // device cache, never the remote URL. The signed token is consumed once
      // here and dropped.
      try {
        const blob = await response.blob();
        const data = await blob.arrayBuffer();
        const { File, Paths } = await import('expo-file-system' as unknown as string);
        const fileName = `${reference.avatarId}-${reference.version}-${Date.now()}.bin`;
        const file = new File(Paths.cache, fileName);
        file.write(data instanceof Uint8Array ? data : new Uint8Array(data));
        const mimeType = response.headers?.get('content-type')?.split(';')[0] ?? 'image/webp';
        return { uri: file.uri, mimeType: mimeType as AvatarMime };
      } catch {
        return null;
      }
    },
  };
}
