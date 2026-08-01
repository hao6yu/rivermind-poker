revoke insert on table public.beta_feedback from authenticated;

grant insert (
  user_id,
  category,
  message,
  screen,
  hand_client_id,
  app_version,
  build_number,
  platform,
  diagnostic_version,
  diagnostics
) on table public.beta_feedback to authenticated;
