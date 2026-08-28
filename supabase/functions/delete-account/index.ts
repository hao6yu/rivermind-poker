import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import {
  handleDeleteAccountRequest,
  type AccountDeletionAdminClient,
} from './handler.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    const userId = context.userClaims?.id ?? context.jwtClaims?.sub;

    const admin: AccountDeletionAdminClient = {
      auth: context.supabaseAdmin.auth,
      // Enumerate the user's hosted objects through the Storage API itself:
      // the service role bypasses RLS, and the prefix scopes the list to the
      // caller's own owner folder (a validated UUID), so no other owner's
      // objects are ever enumerated. The PostgREST `storage` schema is NOT
      // exposed, so a direct `schema('storage')` query is not a valid
      // boundary — this list call is.
      listAvatarObjectPaths: async (ownerId) => {
        const paths: string[] = [];
        try {
          for (let offset = 0; offset < 10_000; offset += 1000) {
            const { data, error } = await context.supabaseAdmin.storage
              .from('avatars')
              .list(ownerId, { limit: 1000, offset });
            if (error) return null;
            const entries = (data as Array<{ name?: string }> | null) ?? [];
            for (const entry of entries) {
              if (typeof entry.name === 'string') paths.push(`${ownerId}/${entry.name}`);
            }
            if (entries.length < 1000) break;
          }
          return paths;
        } catch {
          return null;
        }
      },
      // Storage-API removal deletes the metadata row AND the stored bytes.
      // The response lists what WAS removed (`name` is the object path);
      // anything not listed is treated as a failure so the caller can retry.
      removeAvatarObjectPaths: async (paths) => {
        try {
          const { data, error } = await context.supabaseAdmin.storage
            .from('avatars')
            .remove(paths);
          if (error) return paths;
          const removed = new Set(
            (data as Array<{ name?: string }> | null)?.map((entry) => entry.name ?? '') ?? [],
          );
          return paths.filter((path) => !removed.has(path));
        } catch {
          return paths;
        }
      },
    };

    return handleDeleteAccountRequest(
      request,
      typeof userId === 'string' ? userId : null,
      admin,
    );
  }),
};
