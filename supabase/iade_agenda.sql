-- ============================================================
-- SARM — Abonnement iCal du planning d'un IADE (synchronisation agenda personnel).
-- Chaque IADE colle un mois du planning, choisit son nom : l'app en tire ses événements
-- (à l'heure ; congé = journée entière) et les stocke ici, CUMULÉS mois après mois
-- (recoller un mois déjà présent le met à jour, les autres restent). Un `token` non
-- devinable (URL-capacité) identifie le flux public `/api/agenda-iade?token=…`.
-- `actif=false` → le flux renvoie un calendrier vide (agenda vidé au prochain rafraîchissement).
-- Le flux lit cette table via le service_role (hors RLS).
--   data (jsonb) : [ { d:'YYYYMMDD', slot, titre, desc,
--                      (à l'heure) ts:'HHMM', te:'HHMM'  |  (journée) allday:true, fin:'YYYYMMDD' } ]
--
-- Écrit par les comptes IADE, qui se connectent en AAL1 (comme leurs congés) : la RLS
-- « chacun sa ligne » n'exige donc PAS l'AAL2. À exécuter dans Supabase Dashboard →
-- SQL Editor. Réutilise public.touch_updated_at(). Idempotent (réexécutable sans erreur).
-- ============================================================

create table if not exists public.iade_agenda (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  actif      boolean not null default true,
  data       jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ajouté le 2026-08-26 : la colonne de l'agent dans le planning publié
-- (`iade_planning.iade`). Renseignée, le flux iCal recalcule les événements depuis
-- le planning À CHAQUE APPEL — l'agent désigne sa colonne une fois, son agenda suit
-- ensuite la republication nocturne sans plus rien coller. `colonne` l'emporte sur
-- `data` : deux sources vivantes mettraient deux vérités dans le même agenda.
alter table public.iade_agenda add column if not exists colonne text;

alter table public.iade_agenda enable row level security;

drop trigger if exists iade_agenda_touch_updated_at on public.iade_agenda;
create trigger iade_agenda_touch_updated_at
  before update on public.iade_agenda
  for each row execute function public.touch_updated_at();

-- RLS : chacun ne gère QUE sa propre ligne (le flux iCal lit via service_role, hors RLS).
-- Pas d'exigence AAL2 : les comptes IADE sont en AAL1 (cf. iade_conges).
drop policy if exists iade_agenda_select_self on public.iade_agenda;
create policy iade_agenda_select_self
  on public.iade_agenda for select to authenticated
  using ( user_id = auth.uid() );

drop policy if exists iade_agenda_insert_self on public.iade_agenda;
create policy iade_agenda_insert_self
  on public.iade_agenda for insert to authenticated
  with check ( user_id = auth.uid() );

drop policy if exists iade_agenda_update_self on public.iade_agenda;
create policy iade_agenda_update_self
  on public.iade_agenda for update to authenticated
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

drop policy if exists iade_agenda_delete_self on public.iade_agenda;
create policy iade_agenda_delete_self
  on public.iade_agenda for delete to authenticated
  using ( user_id = auth.uid() );
