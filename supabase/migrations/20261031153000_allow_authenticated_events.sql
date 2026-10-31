-- Signed-in clients use the `authenticated` role, which previously had no
-- INSERT grant or policy on events, so every track() call from a logged-in
-- user was rejected.

grant insert on events to authenticated;

drop policy if exists authenticated_insert_only on events;
create policy authenticated_insert_only
  on events for insert to authenticated
  with check (user_id is null or user_id = auth.uid());
