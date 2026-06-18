-- ============================================================
-- SARM — Référence des tiers 1 et 2 (saisie manuelle) collée pour l'export du 3ᵉ tiers.
-- Mécanisme DISTINCT du bloc imposé Noël/Toussaint : ici on ne « reconnaît » RIEN (pas de rôle,
-- pas de compteur). On capture une grille colorée brute et on la reproduit telle quelle, en référence,
-- en haut de l'export Excel du 3ᵉ tiers (le 1er tiers pouvant encore changer, on ne l'interprète pas).
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Réutilise public.touch_updated_at() et public.is_faiseur() de planning.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Une ligne = la référence tiers 1+2 d'UNE année. `data` (jsonb) :
--   { v, colle:'<texte collé brut>',
--     lignes: [ [ { t:'<texte cellule>', c:'#RRGGBB'|null }, … ], … ] }
--   t = contenu de la cellule, c = couleur de fond hex brute (sans interprétation) ou null.
-- ============================================================

create table if not exists public.planning_ref (
  annee       int  primary key,
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.planning_ref enable row level security;

drop trigger if exists planning_ref_touch_updated_at on public.planning_ref;
create trigger planning_ref_touch_updated_at
  before update on public.planning_ref
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT (l'export en a besoin), seul le faiseur ÉCRIT.
drop policy if exists planning_ref_select on public.planning_ref;
create policy planning_ref_select
  on public.planning_ref for select to authenticated
  using ( true );

drop policy if exists planning_ref_insert_faiseur on public.planning_ref;
create policy planning_ref_insert_faiseur
  on public.planning_ref for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_ref_update_faiseur on public.planning_ref;
create policy planning_ref_update_faiseur
  on public.planning_ref for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_ref_delete_faiseur on public.planning_ref;
create policy planning_ref_delete_faiseur
  on public.planning_ref for delete to authenticated
  using ( public.is_faiseur() );
