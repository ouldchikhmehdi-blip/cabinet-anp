-- ============================================================
-- SARM — Schéma module Planning / Desiderata
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS schema.sql.
-- Réutilise public.touch_updated_at() et public.is_admin() de schema.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Un « recueil » = une plage de semaines (semaine_debut → semaine_fin) d'une
-- année, ouverte par le faiseur pour recueillir les desiderata des associés.
-- ============================================================

-- ---- 1. profiles : initiales + drapeau faiseur ----
alter table public.profiles
  add column if not exists initiales  text,
  add column if not exists is_faiseur boolean not null default false;

create unique index if not exists profiles_initiales_unique
  on public.profiles (initiales)
  where initiales is not null;

-- ---- 2. is_faiseur() — SECURITY DEFINER (modèle is_admin) ----
create or replace function public.is_faiseur()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id         = auth.uid()
      and is_faiseur = true
      and status     = 'active'
  );
$$;

revoke all    on function public.is_faiseur() from public, anon, authenticated;
grant execute on function public.is_faiseur() to authenticated;

-- ---- 3. profiles_select : ajouter le faiseur ----
drop policy if exists profiles_select on public.profiles;
create policy profiles_select
  on public.profiles for select to authenticated
  using ( id = auth.uid() or public.is_admin() or public.is_faiseur() );

-- ---- 4. Anciennes tables (modèle « période fixe ») : on repart proprement ----
-- Aucune donnée réelle à ce stade. drop cascade pour retirer les dépendances.
drop table if exists public.planning_desiderata cascade;
drop table if exists public.planning_periodes   cascade;

-- ---- 5. Table planning_recueils ----
-- Une plage de semaines ouverte par le faiseur.
create table if not exists public.planning_recueils (
  id            uuid primary key default gen_random_uuid(),
  annee         int  not null,
  nom           text not null,
  semaine_debut int  not null,
  semaine_fin   int  not null,
  statut        text not null default 'ouvert' check (statut in ('ouvert','ferme')),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (semaine_debut between 1 and 53
     and semaine_fin   between 1 and 53
     and semaine_debut <= semaine_fin)
);

create index if not exists planning_recueils_annee_idx
  on public.planning_recueils (annee);

alter table public.planning_recueils enable row level security;

drop trigger if exists planning_recueils_touch_updated_at on public.planning_recueils;
create trigger planning_recueils_touch_updated_at
  before update on public.planning_recueils
  for each row execute function public.touch_updated_at();

-- RLS recueils : tout authenticated LIT (les associés voient les recueils ouverts).
drop policy if exists planning_recueils_select on public.planning_recueils;
create policy planning_recueils_select
  on public.planning_recueils for select to authenticated
  using ( true );

-- Écritures réservées au faiseur (pas besoin de service_role).
drop policy if exists planning_recueils_insert_faiseur on public.planning_recueils;
create policy planning_recueils_insert_faiseur
  on public.planning_recueils for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_recueils_update_faiseur on public.planning_recueils;
create policy planning_recueils_update_faiseur
  on public.planning_recueils for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_recueils_delete_faiseur on public.planning_recueils;
create policy planning_recueils_delete_faiseur
  on public.planning_recueils for delete to authenticated
  using ( public.is_faiseur() );

-- ---- 6. Table planning_desiderata ----
-- Une ligne par (associé, recueil). Contenu détaillé en jsonb.
create table if not exists public.planning_desiderata (
  id          uuid primary key default gen_random_uuid(),
  recueil_id  uuid not null references public.planning_recueils(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  soumis      boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (user_id, recueil_id)
);

create index if not exists planning_desiderata_recueil_idx
  on public.planning_desiderata (recueil_id);

alter table public.planning_desiderata enable row level security;

drop trigger if exists planning_desiderata_touch_updated_at on public.planning_desiderata;
create trigger planning_desiderata_touch_updated_at
  before update on public.planning_desiderata
  for each row execute function public.touch_updated_at();

-- RLS desiderata — CONFIDENTIALITÉ :
-- SELECT : sa propre ligne OU le faiseur (lecture de tout le monde).
drop policy if exists planning_desiderata_select on public.planning_desiderata;
create policy planning_desiderata_select
  on public.planning_desiderata for select to authenticated
  using ( user_id = auth.uid() or public.is_faiseur() );

-- INSERT/UPDATE/DELETE : uniquement sa propre ligne.
drop policy if exists planning_desiderata_insert_self on public.planning_desiderata;
create policy planning_desiderata_insert_self
  on public.planning_desiderata for insert to authenticated
  with check ( user_id = auth.uid() );

drop policy if exists planning_desiderata_update_self on public.planning_desiderata;
create policy planning_desiderata_update_self
  on public.planning_desiderata for update to authenticated
  using  ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

drop policy if exists planning_desiderata_delete_self on public.planning_desiderata;
create policy planning_desiderata_delete_self
  on public.planning_desiderata for delete to authenticated
  using ( user_id = auth.uid() );
