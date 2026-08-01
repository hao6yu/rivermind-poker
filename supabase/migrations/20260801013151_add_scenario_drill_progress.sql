alter table public.learning_progress
  drop constraint learning_progress_activity_type_check;

alter table public.learning_progress
  add constraint learning_progress_activity_type_check check (
    activity_type in ('lesson', 'percentage_drill', 'hand_quiz', 'scenario_drill')
  );
