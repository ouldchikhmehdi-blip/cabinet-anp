-- ============================================================
-- SARM — Import MANUEL d'agenda par associé (alternative à la synchro AUTO du planning validé).
-- L'associé COLLE sa colonne du planning Excel (ou tout le planning) ; l'app l'analyse côté client en
-- événements « journée entière » et les stocke ici. Le flux iCal `/api/agenda?token=…` lit cette table
-- via le service_role UNIQUEMENT quand planning_agenda.source = 'manuel'.
--   data (jsonb) : [ { d:'YYYY-MM-DD', fin:'YYYY-MM-DD', titre } ]  (fin = DTEND exclusif, journée entière)
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning_agenda.sql. Réutilise public.touch_updated_at().
-- Idempotent (réexécutable sans erreur).
-- ============================================================

create table if not exists public.planning_agenda_manuel (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.planning_agenda_manuel enable row level security;

drop trigger if exists planning_agenda_manuel_touch_updated_at on public.planning_agenda_manuel;
create trigger planning_agenda_manuel_touch_updated_at
  before update on public.planning_agenda_manuel
  for each row execute function public.touch_updated_at();

-- RLS : chaque associé ne gère QUE sa propre ligne (le flux iCal lit via service_role, hors RLS).
drop policy if exists planning_agenda_manuel_select_self on public.planning_agenda_manuel;
create policy planning_agenda_manuel_select_self
  on public.planning_agenda_manuel for select to authenticated
  using ( user_id = auth.uid() );

drop policy if exists planning_agenda_manuel_insert_self on public.planning_agenda_manuel;
create policy planning_agenda_manuel_insert_self
  on public.planning_agenda_manuel for insert to authenticated
  with check ( user_id = auth.uid() );

drop policy if exists planning_agenda_manuel_update_self on public.planning_agenda_manuel;
create policy planning_agenda_manuel_update_self
  on public.planning_agenda_manuel for update to authenticated
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

drop policy if exists planning_agenda_manuel_delete_self on public.planning_agenda_manuel;
create policy planning_agenda_manuel_delete_self
  on public.planning_agenda_manuel for delete to authenticated
  using ( user_id = auth.uid() );
