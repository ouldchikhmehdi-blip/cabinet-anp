-- ============================================================
-- SARM — Étape « En semaine » : la trame du catalogue appliquée à chaque semaine.
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Réutilise public.touch_updated_at() et public.is_faiseur() de planning.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Une ligne = les choix de trame d'UNE année. `data` (jsonb) :
--   { v, trameParSemaine: { <numSemaineISO>: <trameId> } }
-- On ne stocke QUE les choix explicites du faiseur ; une semaine absente suit la trame
-- principale du catalogue (planning_trames.data.principaleId).
-- ============================================================

create table if not exists public.planning_semaines (
  annee       int  primary key,
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.planning_semaines enable row level security;

drop trigger if exists planning_semaines_touch_updated_at on public.planning_semaines;
create trigger planning_semaines_touch_updated_at
  before update on public.planning_semaines
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT, seul le faiseur ÉCRIT.
drop policy if exists planning_semaines_select on public.planning_semaines;
create policy planning_semaines_select
  on public.planning_semaines for select to authenticated
  using ( true );

drop policy if exists planning_semaines_insert_faiseur on public.planning_semaines;
create policy planning_semaines_insert_faiseur
  on public.planning_semaines for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_semaines_update_faiseur on public.planning_semaines;
create policy planning_semaines_update_faiseur
  on public.planning_semaines for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_semaines_delete_faiseur on public.planning_semaines;
create policy planning_semaines_delete_faiseur
  on public.planning_semaines for delete to authenticated
  using ( public.is_faiseur() );
