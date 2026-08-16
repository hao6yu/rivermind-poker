export const ACCOUNT_DELETION_CONFIRMATION = 'delete-account';

const MAX_BODY_BYTES = 512;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface DeleteUserError {
  code?: string;
}

export interface AccountDeletionAdminClient {
  auth: {
    admin: {
      deleteUser(userId: string, shouldSoftDelete: false): Promise<{ error: DeleteUserError | null }>;
    };
  };
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message, retryable: status >= 500 } }, { status });
}

function confirmedDeletion(value: unknown): boolean {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as Record<string, unknown>).confirmation === ACCOUNT_DELETION_CONFIRMATION;
}

export async function handleDeleteAccountRequest(
  request: Request,
  userId: string | null | undefined,
  admin: AccountDeletionAdminClient,
): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Use POST for account deletion.');
  }
  if (!userId || !UUID_PATTERN.test(userId)) {
    return errorResponse(401, 'account_access', 'Start a new guest session and try again.');
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_BODY_BYTES) {
    return errorResponse(413, 'request_too_large', 'The account deletion request is too large.');
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse(400, 'request_invalid', 'Confirm account deletion and try again.');
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return errorResponse(413, 'request_too_large', 'The account deletion request is too large.');
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return errorResponse(400, 'request_invalid', 'Confirm account deletion and try again.');
  }
  if (!confirmedDeletion(body)) {
    return errorResponse(400, 'confirmation_required', 'Confirm account deletion and try again.');
  }

  try {
    const { error } = await admin.auth.admin.deleteUser(userId, false);
    if (error) {
      console.error('Account deletion failed', { code: error.code ?? 'unknown' });
      return errorResponse(503, 'account_delete_failed', 'The account could not be deleted. Try again.');
    }
  } catch {
    console.error('Unexpected account deletion failure');
    return errorResponse(503, 'account_delete_failed', 'The account could not be deleted. Try again.');
  }

  return Response.json({ deleted: true });
}
