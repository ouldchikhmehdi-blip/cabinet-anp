-- ============================================================
-- SARM — Étape « Placer les semaines de réanimation » : un associé en réa par semaine
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Réutilise public.touch_updated_at() et public.is_faiseur() de planning.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Une ligne = les semaines de réa d'UNE année. `data` (jsonb) :
--   { v, rea: { <numSemaineISO>: <initiales> } }
-- Réparties pour équilibrer le nombre de semaines de réa entre associés (§6, §16).
-- Le calage se fait période par période (un recueil), stockage annuel (fusion).
-- ============================================================

create table if not exists public.planning_rea (
  annee       int  primary key,
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.planning_rea enable row level security;

drop trigger if exists planning_rea_touch_updated_at on public.planning_rea;
create trigger planning_rea_touch_updated_at
  before update on public.planning_rea
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT, seul le faiseur ÉCRIT.
drop policy if exists planning_rea_select on public.planning_rea;
create policy planning_rea_select
  on public.planning_rea for select to authenticated
  using ( true );

drop policy if exists planning_rea_insert_faiseur on public.planning_rea;
create policy planning_rea_insert_faiseur
  on public.planning_rea for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_rea_update_faiseur on public.planning_rea;
create policy planning_rea_update_faiseur
  on public.planning_rea for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_rea_delete_faiseur on public.planning_rea;
create policy planning_rea_delete_faiseur
  on public.planning_rea for delete to authenticated
  using ( public.is_faiseur() );
