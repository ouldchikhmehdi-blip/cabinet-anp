-- ============================================================
-- SARM — Vacances de la Toussaint : grille fournie telle quelle (PLANNING.md §10).
-- Même nature que la grille de Noël (bloc imposé collé), mais collée depuis l'onglet « Vacances ».
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Réutilise public.touch_updated_at() et public.is_faiseur() de planning.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Une ligne = la période de Toussaint d'UNE année. `data` (jsonb) :
--   { v, colle:'<texte collé brut>',
--     jours: [ { iso:'YYYY-MM-DD', parAssocie: { <initiales>: { poste, role } } } ] }
--   role ∈ 'G' (garde) | 'A' (astreinte) | 'C' (congé) | 'F' (récup férié) | null. Détecté au collage (couleurs Excel).
-- Les comptes (gardes / A vendredi / récup JF / réa / vacances) s'intègrent au bilan annuel « En semaine ».
-- ============================================================

create table if not exists public.planning_toussaint (
  annee       int  primary key,
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.planning_toussaint enable row level security;

drop trigger if exists planning_toussaint_touch_updated_at on public.planning_toussaint;
create trigger planning_toussaint_touch_updated_at
  before update on public.planning_toussaint
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT (le bilan annuel en a besoin), seul le faiseur ÉCRIT.
drop policy if exists planning_toussaint_select on public.planning_toussaint;
create policy planning_toussaint_select
  on public.planning_toussaint for select to authenticated
  using ( true );

drop policy if exists planning_toussaint_insert_faiseur on public.planning_toussaint;
create policy planning_toussaint_insert_faiseur
  on public.planning_toussaint for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_toussaint_update_faiseur on public.planning_toussaint;
create policy planning_toussaint_update_faiseur
  on public.planning_toussaint for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_toussaint_delete_faiseur on public.planning_toussaint;
create policy planning_toussaint_delete_faiseur
  on public.planning_toussaint for delete to authenticated
  using ( public.is_faiseur() );
