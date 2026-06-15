-- ============================================================
-- SARM — Schéma authentification (Étape 1)
-- À exécuter dans Supabase Dashboard → SQL Editor
-- ============================================================

-- ---- Enums ----
create type public.user_role   as enum ('admin', 'user');
create type public.user_status as enum ('active', 'disabled');

-- ---- Table profiles ----
-- Une ligne par auth.users, créée automatiquement par le trigger
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  role        public.user_role   not null default 'user',
  status      public.user_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_role_idx   on public.profiles(role);
create index profiles_status_idx on public.profiles(status);

-- ---- Table invitations ----
create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        public.user_role not null default 'user',
  token_hash  text not null,        -- seul le hash est stocké, jamais le token brut
  invited_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz not null, -- now() + 48h, posé par le serverless
  used_at     timestamptz,          -- non null ⇒ invitation consommée (usage unique)
  created_at  timestamptz not null default now()
);

create index  invitations_email_idx  on public.invitations(lower(email));
create unique index invitations_token_idx on public.invitations(token_hash);

-- Au plus une invitation active (non utilisée) par adresse e-mail
create unique index invitations_one_active_per_email
  on public.invitations(lower(email))
  where used_at is null;

-- ---- Activer RLS ----
alter table public.profiles    enable row level security;
alter table public.invitations enable row level security;

-- ---- Trigger updated_at sur profiles ----
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---- is_admin() — SECURITY DEFINER pour éviter la récursion RLS ----
-- Cette fonction bypass la RLS pour lire profiles ; elle est appelée
-- dans les policies à la place d'une sous-requête directe.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id     = auth.uid()
      and role   = 'admin'
      and status = 'active'
  );
$$;

revoke all    on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---- Policies profiles ----

-- Lecture : chacun voit sa propre ligne ; un admin voit tout
create policy profiles_select
  on public.profiles for select to authenticated
  using ( id = auth.uid() or public.is_admin() );

-- Mise à jour : réservée aux admins (promotion rôle, désactivation status)
-- Les opérations réelles passent par le service_role (ignore la RLS),
-- cette policy est une défense en profondeur.
create policy profiles_update_admin_only
  on public.profiles for update to authenticated
  using  ( public.is_admin() )
  with check ( public.is_admin() );

-- Pas de policy INSERT/DELETE pour les clients :
-- la création est gérée par le trigger handle_new_user (SECURITY DEFINER).

-- ---- Policies invitations ----

-- Seuls les admins peuvent lire la liste des invitations (écran d'audit)
create policy invitations_select_admin
  on public.invitations for select to authenticated
  using ( public.is_admin() );

-- Aucune policy insert/update/delete côté client :
-- toutes les écritures passent par le service_role dans les fonctions serverless.

-- ---- Trigger handle_new_user ----
-- Crée automatiquement la ligne profiles à chaque nouvel auth.users.
-- Le rôle est lu dans raw_user_meta_data.role (posé par le serverless lors de
-- admin.createUser). Un client ne peut pas créer d'auth.users sans service_role,
-- donc il ne peut pas s'auto-attribuer un rôle.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  v_role := coalesce(
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    'user'
  );

  insert into public.profiles (id, email, role, status)
  values (new.id, new.email, v_role, 'active')
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- APRÈS avoir exécuté ce SQL, créez le premier admin :
--
-- 1. Supabase Dashboard → Authentication → Add user
--    → entrer email + mot de passe → cocher "Auto Confirm User"
--    (le trigger crée sa ligne profiles avec role='user')
--
-- 2. SQL Editor → exécuter :
--    update public.profiles set role = 'admin'
--    where email = 'votre-email@exemple.fr';
--
-- 3. À la 1ère connexion, l'app force l'enrôlement du TOTP.
-- ============================================================
