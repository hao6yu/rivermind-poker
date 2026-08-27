import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

/**
 * `avatar-access` — the production, room-authorized avatar reader that backs the
 * client's `signedAvatarAccessor`. It is the ONLY path that can read a private
 * bucket object: it verifies the caller's token, confirms the caller is a member
 * of the requested room, downloads the owner-scoped object, and returns its
 * bytes. Nothing about the bucket, the owner, or the signed token is exposed to
 * the caller — the object path never leaves this function, and an unauthorized
 * caller receives `403` before any bytes are read.
 *
 * Membership + read use the service-role admin client, so the function bypasses
 * Storage RLS and enforces membership itself. The client only ever sees a 403
 * (not a member) or the image bytes — never the underlying object path.
 */

interface RoomMember {
  room_id: string;
  user_id: string;
}

/** A minimal admin client: the membership query + the storage download. */
interface AvatarAccessAdminClient {
  from(table: 'private.multiplayer_room_members'): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeOne(): Promise<{ data: RoomMember | null; error: { message: string } | null }>;
      };
    };
  };
  storage: {
    from(bucket: string): {
      download(objectPath: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
    };
  };
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message, retryable: status >= 500 } }, { status });
}

/**
 * Fetch the `roomId`/`avatarId` path segments after `/avatar-access`. The client
 * URL is `/avatar-access/{roomId}/{avatarId}`, so `segments` is
 * `['avatar-access', roomId, avatarId]`.
 */
function roomAvatarFromPath(pathname: string): { roomId: string; avatarId: string } | null {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  if (segments.length < 3 || segments[0] !== 'avatar-access') return null;
  return { roomId: segments[1], avatarId: segments[2] };
}

export async function handleAvatarAccess(
  request: Request,
  userId: string | null | undefined,
  admin: AvatarAccessAdminClient,
): Promise<Response> {
  const roomId = new URL(request.url).pathname.split('/').filter((s) => s.length > 0)[1];
  const avatarId = new URL(request.url).pathname.split('/').filter((s) => s.length > 0)[2];

  if (typeof roomId !== 'string' || typeof avatarId !== 'string') {
    return errorResponse(404, 'not_found', 'A room and avatar id are required.');
  }
  if (userId == null) {
    return errorResponse(401, 'not_signed_in', 'Sign in (or start a new guest session) to resolve avatars.');
  }

  // Membership: the caller must occupy (or be invited to) this room.
  const { data, error } = await admin
    .from('private.multiplayer_room_members')
    .select('user_id, room_id')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeOne();

  if (error != null) {
    return errorResponse(500, 'membership_check_failed', 'The room could not be verified.');
  }
  if (data == null) {
    return errorResponse(403, 'not_a_room_member', 'You must be in the room to view this avatar.');
  }

  // The object path (`avatarId`) is the owner-scoped bucket object. It is
  // constructed here — from the URL — and never returned to the caller.
  const { data: bytes, error: readError } = await admin.storage.from('avatars').download(avatarId);

  if (readError != null) {
    return errorResponse(500, 'avatar_unavailable', 'The avatar could not be downloaded.');
  }
  if (!bytes) {
    return errorResponse(404, 'not_found', 'The avatar object is missing.');
  }

  const contentType = bytes.type || 'image/webp';
  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': contentType, 'cache-control': 'private, no-cache' },
  });
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    const userId = context.userClaims?.id ?? context.jwtClaims?.sub;
    if (userId == null) {
      return errorResponse(401, 'not_signed_in', 'Sign in (or start a new guest session) to resolve avatars.');
    }
    return handleAvatarAccess(request, userId, context.supabaseAdmin as unknown as AvatarAccessAdminClient);
  }),
};
