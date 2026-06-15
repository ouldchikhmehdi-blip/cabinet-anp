-- ============================================================
-- SARM — Objectifs annuels par associé (cible « Réalisé vs Objectif », §16)
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Réutilise public.touch_updated_at() et public.is_faiseur() de planning.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Une ligne = les objectifs d'UNE année. `data` (jsonb) contient :
--   { v, lignes:[{id,label,supprimable}], valeurs:{ <associe>:{ <ligneId>:int } } }
-- Les 4 lignes par défaut (G week-end, A vendredi, G vendredi, Réa) sont posées
-- côté front ; le faiseur peut en ajouter (cf. PLANNING.md §16).
-- ============================================================

create table if not exists public.planning_objectifs (
  annee       int  primary key,
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.planning_objectifs enable row level security;

drop trigger if exists planning_objectifs_touch_updated_at on public.planning_objectifs;
create trigger planning_objectifs_touch_updated_at
  before update on public.planning_objectifs
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT (le suivi « Réalisé vs Objectif » en aura besoin),
-- seul le faiseur ÉCRIT. Le gating front n'est pas une barrière de sécurité.
drop policy if exists planning_objectifs_select on public.planning_objectifs;
create policy planning_objectifs_select
  on public.planning_objectifs for select to authenticated
  using ( true );

drop policy if exists planning_objectifs_insert_faiseur on public.planning_objectifs;
create policy planning_objectifs_insert_faiseur
  on public.planning_objectifs for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_objectifs_update_faiseur on public.planning_objectifs;
create policy planning_objectifs_update_faiseur
  on public.planning_objectifs for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_objectifs_delete_faiseur on public.planning_objectifs;
create policy planning_objectifs_delete_faiseur
  on public.planning_objectifs for delete to authenticated
  using ( public.is_faiseur() );
