-- ============================================================
-- SARM — Étape « Trame d'été » : grille d'été fournie par le faiseur, rattachée à UN recueil.
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Réutilise public.touch_updated_at() et public.is_faiseur() de planning.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Une ligne = la grille d'été d'UN recueil (le recueil de 2ᵉ partie qui couvre les vacances d'été).
-- `data` (jsonb) :
--   {
--     colonnes: [ { key: "B", label: "B" }, … ],   // colonnes choisissables (col A = dates, exclue)
--     lignes:   [ { dateLabel: "dimanche 5 juillet 2026",
--                   cells: [ { texte: "AG", couleur: "rgb(0,176,240)" }, … ] }, … ],
--     importeLe: "<ISO>"
--   }
-- Apportée par le faiseur (collage depuis Excel : texte + fonds de couleur). Grille fournie telle quelle.
-- Les associés y choisissent leur(s) colonne(s) (préférences stockées dans planning_desiderata.data).
-- ============================================================

create table if not exists public.planning_trame_ete (
  recueil_id  uuid primary key references public.planning_recueils(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.planning_trame_ete enable row level security;

drop trigger if exists planning_trame_ete_touch_updated_at on public.planning_trame_ete;
create trigger planning_trame_ete_touch_updated_at
  before update on public.planning_trame_ete
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT (les associés voient la grille), seul le faiseur ÉCRIT.
drop policy if exists planning_trame_ete_select on public.planning_trame_ete;
create policy planning_trame_ete_select
  on public.planning_trame_ete for select to authenticated
  using ( true );

drop policy if exists planning_trame_ete_insert_faiseur on public.planning_trame_ete;
create policy planning_trame_ete_insert_faiseur
  on public.planning_trame_ete for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_trame_ete_update_faiseur on public.planning_trame_ete;
create policy planning_trame_ete_update_faiseur
  on public.planning_trame_ete for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_trame_ete_delete_faiseur on public.planning_trame_ete;
create policy planning_trame_ete_delete_faiseur
  on public.planning_trame_ete for delete to authenticated
  using ( public.is_faiseur() );
