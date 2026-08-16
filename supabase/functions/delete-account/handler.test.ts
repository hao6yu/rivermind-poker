import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ACCOUNT_DELETION_CONFIRMATION,
  handleDeleteAccountRequest,
  type AccountDeletionAdminClient,
} from './handler';

const userId = '11111111-1111-4111-8111-111111111111';

function request(body: unknown, method = 'POST'): Request {
  return new Request('https://example.test/functions/v1/delete-account', {
    body: method === 'POST' ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json' },
    method,
  });
}

function adminWith(
  result: { error: { code?: string } | null } | Error = { error: null },
): { admin: AccountDeletionAdminClient; deleteUser: ReturnType<typeof vi.fn> } {
  const deleteUser = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return {
    admin: { auth: { admin: { deleteUser } } },
    deleteUser,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('delete-account Edge Function handler', () => {
  it('hard-deletes only the authenticated caller after explicit confirmation', async () => {
    const { admin, deleteUser } = adminWith();
    const response = await handleDeleteAccountRequest(request({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    }), userId, admin);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(deleteUser).toHaveBeenCalledOnce();
    expect(deleteUser).toHaveBeenCalledWith(userId, false);
  });

  it.each([
    ['missing identity', userId.slice(1), { confirmation: ACCOUNT_DELETION_CONFIRMATION }, 401],
    ['missing confirmation', userId, {}, 400],
    ['wrong confirmation', userId, { confirmation: 'delete-history' }, 400],
  ])('rejects %s without calling the admin API', async (_label, identity, body, status) => {
    const { admin, deleteUser } = adminWith();
    const response = await handleDeleteAccountRequest(request(body), identity, admin);

    expect(response.status).toBe(status);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('rejects non-POST, malformed JSON, and oversized bodies', async () => {
    const { admin, deleteUser } = adminWith();
    const getResponse = await handleDeleteAccountRequest(request(null, 'GET'), userId, admin);
    const malformedResponse = await handleDeleteAccountRequest(new Request(
      'https://example.test/functions/v1/delete-account',
      { body: '{bad', method: 'POST' },
    ), userId, admin);
    const oversizedResponse = await handleDeleteAccountRequest(new Request(
      'https://example.test/functions/v1/delete-account',
      { body: JSON.stringify({ confirmation: ACCOUNT_DELETION_CONFIRMATION, padding: 'x'.repeat(600) }), method: 'POST' },
    ), userId, admin);

    expect(getResponse.status).toBe(405);
    expect(malformedResponse.status).toBe(400);
    expect(oversizedResponse.status).toBe(413);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ['an admin error', { error: { code: 'unexpected_failure' } }],
    ['an unexpected exception', new Error('secret database detail')],
  ])('returns a retryable, non-sensitive failure for %s', async (_label, failure) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { admin } = adminWith(failure);
    const response = await handleDeleteAccountRequest(request({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    }), userId, admin);
    const body = await response.json() as { error: Record<string, unknown> };

    expect(response.status).toBe(503);
    expect(body.error).toEqual({
      code: 'account_delete_failed',
      message: 'The account could not be deleted. Try again.',
      retryable: true,
    });
    expect(JSON.stringify(body)).not.toContain('secret database detail');
  });
});
