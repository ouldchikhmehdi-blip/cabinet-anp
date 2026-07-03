-- ============================================================
-- SARM — Consultations (statistiques cabinet importées depuis Doctolib).
-- Données GLOBALES du cabinet (toutes années confondues), donc UNE seule ligne (singleton id=1).
-- Auparavant stockées uniquement dans le localStorage du navigateur → invisibles d'une machine à
-- l'autre. Cette table les rend partagées et persistantes (source de vérité), le localStorage restant
-- un cache local instantané côté client.
--   data   (jsonb) : store complet { global, teleconsultations, specialites }
--   regles (jsonb) : règles d'import personnalisées de l'utilisateur (classement des clés Doctolib)
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql. Réutilise public.touch_updated_at()
-- et public.is_faiseur(). Idempotent (réexécutable sans erreur).
-- ============================================================

create table if not exists public.planning_consultations (
  id          int  primary key default 1 check (id = 1),
  data        jsonb not null default '{}'::jsonb,
  regles      jsonb not null default '[]'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.planning_consultations enable row level security;

drop trigger if exists planning_consultations_touch_updated_at on public.planning_consultations;
create trigger planning_consultations_touch_updated_at
  before update on public.planning_consultations
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT (l'onglet Consultations est visible par tous) ; seul le faiseur ÉCRIT
-- (l'import et la gestion des praticiens sont des actions de gestion).
drop policy if exists planning_consultations_select on public.planning_consultations;
create policy planning_consultations_select
  on public.planning_consultations for select to authenticated
  using ( true );

drop policy if exists planning_consultations_insert_faiseur on public.planning_consultations;
create policy planning_consultations_insert_faiseur
  on public.planning_consultations for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_consultations_update_faiseur on public.planning_consultations;
create policy planning_consultations_update_faiseur
  on public.planning_consultations for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_consultations_delete_faiseur on public.planning_consultations;
create policy planning_consultations_delete_faiseur
  on public.planning_consultations for delete to authenticated
  using ( public.is_faiseur() );
