export interface Delivery {
  id: string;
  to: string;
  messageId: string;
  title: string;
  body: string;
  target: 'learn' | 'play' | 'whats_new';
  releaseVersion: string | null;
}
export interface DispatchBackend {
  claim(): Promise<string[]>;
  begin(id: string): Promise<Delivery | null>;
  finish(
    id: string,
    status: 'accepted' | 'failed' | 'unknown',
    receiptId: string | null,
    errorCode: string | null,
  ): Promise<void>;
  invalidate(id: string): Promise<void>;
}
export function pushPayload(d: Delivery) {
  return {
    to: d.to,
    title: d.title,
    body: d.body,
    ttl: 3600,
    priority: 'normal',
    collapseId: 'rivermind-reminders',
    tag: 'rivermind-reminders',
    channelId: 'reminders',
    data: {
      kind: 'rivermind-reminder',
      deliveryId: d.id,
      messageId: d.messageId,
      target: d.target,
      releaseVersion: d.releaseVersion,
    },
  };
}
/** One network attempt per durable claim. Even malformed/ambiguous responses
 * remain consumed: avoiding repeated engagement pushes wins over retrying. */
export async function dispatchNotifications(
  backend: DispatchBackend,
  send: typeof fetch,
  accessToken?: string,
) {
  const ids = await backend.claim();
  let accepted = 0,
    failed = 0,
    unknown = 0,
    skipped = 0;
  for (const id of ids) {
    const d = await backend.begin(id);
    if (!d) {
      skipped++;
      continue;
    }
    try {
      const response = await send('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(pushPayload(d)),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        // 429/5xx are deliberately not retried for these optional reminders.
        const status = response.status >= 500 ? 'unknown' : 'failed';
        await backend.finish(id, status, null, `http_${response.status}`);
        if (status === 'unknown') unknown++;
        else failed++;
        continue;
      }
      const json = (await response.json()) as {
        data?: { status?: string; id?: string; details?: { error?: string } };
      };
      const ticket = json.data;
      if (ticket?.status === 'ok' && typeof ticket.id === 'string') {
        await backend.finish(id, 'accepted', ticket.id, null);
        accepted++;
      } else if (ticket?.status === 'error') {
        const code = [
          'DeviceNotRegistered',
          'MessageTooBig',
          'MessageRateExceeded',
          'MismatchSenderId',
          'InvalidCredentials',
        ].includes(ticket.details?.error ?? '')
          ? ticket.details!.error!
          : 'provider_error';
        await backend.finish(id, 'failed', null, code);
        if (code === 'DeviceNotRegistered') await backend.invalidate(id);
        failed++;
      } else {
        await backend.finish(id, 'unknown', null, 'invalid_response');
        unknown++;
      }
    } catch {
      // A failed database finish cannot undo the durable 'sending' state.
      // Never log the payload, token, provider body, or authorization header.
      await backend
        .finish(id, 'unknown', null, 'unconfirmed')
        .catch(() => undefined);
      unknown++;
    }
  }
  return { claimed: ids.length, accepted, failed, unknown, skipped };
}
