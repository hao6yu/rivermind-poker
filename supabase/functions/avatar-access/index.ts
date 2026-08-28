import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import {
  handleAvatarAccess,
  type AvatarAccessBackend,
} from './handler.ts';
import {
  normalizeMultiplayerCanonicalState,
} from '../multiplayer-room/stateContract.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    const userId = context.userClaims?.id ?? context.jwtClaims?.sub;
    if (typeof userId !== 'string') {
      return Response.json(
        {
          error: {
            code: 'not_signed_in',
            message: 'Sign in (or start a new guest session) to resolve avatars.',
            retryable: false,
          },
        },
        { status: 401 },
      );
    }

    const backend: AvatarAccessBackend = {
      // The reviewed, service-role RPC loads the current coordinator state.
      loadRoom: async (roomId) => {
        try {
          const result = await context.supabaseAdmin.rpc(
            'multiplayer_load_private_room',
            { p_room_id: roomId },
          );
          return result.error
            ? null
            : normalizeMultiplayerCanonicalState(result.data, roomId);
        } catch {
          return null;
        }
      },
      // The owner-scoped object path embeds the owner; the path never leaves.
      downloadAvatar: async (ownerId, avatarId) =>
        context.supabaseAdmin.storage.from('avatars').download(`${ownerId}/${avatarId}`),
    };

    return handleAvatarAccess(request, userId, backend);
  }),
};
