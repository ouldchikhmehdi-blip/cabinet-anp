-- ============================================================
-- SARM — Abonnement iCal du planning par associé (synchronisation agenda personnel).
-- Une ligne par associé : un `token` non devinable (URL-capacité) qui sert d'identifiant au flux iCal
-- public `/api/agenda?token=…`. `actif=false` → le flux renvoie un calendrier vide (agenda vidé au
-- prochain rafraîchissement). Le flux lit cette table via le service_role (hors RLS).
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql. Réutilise public.touch_updated_at().
-- Idempotent (réexécutable sans erreur).
-- ============================================================

create table if not exists public.planning_agenda (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  actif      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.planning_agenda enable row level security;

drop trigger if exists planning_agenda_touch_updated_at on public.planning_agenda;
create trigger planning_agenda_touch_updated_at
  before update on public.planning_agenda
  for each row execute function public.touch_updated_at();

-- RLS : chaque associé ne gère QUE sa propre ligne (le flux iCal lit via service_role, hors RLS).
drop policy if exists planning_agenda_select_self on public.planning_agenda;
create policy planning_agenda_select_self
  on public.planning_agenda for select to authenticated
  using ( user_id = auth.uid() );

drop policy if exists planning_agenda_insert_self on public.planning_agenda;
create policy planning_agenda_insert_self
  on public.planning_agenda for insert to authenticated
  with check ( user_id = auth.uid() );

drop policy if exists planning_agenda_update_self on public.planning_agenda;
create policy planning_agenda_update_self
  on public.planning_agenda for update to authenticated
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );
