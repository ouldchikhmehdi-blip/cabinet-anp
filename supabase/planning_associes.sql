-- ============================================================
-- SARM — Liste ordonnée des associés (initiales) = ordre des colonnes planning.
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS schema.sql et planning.sql.
-- Réutilise public.touch_updated_at() et public.is_admin() de schema.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Ligne UNIQUE (id = 1). `liste` (jsonb) = tableau ordonné d'initiales :
--   ["EH","MP","RC","FXD","BA","FF","YC","MOC"]
-- Permet de remplacer un associé (départ en retraite) depuis l'écran admin
-- sans redéploiement ; le prochain planning utilise la nouvelle initiale.
-- Les plannings déjà archivés (Excel) ne sont PAS affectés.
-- ============================================================

create table if not exists public.planning_associes (
  id          smallint primary key default 1,
  liste       jsonb not null default '[]'::jsonb,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint planning_associes_singleton check (id = 1)
);

-- Valeur initiale (les 8 associés actuels) — ne réécrit pas si déjà présente.
insert into public.planning_associes (id, liste)
values (1, '["EH","MP","RC","FXD","BA","FF","YC","MOC"]'::jsonb)
on conflict (id) do nothing;

alter table public.planning_associes enable row level security;

drop trigger if exists planning_associes_touch_updated_at on public.planning_associes;
create trigger planning_associes_touch_updated_at
  before update on public.planning_associes
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT (affichage des colonnes du planning) ; seul l'admin
-- ÉCRIT (les écritures réelles passent par le service_role dans /api, défense en profondeur).
drop policy if exists planning_associes_select on public.planning_associes;
create policy planning_associes_select
  on public.planning_associes for select to authenticated
  using ( true );

drop policy if exists planning_associes_write_admin on public.planning_associes;
create policy planning_associes_write_admin
  on public.planning_associes for all to authenticated
  using ( public.is_admin() )
  with check ( public.is_admin() );
