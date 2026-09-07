import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { handleRegistration } from './handler.ts';
export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) =>
    handleRegistration(
      request,
      context.userClaims?.id ?? context.jwtClaims?.sub ?? null,
      async (name, args) => context.supabaseAdmin.rpc(name, args),
    ),
  ),
};
