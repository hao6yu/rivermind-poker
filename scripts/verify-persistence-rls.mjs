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
const unauthenticated = client();
const testId = `rls_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
let ownerSessionId = null;
let ownerLearningActivityId = null;
let attackerSessionId = null;

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

  const { data: unauthenticatedRows, error: unauthenticatedError } = await unauthenticated
    .from('practice_sessions')
    .select('id')
    .limit(1);
  assert(
    unauthenticatedError || unauthenticatedRows.length === 0,
    'A client without an authenticated Supabase user could read practice sessions.',
  );

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

  const { data: attackerSession, error: attackerSessionError } = await attacker
    .from('practice_sessions')
    .insert({ client_id: `${testId}_attacker_session`, coach_enabled: false })
    .select('id,user_id')
    .single();
  if (attackerSessionError) throw attackerSessionError;
  assert(attackerSession.user_id === attackerId, 'Default row ownership did not use the authenticated user.');
  attackerSessionId = attackerSession.id;

  const { error: reassignOwnerError } = await attacker
    .from('practice_sessions')
    .update({ user_id: ownerId })
    .eq('id', attackerSessionId);
  assert(reassignOwnerError, 'A user could reassign their session to another owner.');

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

  ownerLearningActivityId = `${testId}_scenario`;
  const { error: learningError } = await owner.from('learning_progress').upsert({
    user_id: ownerId,
    activity_id: ownerLearningActivityId,
    activity_type: 'scenario_drill',
    status: 'completed',
    completed_at: new Date().toISOString(),
  }, { onConflict: 'user_id,activity_id' });
  if (learningError) throw learningError;

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

  const { data: attackerHandUpdates, error: attackerHandUpdateError } = await attacker
    .from('practice_hands')
    .update({ pot_won: 999 })
    .eq('id', hand.id)
    .select('id');
  if (attackerHandUpdateError) throw attackerHandUpdateError;
  assert(attackerHandUpdates.length === 0, 'Another user could update the owner hand.');

  const { data: attackerHandDeletes, error: attackerHandDeleteError } = await attacker
    .from('practice_hands')
    .delete()
    .eq('id', hand.id)
    .select('id');
  if (attackerHandDeleteError) throw attackerHandDeleteError;
  assert(attackerHandDeletes.length === 0, 'Another user could delete the owner hand.');

  const { data: attackerReviewUpdates, error: attackerReviewUpdateError } = await attacker
    .from('hand_reviews')
    .update({ focus_area: 'bluffing' })
    .eq('hand_id', hand.id)
    .select('id');
  if (attackerReviewUpdateError) throw attackerReviewUpdateError;
  assert(attackerReviewUpdates.length === 0, 'Another user could update the owner review.');

  const { data: attackerReviewDeletes, error: attackerReviewDeleteError } = await attacker
    .from('hand_reviews')
    .delete()
    .eq('hand_id', hand.id)
    .select('id');
  if (attackerReviewDeleteError) throw attackerReviewDeleteError;
  assert(attackerReviewDeletes.length === 0, 'Another user could delete the owner review.');

  const { data: ownerLearning, error: ownerLearningError } = await owner
    .from('learning_progress')
    .select('activity_id')
    .eq('user_id', ownerId)
    .eq('activity_id', ownerLearningActivityId);
  if (ownerLearningError) throw ownerLearningError;
  assert(ownerLearning.length === 1, 'The owner could not read their own learning progress.');

  const { data: attackerLearning, error: attackerLearningError } = await attacker
    .from('learning_progress')
    .select('activity_id')
    .eq('user_id', ownerId)
    .eq('activity_id', ownerLearningActivityId);
  if (attackerLearningError) throw attackerLearningError;
  assert(attackerLearning.length === 0, 'Another user could read the owner learning progress.');

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

  const { data: attackerLearningUpdates, error: attackerLearningUpdateError } = await attacker
    .from('learning_progress')
    .update({ attempts: 99 })
    .eq('user_id', ownerId)
    .eq('activity_id', ownerLearningActivityId)
    .select('activity_id');
  if (attackerLearningUpdateError) throw attackerLearningUpdateError;
  assert(attackerLearningUpdates.length === 0, 'Another user could update the owner learning progress.');

  const { data: attackerLearningDeletes, error: attackerLearningDeleteError } = await attacker
    .from('learning_progress')
    .delete()
    .eq('user_id', ownerId)
    .eq('activity_id', ownerLearningActivityId)
    .select('activity_id');
  if (attackerLearningDeleteError) throw attackerLearningDeleteError;
  assert(attackerLearningDeletes.length === 0, 'Another user could delete the owner learning progress.');

  const { error: forgedOwnerError } = await attacker.from('practice_sessions').insert({
    user_id: ownerId,
    client_id: `${testId}_forged`,
  });
  assert(forgedOwnerError, 'Another user could insert a row owned by the owner.');

  const { error: forgedLearningError } = await attacker.from('learning_progress').insert({
    user_id: ownerId,
    activity_id: `${testId}_forged_scenario`,
    activity_type: 'scenario_drill',
  });
  assert(forgedLearningError, 'Another user could insert learning progress owned by the owner.');

  const { error: forgedHandError } = await attacker.from('practice_hands').insert({
    session_id: ownerSessionId,
    client_id: `${testId}_forged_hand`,
    hand_number: 99,
    outcome_winner: 'villain',
    showdown: false,
    pot_won: 30,
    game_state: { street: 'complete', privacy_test: true },
  });
  assert(forgedHandError, 'Another user could attach a hand to the owner session.');

  const { error: forgedReviewError } = await attacker.from('hand_reviews').insert({
    hand_id: hand.id,
    analysis_version: 1,
    hand_grade: 'mistake',
    focus_area: 'bluffing',
    focus_decision_sequence: 0,
    review: { privacy_test: true },
    verified_analysis: { version: 1, source: 'deterministic-poker-engine' },
  });
  assert(forgedReviewError, 'Another user could attach a review to the owner hand.');

  const { error: usageWriteError } = await attacker.from('coach_daily_usage').insert({
    user_id: attackerId,
    request_count: 1,
  });
  assert(usageWriteError, 'A mobile client could write directly to coach quota usage.');

  const { error: quotaRpcError } = await attacker.rpc('claim_coach_review_slot', {
    p_user_id: attackerId,
  });
  assert(quotaRpcError, 'A mobile client could call the server-only coach quota RPC.');

  console.log('RLS verification passed: unauthenticated access, cross-user CRUD, ownership forgery, and server-only quota writes are denied.');
} finally {
  if (ownerLearningActivityId) {
    await owner.from('learning_progress').delete().eq('activity_id', ownerLearningActivityId);
  }
  if (ownerSessionId) {
    await owner.from('practice_sessions').delete().eq('id', ownerSessionId);
  }
  if (attackerSessionId) {
    await attacker.from('practice_sessions').delete().eq('id', attackerSessionId);
  }
  await Promise.allSettled([owner.auth.signOut(), attacker.auth.signOut(), unauthenticated.auth.signOut()]);
}
