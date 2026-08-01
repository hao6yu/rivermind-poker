import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.');
}

function client() {
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const owner = client();
const attacker = client();
const testId = `rls_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
let ownerSessionId = null;

try {
  const [{ data: ownerAuth, error: ownerAuthError }, { data: attackerAuth, error: attackerAuthError }] = await Promise.all([
    owner.auth.signInAnonymously(),
    attacker.auth.signInAnonymously(),
  ]);
  if (ownerAuthError) throw ownerAuthError;
  if (attackerAuthError) throw attackerAuthError;
  const ownerId = ownerAuth.user?.id;
  const attackerId = attackerAuth.user?.id;
  assert(ownerId && attackerId && ownerId !== attackerId, 'The RLS test requires two distinct users.');

  const { data: session, error: sessionError } = await owner
    .from('practice_sessions')
    .upsert(
      { user_id: ownerId, client_id: `${testId}_session`, coach_enabled: true },
      { onConflict: 'user_id,client_id' },
    )
    .select('id')
    .single();
  if (sessionError) throw sessionError;
  ownerSessionId = session.id;

  const { data: hand, error: handError } = await owner
    .from('practice_hands')
    .upsert({
      user_id: ownerId,
      session_id: ownerSessionId,
      client_id: `${testId}_hand`,
      hand_number: 1,
      outcome_winner: 'hero',
      showdown: false,
      pot_won: 30,
      game_state: { street: 'complete', privacy_test: true },
    }, { onConflict: 'user_id,client_id' })
    .select('id')
    .single();
  if (handError) throw handError;

  const { error: reviewError } = await owner.from('hand_reviews').upsert({
    user_id: ownerId,
    hand_id: hand.id,
    analysis_version: 1,
    hand_grade: 'strong',
    focus_area: 'none',
    focus_decision_sequence: 0,
    review: { privacy_test: true },
    verified_analysis: { version: 1, source: 'deterministic-poker-engine' },
  }, { onConflict: 'hand_id' });
  if (reviewError) throw reviewError;

  const { data: ownerRows, error: ownerReadError } = await owner
    .from('practice_sessions')
    .select('id')
    .eq('id', ownerSessionId);
  if (ownerReadError) throw ownerReadError;
  assert(ownerRows.length === 1, 'The owner could not read their own session.');

  const { data: attackerRows, error: attackerReadError } = await attacker
    .from('practice_sessions')
    .select('id')
    .eq('id', ownerSessionId);
  if (attackerReadError) throw attackerReadError;
  assert(attackerRows.length === 0, 'Another user could read the owner session.');

  const [{ data: attackerHands, error: attackerHandsError }, { data: attackerReviews, error: attackerReviewsError }] = await Promise.all([
    attacker.from('practice_hands').select('id').eq('id', hand.id),
    attacker.from('hand_reviews').select('id').eq('hand_id', hand.id),
  ]);
  if (attackerHandsError) throw attackerHandsError;
  if (attackerReviewsError) throw attackerReviewsError;
  assert(attackerHands.length === 0, 'Another user could read the owner hand.');
  assert(attackerReviews.length === 0, 'Another user could read the owner review.');

  const { data: attackerUpdates, error: attackerUpdateError } = await attacker
    .from('practice_sessions')
    .update({ coach_enabled: false })
    .eq('id', ownerSessionId)
    .select('id');
  if (attackerUpdateError) throw attackerUpdateError;
  assert(attackerUpdates.length === 0, 'Another user could update the owner session.');

  const { data: attackerDeletes, error: attackerDeleteError } = await attacker
    .from('practice_sessions')
    .delete()
    .eq('id', ownerSessionId)
    .select('id');
  if (attackerDeleteError) throw attackerDeleteError;
  assert(attackerDeletes.length === 0, 'Another user could delete the owner session.');

  const { error: forgedOwnerError } = await attacker.from('practice_sessions').insert({
    user_id: ownerId,
    client_id: `${testId}_forged`,
  });
  assert(forgedOwnerError, 'Another user could insert a row owned by the owner.');

  console.log('RLS verification passed: owner CRUD works and cross-user access is denied.');
} finally {
  if (ownerSessionId) {
    await owner.from('practice_sessions').delete().eq('id', ownerSessionId);
  }
  await Promise.allSettled([owner.auth.signOut(), attacker.auth.signOut()]);
}
