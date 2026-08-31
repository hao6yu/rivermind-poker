-- Slice 3.11 integration hardening: completion_reason must accept the
-- Slice 3.11F `host-ended` reason everywhere it is persisted.
--
-- Defect: the check constraints added in Phase 12 predate the 3.11F
-- `host-ended` completion reason. The coordinator produces it, the worker
-- submits it, and `multiplayer_commit_transition_v2` writes it into
-- `multiplayer_rooms.completion_reason` — but the check constraint rejects
-- it, so every host-ended transition committed by the real HTTP worker
-- answered 503 `room_unavailable` (reproduced by the lifecycle harness).
-- `multiplayer_rooms.completion_reason` and
-- `private.multiplayer_hand_archives.completion_reason` are both widened.
--
-- Deployment ordering: apply before (or together with) the worker build that
-- can end a stalled session; the old worker never sends `host-ended`, so this
-- migration is backward compatible.

alter table public.multiplayer_rooms
  drop constraint if exists multiplayer_rooms_completion_reason_check;

alter table public.multiplayer_rooms
  add constraint multiplayer_rooms_completion_reason_check check (
    completion_reason is null
    or completion_reason in ('hand-limit', 'host-ended', 'last-player-standing')
  );

alter table private.multiplayer_hand_archives
  drop constraint if exists multiplayer_hand_archives_completion_reason_check;

alter table private.multiplayer_hand_archives
  add constraint multiplayer_hand_archives_completion_reason_check check (
    completion_reason is null
    or completion_reason in ('hand-limit', 'host-ended', 'last-player-standing')
  );
