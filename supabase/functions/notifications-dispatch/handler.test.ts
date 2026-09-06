import { describe, it, expect, vi } from 'vitest';
import {
  dispatchNotifications,
  pushPayload,
  type Delivery,
  type DispatchBackend,
} from './handler';
import { checkNotificationReceipts } from './receipts';
const delivery: Delivery = {
  id: '11111111-1111-4111-8111-111111111111',
  to: 'ExpoPushToken[test]',
  messageId: 'tip.position',
  title: 'Tip',
  body: 'Think about position.',
  target: 'learn',
  releaseVersion: null,
};
function ledger() {
  let begun = false;
  const backend: DispatchBackend = {
    claim: async () => [delivery.id],
    begin: vi.fn(async () => {
      if (begun) return null;
      begun = true;
      return delivery;
    }),
    finish: vi.fn(async () => {}),
    invalidate: vi.fn(async () => {}),
  };
  return backend;
}
describe('notification delivery', () => {
  it('does not send a second request when the job is repeated', async () => {
    const db = ledger();
    const send = vi.fn(async () =>
      Response.json({ data: { status: 'ok', id: 'receipt' } }),
    );
    expect((await dispatchNotifications(db, send)).accepted).toBe(1);
    expect((await dispatchNotifications(db, send)).skipped).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('consumes ambiguous timeouts without retrying', async () => {
    const db = ledger();
    const send = vi.fn(async () => {
      throw new Error('timeout');
    });
    expect((await dispatchNotifications(db, send)).unknown).toBe(1);
    await dispatchNotifications(db, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.finish).toHaveBeenCalledWith(
      delivery.id,
      'unknown',
      null,
      'unconfirmed',
    );
  });
  it.each([429, 500, 503])('does not blindly retry HTTP %s', async (status) => {
    const db = ledger();
    const send = vi.fn(async () => new Response('', { status }));
    await dispatchNotifications(db, send);
    await dispatchNotifications(db, send);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('disables invalid device tokens', async () => {
    const db = ledger();
    await dispatchNotifications(db, async () =>
      Response.json({
        data: { status: 'error', details: { error: 'DeviceNotRegistered' } },
      }),
    );
    expect(db.invalidate).toHaveBeenCalledWith(delivery.id);
  });
  it('uses one collapse slot and a short expiry for engagement messages', () => {
    const payload = pushPayload(delivery);
    expect(payload.collapseId).toBe(payload.tag);
    expect(payload.ttl).toBe(3600);
    expect(payload.data.deliveryId).toBe(delivery.id);
    expect(payload).not.toHaveProperty('badge');
    expect(payload).not.toHaveProperty('sound');
  });
  it('checks receipts without resending the message', async () => {
    const db = {
      pending: async () => [{ id: delivery.id, receipt_id: 'receipt' }],
      finish: vi.fn(async () => {}),
      invalidate: vi.fn(async () => {}),
    };
    const send = vi.fn(async (_url: RequestInfo | URL) =>
      Response.json({
        data: {
          receipt: {
            status: 'error',
            details: { error: 'DeviceNotRegistered' },
          },
        },
      }),
    );
    expect(await checkNotificationReceipts(db, send)).toBe(1);
    expect(db.invalidate).toHaveBeenCalledWith(delivery.id);
    expect(send.mock.calls[0]?.[0]).toContain('/getReceipts');
  });
});
