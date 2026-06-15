-- ============================================================
-- SARM — Étape « Trames » : catalogue annuel des semaines type (séquences de postes).
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Réutilise public.touch_updated_at() et public.is_faiseur() de planning.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Une ligne = le catalogue de trames d'UNE année. `data` (jsonb) :
--   { v, trames: [ { id, nom, colonnes: [ { lun, mar, mer, jeu, ven } ] } ] }
-- Une trame = une semaine type ENTIÈRE (grille) : N colonnes, chaque colonne = une séquence
-- figée lun→ven de postes, "" = repos (§4, §11). Colonnes interchangeables entre associés.
-- Apporté par le faiseur (collage depuis Excel). Donnée de structure annuelle.
-- ============================================================

create table if not exists public.planning_trames (
  annee       int  primary key,
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.planning_trames enable row level security;

drop trigger if exists planning_trames_touch_updated_at on public.planning_trames;
create trigger planning_trames_touch_updated_at
  before update on public.planning_trames
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT, seul le faiseur ÉCRIT.
drop policy if exists planning_trames_select on public.planning_trames;
create policy planning_trames_select
  on public.planning_trames for select to authenticated
  using ( true );

drop policy if exists planning_trames_insert_faiseur on public.planning_trames;
create policy planning_trames_insert_faiseur
  on public.planning_trames for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_trames_update_faiseur on public.planning_trames;
create policy planning_trames_update_faiseur
  on public.planning_trames for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_trames_delete_faiseur on public.planning_trames;
create policy planning_trames_delete_faiseur
  on public.planning_trames for delete to authenticated
  using ( public.is_faiseur() );
