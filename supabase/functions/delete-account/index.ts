import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import {
  handleDeleteAccountRequest,
  removeAvatarObjectPathsBatched,
  collectAvatarObjects,
  AVATAR_REMOVE_BATCH_SIZE,
  MAX_AVATAR_OBJECTS,
  STORAGE_LIST_BATCH_SIZE,
  type AccountDeletionAdminClient,
  type StorageFolderLister,
  type StorageListEntry,
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
      //
      // Listing is recursive and page-by-page (the shared `collectAvatarObjects`
      // walk): every folder under the owner is descended with explicit offsets,
      // so an owner folder with more than 1,000 objects — or historical nested
      // shapes (`owner/nested/file`) — is fully enumerated, never truncated to
      // a prefix. The fail-closed `MAX_AVATAR_OBJECTS` ceiling aborts the whole
      // deletion (returning `null`) instead of dropping objects, so the auth
      // user is never deleted while avatar bytes remain.
      listAvatarObjectPaths: async (ownerId) => {
        try {
          const listPage: StorageFolderLister = async (folder, offset) => {
            const { data, error } = await context.supabaseAdmin.storage
              .from('avatars')
              .list(folder, { limit: STORAGE_LIST_BATCH_SIZE, offset });
            if (error) return null;
            return (data ?? []) as StorageListEntry[];
          };
          const collected = await collectAvatarObjects(listPage, [ownerId], MAX_AVATAR_OBJECTS);
          return collected === null ? null : collected.map((object) => object.path);
        } catch {
          return null;
        }
      },
      // Storage-API removal deletes the metadata row AND the stored bytes.
      // The response lists what WAS removed (`name` is the object path);
      // anything not listed is treated as a failure so the caller can retry.
      // Supabase caps one remove call at 1,000 objects, so the paths are
      // removed in bounded batches and the union of failures is returned.
      removeAvatarObjectPaths: (paths) => removeAvatarObjectPathsBatched(async (chunk) => {
        try {
          const { data, error } = await context.supabaseAdmin.storage
            .from('avatars')
            .remove(chunk);
          if (error) return chunk;
          const removed = new Set(
            (data as Array<{ name?: string }> | null)?.map((entry) => entry.name ?? '') ?? [],
          );
          return chunk.filter((path) => !removed.has(path));
        } catch {
          return chunk;
        }
      }, paths),
    };

    return handleDeleteAccountRequest(
      request,
      typeof userId === 'string' ? userId : null,
      admin,
    );
  }),
};
