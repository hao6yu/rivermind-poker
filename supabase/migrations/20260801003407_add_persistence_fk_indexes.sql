create index practice_hands_session_owner_idx
  on public.practice_hands (session_id, user_id);

create index hand_reviews_hand_owner_idx
  on public.hand_reviews (hand_id, user_id);
