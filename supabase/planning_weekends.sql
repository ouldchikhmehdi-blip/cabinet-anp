-- ============================================================
-- SARM — Étape « Caler les week-ends » : affectation d'un associé par week-end
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Réutilise public.touch_updated_at() et public.is_faiseur() de planning.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Une ligne = les affectations week-end d'UNE année. `data` (jsonb) :
--   { v, affectations: { <numSemaineISO>: <initiales> } }
-- Un week-end = la semaine ISO (samedi + dimanche). Le calage se fait période
-- par période (un recueil) mais s'écrit dans la même table annuelle (fusion).
-- (cf. PLANNING.md §12 étape 1.)
-- ============================================================

create table if not exists public.planning_weekends (
  annee       int  primary key,
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.planning_weekends enable row level security;

drop trigger if exists planning_weekends_touch_updated_at on public.planning_weekends;
create trigger planning_weekends_touch_updated_at
  before update on public.planning_weekends
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT (étapes suivantes du planning en auront besoin),
-- seul le faiseur ÉCRIT. Le gating front n'est pas une barrière de sécurité.
drop policy if exists planning_weekends_select on public.planning_weekends;
create policy planning_weekends_select
  on public.planning_weekends for select to authenticated
  using ( true );

drop policy if exists planning_weekends_insert_faiseur on public.planning_weekends;
create policy planning_weekends_insert_faiseur
  on public.planning_weekends for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_weekends_update_faiseur on public.planning_weekends;
create policy planning_weekends_update_faiseur
  on public.planning_weekends for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_weekends_delete_faiseur on public.planning_weekends;
create policy planning_weekends_delete_faiseur
  on public.planning_weekends for delete to authenticated
  using ( public.is_faiseur() );
