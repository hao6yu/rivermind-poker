-- Nine-seat private tables.
--
-- Slice 3.7 adds nine-seat private rooms as a first-class table size. The
-- seat-count column is written only when a room is created, so relaxing the
-- check constraint is the only schema change required; the coordinator,
-- Edge validation, and client parsers enforce the 2/3/6/9 set everywhere
-- else. Older clients reject nine-seat snapshots in their strict parsers and
-- receive the update-required result instead of interpreting partial state.

alter table public.multiplayer_rooms
  drop constraint multiplayer_rooms_seat_count_check;

alter table public.multiplayer_rooms
  add constraint multiplayer_rooms_seat_count_check
  check (seat_count in (2, 3, 6, 9));
