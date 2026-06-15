-- ============================================================
-- SARM — Schéma module Planning / Desiderata
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS schema.sql.
-- Réutilise public.touch_updated_at() et public.is_admin() de schema.sql.
-- Idempotent (réexécutable sans erreur).
-- ============================================================

-- ---- 1. profiles : initiales + drapeau faiseur ----
alter table public.profiles
  add column if not exists initiales  text,
  add column if not exists is_faiseur boolean not null default false;

-- Unicité des initiales TOLÉRANT les NULL (un seul EH, plusieurs comptes sans
-- initiales autorisés). Même pattern que invitations_one_active_per_email.
create unique index if not exists profiles_initiales_unique
  on public.profiles (initiales)
  where initiales is not null;

-- ---- 2. is_faiseur() — SECURITY DEFINER (modèle is_admin) ----
-- Bypass la RLS pour lire profiles, évite la récursion dans les policies.
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
-- Le faiseur doit lire TOUS les profils pour mapper user_id → initiales/email
-- dans le board de suivi.
drop policy if exists profiles_select on public.profiles;

create policy profiles_select
  on public.profiles for select to authenticated
  using ( id = auth.uid() or public.is_admin() or public.is_faiseur() );

-- profiles_update_admin_only reste inchangée : l'attribution initiales/faiseur
-- passe par le service_role dans /api/planning-attribuer (ignore la RLS).

-- ---- 4. Table planning_periodes ----
-- Un « recueil » ouvert par le faiseur pour une (année, période).
create table if not exists public.planning_periodes (
  id          uuid primary key default gen_random_uuid(),
  annee       int  not null,
  periode     text not null check (periode in ('janv-juin','ete','sept-dec')),
  statut      text not null default 'ouvert' check (statut in ('ouvert','ferme')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (annee, periode)
);

create index if not exists planning_periodes_lookup_idx
  on public.planning_periodes (annee, periode);

alter table public.planning_periodes enable row level security;

drop trigger if exists planning_periodes_touch_updated_at on public.planning_periodes;
create trigger planning_periodes_touch_updated_at
  before update on public.planning_periodes
  for each row execute function public.touch_updated_at();

-- RLS périodes : tout authenticated LIT (les associés doivent voir ce qui est ouvert).
drop policy if exists planning_periodes_select on public.planning_periodes;
create policy planning_periodes_select
  on public.planning_periodes for select to authenticated
  using ( true );

-- Écritures réservées au faiseur (pas besoin de service_role).
drop policy if exists planning_periodes_insert_faiseur on public.planning_periodes;
create policy planning_periodes_insert_faiseur
  on public.planning_periodes for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_periodes_update_faiseur on public.planning_periodes;
create policy planning_periodes_update_faiseur
  on public.planning_periodes for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists planning_periodes_delete_faiseur on public.planning_periodes;
create policy planning_periodes_delete_faiseur
  on public.planning_periodes for delete to authenticated
  using ( public.is_faiseur() );

-- ---- 5. Table planning_desiderata ----
-- Une ligne par (associé, année, période). Contenu détaillé en jsonb.
create table if not exists public.planning_desiderata (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  annee       int  not null,
  periode     text not null check (periode in ('janv-juin','ete','sept-dec')),
  data        jsonb not null default '{}'::jsonb,
  soumis      boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (user_id, annee, periode)
);

create index if not exists planning_desiderata_lookup_idx
  on public.planning_desiderata (annee, periode);

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

-- INSERT/UPDATE/DELETE : uniquement sa propre ligne. Le faiseur lit mais
-- n'écrit jamais les lignes des autres.
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
