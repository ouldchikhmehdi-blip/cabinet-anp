-- ============================================================
-- SARM — « Compteurs de référence (cumul à ce stade) » par année.
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Réutilise public.touch_updated_at() et public.is_faiseur() de planning.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Le faiseur fabrique la 1ʳᵉ partie + l'été (+ Noël) dans Excel ; il colle ce planning réel sur la page
-- « Ouverture du planning », l'outil compte les paramètres par associé et enregistre ce socle annuel,
-- réutilisé pour construire les recueils suivants (cf. PLANNING.md §16).
--
-- Une ligne = les compteurs de référence d'UNE année. `data` (jsonb) :
--   {
--     v: 1,
--     importeLe: "<ISO>",
--     inclutNoel: true,
--     compteurs: {
--       EH: { gWeekend, aWeekend, gVendredi, aVendredi, rea, gardeSemaine, vacances, recupFerie },
--       … (un objet par associé)
--     }
--   }
-- ============================================================

create table if not exists public.planning_compteurs_ref (
  annee       int  primary key,
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.planning_compteurs_ref enable row level security;

drop trigger if exists planning_compteurs_ref_touch_updated_at on public.planning_compteurs_ref;
create trigger planning_compteurs_ref_touch_updated_at
  before update on public.planning_compteurs_ref
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT, seul le faiseur ÉCRIT.
drop policy if exists planning_compteurs_ref_select on public.planning_compteurs_ref;
create policy planning_compteurs_ref_select
  on public.planning_compteurs_ref for select to authenticated
  using ( true );

drop policy if exists planning_compteurs_ref_insert_faiseur on public.planning_compteurs_ref;
create policy planning_compteurs_ref_insert_faiseur
  on public.planning_compteurs_ref for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_compteurs_ref_update_faiseur on public.planning_compteurs_ref;
create policy planning_compteurs_ref_update_faiseur
  on public.planning_compteurs_ref for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_compteurs_ref_delete_faiseur on public.planning_compteurs_ref;
create policy planning_compteurs_ref_delete_faiseur
  on public.planning_compteurs_ref for delete to authenticated
  using ( public.is_faiseur() );
