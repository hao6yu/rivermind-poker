export interface ReceiptBackend {
  pending(): Promise<Array<{ id: string; receipt_id: string }>>;
  finish(
    id: string,
    status: 'handed_off' | 'failed',
    errorCode: string | null,
  ): Promise<void>;
  invalidate(id: string): Promise<void>;
}
export async function checkNotificationReceipts(
  backend: ReceiptBackend,
  send: typeof fetch,
  accessToken?: string,
) {
  const pending = await backend.pending();
  if (!pending.length) return 0;
  const response = await send('https://exp.host/--/api/v2/push/getReceipts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ ids: pending.map((r) => r.receipt_id) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return 0;
  const json = (await response.json()) as {
    data?: Record<string, { status?: string; details?: { error?: string } }>;
  };
  let checked = 0;
  for (const row of pending) {
    const receipt = json.data?.[row.receipt_id];
    if (receipt?.status === 'ok') {
      await backend.finish(row.id, 'handed_off', null);
      checked++;
    } else if (receipt?.status === 'error') {
      const code =
        receipt.details?.error === 'DeviceNotRegistered'
          ? 'DeviceNotRegistered'
          : 'receipt_error';
      await backend.finish(row.id, 'failed', code);
      if (code === 'DeviceNotRegistered') await backend.invalidate(row.id);
      checked++;
    }
  }
  return checked;
}
