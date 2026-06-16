-- ============================================================
-- SARM — Étape « Noël » : grille des ~15 jours de Noël fournie telle quelle (PLANNING.md §10).
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Réutilise public.touch_updated_at() et public.is_faiseur() de planning.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Une ligne = la période de Noël d'UNE année. `data` (jsonb) :
--   { v, colle:'<texte collé brut>',
--     jours: [ { iso:'YYYY-MM-DD', parAssocie: { <initiales>: { poste, role } } } ] }
--   role ∈ 'G' (garde) | 'A' (astreinte) | null. Détecté au collage (couleurs Excel).
-- Les comptes (gardes / A vendredi / récup JF / réa) s'intègrent au bilan annuel « En semaine ».
-- ============================================================

create table if not exists public.planning_noel (
  annee       int  primary key,
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.planning_noel enable row level security;

drop trigger if exists planning_noel_touch_updated_at on public.planning_noel;
create trigger planning_noel_touch_updated_at
  before update on public.planning_noel
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT (le bilan annuel en a besoin), seul le faiseur ÉCRIT.
drop policy if exists planning_noel_select on public.planning_noel;
create policy planning_noel_select
  on public.planning_noel for select to authenticated
  using ( true );

drop policy if exists planning_noel_insert_faiseur on public.planning_noel;
create policy planning_noel_insert_faiseur
  on public.planning_noel for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_noel_update_faiseur on public.planning_noel;
create policy planning_noel_update_faiseur
  on public.planning_noel for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_noel_delete_faiseur on public.planning_noel;
create policy planning_noel_delete_faiseur
  on public.planning_noel for delete to authenticated
  using ( public.is_faiseur() );
