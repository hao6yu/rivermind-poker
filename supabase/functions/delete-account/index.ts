import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import {
  handleDeleteAccountRequest,
  type AccountDeletionAdminClient,
} from './handler.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    const userId = context.userClaims?.id ?? context.jwtClaims?.sub;
    return handleDeleteAccountRequest(
      request,
      typeof userId === 'string' ? userId : null,
      context.supabaseAdmin as unknown as AccountDeletionAdminClient,
    );
  }),
};
