-- ============================================================
-- SARM — Remplaçants connus (reconnaissance des noms dans « Planning par service »)
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Réutilise public.touch_updated_at() et public.is_faiseur() de planning.sql.
-- Idempotent (réexécutable sans erreur).
--
-- Table SINGLETON (une seule ligne, id = 1). `data` (jsonb) :
--   { v, noms: [ "Dr Untel", ... ] }
-- Liste éditable par le faiseur, fusionnée avec REMPLACANTS_CONNUS (src/data/remplacants.js)
-- pour reconnaître le nom d'un remplaçant écrit dans une cellule du collage.
-- ============================================================

create table if not exists public.planning_remplacants (
  id          int  primary key default 1,
  data        jsonb not null default '{"v":1,"noms":[]}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint planning_remplacants_singleton check (id = 1)
);

alter table public.planning_remplacants enable row level security;

drop trigger if exists planning_remplacants_touch_updated_at on public.planning_remplacants;
create trigger planning_remplacants_touch_updated_at
  before update on public.planning_remplacants
  for each row execute function public.touch_updated_at();

-- RLS : tout authenticated LIT, seul le faiseur ÉCRIT.
drop policy if exists planning_remplacants_select on public.planning_remplacants;
create policy planning_remplacants_select
  on public.planning_remplacants for select to authenticated
  using ( true );

drop policy if exists planning_remplacants_insert_faiseur on public.planning_remplacants;
create policy planning_remplacants_insert_faiseur
  on public.planning_remplacants for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_remplacants_update_faiseur on public.planning_remplacants;
create policy planning_remplacants_update_faiseur
  on public.planning_remplacants for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );
