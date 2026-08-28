import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import {
  handleAvatarCleanup,
  listAvatarObjects,
  MAX_AVATAR_CLEANUP_OBJECTS,
  type AvatarCleanupBackend,
} from './handler.ts';
import {
  STORAGE_LIST_BATCH_SIZE,
  type StorageFolderLister,
  type StorageListEntry,
} from '../delete-account/handler.ts';

/**
 * The out-of-band cleanup entry point. It is intentionally NOT user-auth: the
 * sweep runs with the service role after dashboard/Admin-API account
 * deletions, so it requires the project's secret key (`auth: 'secret'`) — the
 * same credential an operator uses for the Admin API — and never a mobile
 * user token. The function still verifies the caller itself: `withSupabase`
 * matches the request's `apikey` header against the runtime secret key, so a
 * caller without the secret key is refused before any byte is read or
 * deleted. (A bearer token is not accepted here.)
 */
export default {
  fetch: withSupabase({ auth: 'secret' }, async (_request, context) => {
    const storage = context.supabaseAdmin.storage.from('avatars');

    // One page of the Storage-API list, or null on error. `listAvatarObjects`
    // drives the pagination and recursion through this lister, so a folder
    // with more than 1,000 entries (and the bucket root itself) is never
    // truncated to a single page.
    const listPage: StorageFolderLister = async (folder, offset) => {
      const { data, error } = await storage.list(folder, {
        limit: STORAGE_LIST_BATCH_SIZE,
        offset,
      });
      if (error) return null;
      return (data ?? []) as StorageListEntry[];
    };

    const backend: AvatarCleanupBackend = {
      // Enumerate the whole bucket through the Storage API (service role),
      // recursively and page by page. Files live at the owner-scoped path
      // `${ownerId}/${avatarId}`; historical nested shapes under an owner
      // (`ownerId/nested/file`) are descended and collected too, so the sweep
      // never reports success while their bytes remain. The fail-closed
      // ceiling aborts the sweep instead of silently skipping objects. The
      // PostgREST `storage` schema is never touched.
      listAllAvatarObjects: async () => {
        try {
          return await listAvatarObjects(listPage, MAX_AVATAR_CLEANUP_OBJECTS);
        } catch {
          return null;
        }
      },
      // The owner folders are validated UUIDs; existence is checked through the
      // GoTrue Admin API (the sanctioned server-only enumeration boundary).
      // The `auth` schema is NOT exposed to PostgREST (config.toml exposes only
      // public + graphql_public), so a direct `from('auth.users')` query is not
      // a valid boundary — this Admin-API listing is. `null` aborts the sweep
      // fail-closed. Paging continues until a short page proves the user list
      // is exhausted; the page cap is a fail-closed ceiling, never a silent
      // truncation.
      filterExistingUserIds: async (ownerIds) => {
        try {
          if (ownerIds.length === 0) return new Set<string>();
          const existing = new Set<string>();
          for (let page = 1; ; page += 1) {
            const { data, error } = await context.supabaseAdmin.auth.admin.listUsers({
              page,
              perPage: 1000,
            });
            if (error) return null;
            const users = (data?.users ?? []) as Array<{ id?: string }>;
            for (const user of users) {
              if (typeof user.id === 'string') existing.add(user.id);
            }
            if (users.length < 1000) break;
            if (page >= 100) return null;
          }
          return existing;
        } catch {
          return null;
        }
      },
      // Storage-API removal deletes the metadata row AND the stored bytes; the
      // bounded batching lives in the shared `delete-account` boundary.
      removeObjects: async (paths) => {
        try {
          const { data, error } = await storage.remove(paths);
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

    return handleAvatarCleanup(backend);
  }),
};
