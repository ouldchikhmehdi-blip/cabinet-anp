-- ============================================================
-- SARM — Étape « Positionner les vacances » : associés en congé par semaine
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Réutilise public.touch_updated_at() et public.is_faiseur() de planning.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Une ligne = les vacances d'UNE année. `data` (jsonb) :
--   { v, vacances: { <numSemaineISO>: [<initiales>, …] } }
-- Plusieurs associés possibles par semaine (au moins 1 visé, §8). Le calage se
-- fait période par période (un recueil) mais s'écrit dans la même table annuelle.
-- (cf. PLANNING.md §8, §12 étape 2.)
-- ============================================================

create table if not exists public.planning_vacances (
  annee       int  primary key,
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.planning_vacances enable row level security;

drop trigger if exists planning_vacances_touch_updated_at on public.planning_vacances;
create trigger planning_vacances_touch_updated_at
  before update on public.planning_vacances
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT (étapes suivantes du planning en auront besoin),
-- seul le faiseur ÉCRIT. Le gating front n'est pas une barrière de sécurité.
drop policy if exists planning_vacances_select on public.planning_vacances;
create policy planning_vacances_select
  on public.planning_vacances for select to authenticated
  using ( true );

drop policy if exists planning_vacances_insert_faiseur on public.planning_vacances;
create policy planning_vacances_insert_faiseur
  on public.planning_vacances for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_vacances_update_faiseur on public.planning_vacances;
create policy planning_vacances_update_faiseur
  on public.planning_vacances for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_vacances_delete_faiseur on public.planning_vacances;
create policy planning_vacances_delete_faiseur
  on public.planning_vacances for delete to authenticated
  using ( public.is_faiseur() );
