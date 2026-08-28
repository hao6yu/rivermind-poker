import type {
  MultiplayerCoordinatorState,
} from '../../../src/domain/multiplayer/contracts.ts';
import {
  normalizeMultiplayerCanonicalState,
} from '../multiplayer-room/stateContract.ts';
import {
  BOUNDED_AVATAR_ID,
} from '../../../src/domain/playerProfile.ts';
import { detectAvatarMime } from '../../../src/domain/avatarProcessing.ts';

/**
 * `avatar-access` — the production, room-authorized avatar reader that backs the
 * client's `signedAvatarAccessor`. It is the ONLY path that can read a private
 * bucket object: it verifies the caller's token, confirms the caller is a
 * member of the requested room, confirms the requested avatar is a human
 * seat's uploaded avatar in that same room, downloads the owner-scoped object,
 * and returns its bytes. Nothing about the bucket, the owner, or the signed
 * token is exposed to the caller — the object path never leaves this function,
 * and an unauthorized caller receives `403` before any bytes are read.
 *
 * Membership + object read use the service-role admin client, so the function
 * bypasses Storage RLS and enforces membership and owner ownership itself. The
 * client only ever sees a `403` (not a member, or not a seat avatar) or the
 * image bytes — never the underlying object path.
 */

/** A bounded, opaque avatar identifier. The client carries it; the worker never
 * trusts it on its own as authorization. This matches the client-side
 * `BOUNDED_AVATAR_ID` exactly, so the wire shape is enforced on both sides. */
export const AVATAR_ID_PATTERN = BOUNDED_AVATAR_ID;
const ROOM_ID_MAX_LENGTH = 128;

/**
 * The reviewed, server-only boundaries the worker depends on. Injected so the
 * authorization logic is unit tested without Expo or the real Supabase client.
 */
export interface AvatarAccessBackend {
  /**
   * Load the room's current coordinator state through the reviewed
   * `multiplayer_load_private_room` RPC, or `null` when the room has expired.
   */
  loadRoom(roomId: string): Promise<MultiplayerCoordinatorState | null>;
  /** Download the owner-scoped avatar object via the service role. */
  downloadAvatar(ownerId: string, avatarId: string): Promise<{ data: Blob | null; error: { message?: string } | null }>;
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message, retryable: status >= 500 } }, { status });
}

/**
 * Fetch the `roomId`/`avatarId` path segments after `/avatar-access`. The
 * function URL is `/functions/v1/avatar-access/{roomId}/{avatarId}`, so
 * `avatar-access` may sit behind the `/functions/v1` prefix; take the two
 * following segments.
 */
function roomAvatarFromPath(pathname: string): { roomId: string; avatarId: string } | null {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const index = segments.indexOf('avatar-access');
  if (index === -1 || index + 2 >= segments.length) return null;
  return { roomId: segments[index + 1], avatarId: segments[index + 2] };
}

/**
 * Resolve the owner to read the avatar from. The caller must occupy a human
 * seat in the loaded room, and the requested id must be the uploaded avatar of
 * some human seat in that same room. The owner is the matching seat's id.
 *
 * This is the whole security boundary: a request for another room's avatar, or
 * for an id that is not a human seat's uploaded avatar in this room, returns
 * `null` — so cross-room, arbitrary-id, and wrong-seat requests are all refused
 * before any bytes are read. The avatar id is never, by itself, authorization.
 */
export function authorizeAvatarAccess(
  state: MultiplayerCoordinatorState | null,
  userId: string,
  avatarId: string,
): { ownerId: string } | null {
  if (!state) return null;
  const seats = state.seats;

  // Membership: the caller must occupy a human seat in this room.
  const isMember = seats.some(
    (seat) => seat.kind === 'human' && seat.userId === userId,
  );
  if (!isMember) return null;

  // Ownership: the requested id must be the uploaded avatar of a human seat here.
  const ownerSeat = seats.find(
    (seat) =>
      seat.kind === 'human'
      && seat.avatar
      && seat.avatar.kind === 'uploaded'
      && seat.avatar.avatarId === avatarId,
  );
  if (!ownerSeat || !ownerSeat.userId) return null;
  return { ownerId: ownerSeat.userId };
}

/**
 * The `avatar-access` entry point. Every branch is a hard boundary:
 *  - non-GET → `405`;
 *  - no caller → `401`;
 *  - malformed room id / avatar id (out of bounds, wrong shape) → `400`/`403`;
 *  - the caller is not a room member, or the id is not a human seat's uploaded
 *    avatar in that room → `403`;
 *  - a missing or unreadable object → `404`/`500`.
 * Only an authorized call returns the image bytes.
 */
export async function handleAvatarAccess(
  request: Request,
  userId: string | null | undefined,
  backend: AvatarAccessBackend,
): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse(405, 'method_not_allowed', 'GET is required to resolve an avatar.');
  }
  if (userId == null) {
    return errorResponse(401, 'not_signed_in', 'Sign in (or start a new guest session) to resolve avatars.');
  }

  const path = roomAvatarFromPath(new URL(request.url).pathname);
  if (!path) {
    return errorResponse(404, 'not_found', 'A room and avatar id are required.');
  }
  const { roomId, avatarId } = path;

  if (roomId.length < 1 || roomId.length > ROOM_ID_MAX_LENGTH) {
    return errorResponse(400, 'bad_request', 'The room identifier is invalid.');
  }
  if (!AVATAR_ID_PATTERN.test(avatarId)) {
    // A malformed or foreign id is never trusted as authorization.
    return errorResponse(403, 'not_authorized', 'The avatar could not be authorized.');
  }

  // Load the room's current coordinator state through the reviewed RPC.
  let state: MultiplayerCoordinatorState | null = null;
  try {
    state = await backend.loadRoom(roomId);
  } catch {
    return errorResponse(500, 'room_check_failed', 'The room could not be verified.');
  }

  const authorized = authorizeAvatarAccess(state, userId, avatarId);
  if (!authorized) {
    return errorResponse(403, 'not_authorized', 'You must be in the room to view this avatar.');
  }

  const { data, error } = await backend.downloadAvatar(authorized.ownerId, avatarId);
  if (error != null) {
    return errorResponse(500, 'avatar_unavailable', 'The avatar could not be downloaded.');
  }
  if (!data) {
    return errorResponse(404, 'not_found', 'The avatar object is missing.');
  }

  // Content-bound the bytes themselves: even with the bucket's
  // `allowed_mime_types` enforced, the stored object's magic bytes must match a
  // renderable image before the worker serves them. The DETECTED mime — not
  // the storage metadata (`Blob.type`), which is client-asserted and may not
  // match the bytes — is what the response carries, so PNG bytes uploaded with
  // `image/webp` metadata are still served as PNG.
  const magic = await readMagicBytes(data);
  const mime = detectAvatarMime([...magic]);
  if (mime !== 'image/png' && mime !== 'image/jpeg' && mime !== 'image/webp') {
    return errorResponse(500, 'avatar_unavailable', 'The avatar object is not a supported image.');
  }

  return new Response(data, {
    status: 200,
    headers: {
      'content-type': mime,
      'cache-control': 'private, no-cache',
    },
  });
}

/** The first 12 bytes of the object, enough for every supported signature. */
async function readMagicBytes(blob: Blob): Promise<Uint8Array> {
  const slice = blob.slice(0, 12);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}
