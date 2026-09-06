import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { dispatchNotifications, type Delivery } from './handler.ts';
import { checkNotificationReceipts } from './receipts.ts';
export default {
  fetch: withSupabase({ auth: 'secret' }, async (request, context) => {
    if (request.method !== 'POST')
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    const db = context.supabaseAdmin;
    try {
      const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
      // Receipts expire at Expo after 24 hours. A missing receipt remains
      // unconfirmed and is never grounds for resending the message.
      const { error: expiryError } = await db
        .from('notification_deliveries')
        .update({ status: 'unknown', error_code: 'receipt_expired' })
        .eq('status', 'accepted')
        .lt(
          'created_at',
          new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
        );
      if (expiryError) throw expiryError;
      const invalidate = async (id: string) => {
        const { error } = await db.rpc('invalidate_notification_device', {
          p_delivery_id: id,
        });
        if (error) throw error;
      };
      const receipts = await checkNotificationReceipts(
        {
          pending: async () => {
            const { data, error } = await db
              .from('notification_deliveries')
              .select('id,receipt_id')
              .eq('status', 'accepted')
              .lte(
                'created_at',
                new Date(Date.now() - 15 * 60_000).toISOString(),
              )
              .gte(
                'created_at',
                new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
              )
              .limit(100);
            if (error) throw error;
            return data as Array<{ id: string; receipt_id: string }>;
          },
          finish: async (id, status, errorCode) => {
            const { error } = await db
              .from('notification_deliveries')
              .update({
                status,
                error_code: errorCode,
                receipt_checked_at: new Date().toISOString(),
              })
              .eq('id', id)
              .eq('status', 'accepted');
            if (error) throw error;
          },
          invalidate,
        },
        fetch,
        accessToken,
      ).catch(() => 0);
      const result = await dispatchNotifications(
        {
          claim: async () => {
            const { data, error } = await db.rpc('claim_notification_batch', {
              p_limit: 10,
            });
            if (error) throw error;
            return data as string[];
          },
          begin: async (id) => {
            const { data, error } = await db.rpc('begin_notification_send', {
              p_delivery_id: id,
            });
            if (error) throw error;
            return data as Delivery | null;
          },
          finish: async (id, status, receiptId, errorCode) => {
            const { error } = await db
              .from('notification_deliveries')
              .update({ status, receipt_id: receiptId, error_code: errorCode })
              .eq('id', id)
              .eq('status', 'sending');
            if (error) throw error;
          },
          invalidate,
        },
        fetch,
        accessToken,
      );
      return Response.json({ ...result, receipts });
    } catch {
      return Response.json({ error: 'dispatch_unavailable' }, { status: 503 });
    }
  }),
};
