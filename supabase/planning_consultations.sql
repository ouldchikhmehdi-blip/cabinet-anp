-- ============================================================
-- SARM — Consultations (statistiques cabinet importées depuis Doctolib).
-- Données GLOBALES du cabinet (toutes années confondues), donc UNE seule ligne (singleton id=1).
-- Auparavant stockées uniquement dans le localStorage du navigateur → invisibles d'une machine à
-- l'autre. Cette table les rend partagées et persistantes (source de vérité), le localStorage restant
-- un cache local instantané côté client.
--   data   (jsonb) : store complet { global, teleconsultations, specialites }
--   regles (jsonb) : règles d'import personnalisées de l'utilisateur (classement des clés Doctolib)
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql, PUIS
-- planning_consultations_admin.sql (qui pose les policies d'écriture). Réutilise
-- public.touch_updated_at(). Idempotent (réexécutable sans erreur).
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

-- RLS — lecture : tout authenticated (l'onglet Consultations est visible par tous).
drop policy if exists planning_consultations_select on public.planning_consultations;
create policy planning_consultations_select
  on public.planning_consultations for select to authenticated
  using ( true );

-- RLS — écriture : définie dans **planning_consultations_admin.sql** (réservée à public.is_admin()).
--
-- ⚠ Les policies d'écriture « faiseur » que ce fichier créait ont été RETIRÉES d'ici volontairement.
-- En RLS, les policies d'une même commande s'additionnent en OU : réexécuter ce fichier les
-- recréerait À CÔTÉ des policies admin, et les faiseurs récupéreraient silencieusement l'écriture.
-- Ce fichier reste donc réexécutable sans danger ; exécuter ensuite planning_consultations_admin.sql.
