-- ============================================================
-- SARM — Événements d'agenda précalculés par tiers VALIDÉ (pour la synchronisation iCal).
-- À la validation d'un recueil (PlanningSemaines), on précalcule les événements « journée entière » de
-- CHAQUE associé (gardes, astreintes, réa, vacances, récup JF) sur la plage du tiers, à partir de la MÊME
-- source que l'export Excel. Le flux iCal public ne fait que sérialiser ces données (pas de dérivation
-- côté serveur). La dévalidation supprime la ligne → seuls les tiers réellement validés sont synchronisés.
-- À exécuter APRÈS planning.sql. Réutilise public.touch_updated_at() et public.is_faiseur().
-- Idempotent.
--
-- data (jsonb) : { <initiales>: [ { d:'YYYY-MM-DD', fin:'YYYY-MM-DD', type, titre } ] }
--   d   = 1er jour (inclus) ; fin = lendemain du dernier jour (DTEND exclusif, journée entière) ;
--   type ∈ 'garde' | 'astreinte' | 'rea' | 'vacances' | 'recup'.
-- ============================================================

create table if not exists public.planning_agenda_evenements (
  annee      int  not null,
  recueil_id uuid not null references public.planning_recueils(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (annee, recueil_id)
);

alter table public.planning_agenda_evenements enable row level security;

drop trigger if exists planning_agenda_evenements_touch on public.planning_agenda_evenements;
create trigger planning_agenda_evenements_touch
  before update on public.planning_agenda_evenements
  for each row execute function public.touch_updated_at();

-- RLS : lecture pour tout authenticated (la page « Mon agenda » liste les tiers validés) ; écriture faiseur.
drop policy if exists pae_select on public.planning_agenda_evenements;
create policy pae_select
  on public.planning_agenda_evenements for select to authenticated
  using ( true );

drop policy if exists pae_insert_faiseur on public.planning_agenda_evenements;
create policy pae_insert_faiseur
  on public.planning_agenda_evenements for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists pae_update_faiseur on public.planning_agenda_evenements;
create policy pae_update_faiseur
  on public.planning_agenda_evenements for update to authenticated
  using ( public.is_faiseur() )
  with check ( public.is_faiseur() );

drop policy if exists pae_delete_faiseur on public.planning_agenda_evenements;
create policy pae_delete_faiseur
  on public.planning_agenda_evenements for delete to authenticated
  using ( public.is_faiseur() );
