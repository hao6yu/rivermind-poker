import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.');
}

function client() {
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const owner = client();
const attacker = client();

try {
  const [{ data: ownerAuth, error: ownerAuthError }, { data: attackerAuth, error: attackerAuthError }] = await Promise.all([
    owner.auth.signInAnonymously(),
    attacker.auth.signInAnonymously(),
  ]);
  if (ownerAuthError) throw ownerAuthError;
  if (attackerAuthError) throw attackerAuthError;
  const ownerId = ownerAuth.user?.id;
  assert(ownerId && ownerId !== attackerAuth.user?.id, 'Quota verification requires distinct authenticated users.');

  const { error: directClaimError } = await owner.rpc('claim_coach_review_slot', { p_user_id: ownerId });
  assert(directClaimError, 'A mobile client could call the server-only quota claim function.');

  const { error: forgedClaimError } = await attacker.rpc('claim_coach_review_slot', { p_user_id: ownerId });
  assert(forgedClaimError, 'Another user could claim quota for the owner.');

  const { error: directInsertError } = await owner.from('coach_daily_usage').insert({
    user_id: ownerId,
    request_count: 0,
  });
  assert(directInsertError, 'The owner could create or reset server-managed quota directly.');

  const { data: ownerUsage, error: ownerUsageError } = await owner
    .from('coach_daily_usage')
    .select('user_id,request_count');
  if (ownerUsageError) throw ownerUsageError;
  assert(ownerUsage.every((row) => row.user_id === ownerId), 'The owner could read another user’s quota row.');

  const { data: attackerUsage, error: attackerUsageError } = await attacker
    .from('coach_daily_usage')
    .select('user_id')
    .eq('user_id', ownerId);
  if (attackerUsageError) throw attackerUsageError;
  assert(attackerUsage.length === 0, 'Another user could read the owner quota row.');

  console.log('Coach quota access verification passed: usage is owner-readable and all writes are server-only.');
} finally {
  await Promise.allSettled([owner.auth.signOut(), attacker.auth.signOut()]);
}
