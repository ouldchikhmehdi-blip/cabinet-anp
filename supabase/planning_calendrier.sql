-- ============================================================
-- SARM — Étape 0 : base brute du calendrier (rôles G/A par jour)
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Réutilise public.touch_updated_at() et public.is_faiseur() de planning.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Une ligne = la base brute d'UNE année : pour chaque jeudi/vendredi/samedi/
-- dimanche, le rôle de notre groupe (garde G / astreinte A) selon la rotation
-- avec l'autre groupe ; les semaines de vacances scolaires ; les jours fériés
-- et leur statut G/A. (cf. PLANNING.md §3, §12.)
-- ============================================================

create table if not exists public.planning_calendrier (
  annee       int  primary key,
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.planning_calendrier enable row level security;

drop trigger if exists planning_calendrier_touch_updated_at on public.planning_calendrier;
create trigger planning_calendrier_touch_updated_at
  before update on public.planning_calendrier
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT (les étapes suivantes en auront besoin),
-- seul le faiseur ÉCRIT. Le gating front n'est pas une barrière de sécurité.
drop policy if exists planning_calendrier_select on public.planning_calendrier;
create policy planning_calendrier_select
  on public.planning_calendrier for select to authenticated
  using ( true );

drop policy if exists planning_calendrier_insert_faiseur on public.planning_calendrier;
create policy planning_calendrier_insert_faiseur
  on public.planning_calendrier for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_calendrier_update_faiseur on public.planning_calendrier;
create policy planning_calendrier_update_faiseur
  on public.planning_calendrier for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_calendrier_delete_faiseur on public.planning_calendrier;
create policy planning_calendrier_delete_faiseur
  on public.planning_calendrier for delete to authenticated
  using ( public.is_faiseur() );
