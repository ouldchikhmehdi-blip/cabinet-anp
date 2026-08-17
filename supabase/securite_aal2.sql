-- ============================================================
-- SARM — Exiger la 2FA (AAL2) côté BASE pour les données du cabinet
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql et iade_conges.sql.
-- Idempotent (réexécutable sans erreur).
--
-- POURQUOI
-- Jusqu'ici, l'obligation de 2FA était appliquée par le front (App.jsx : pas de
-- dashboard tant que aal ≠ 'aal2'). La RLS, elle, ne regardait pas le niveau
-- d'authentification : un jeton obtenu avec le SEUL mot de passe (aal1, avant la
-- saisie du code TOTP) pouvait lire consultations et planning en appelant
-- directement /rest/v1/…. Le 2FA protégeait l'écran, pas les données.
--
-- CE FICHIER
-- 1. déplace l'exigence de 2FA dans la base, pour les données du cabinet ;
-- 2. laisse le module « congés IADE » HORS de cette exigence — c'est ce qui rend
--    possible une connexion simple (mot de passe seul) pour les IADE sans exposer
--    quoi que ce soit du cabinet (cf. IADE.md § Sécurité).
-- ============================================================

-- ---- 1. est_aal2() : le jeton courant a-t-il franchi la 2FA ? ----
-- Supabase place le niveau d'assurance dans la claim `aal` du JWT.
-- Absence de claim ⇒ traité comme 'aal1' (prudence).
create or replace function public.est_aal2()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

revoke all    on function public.est_aal2() from public, anon, authenticated;
grant execute on function public.est_aal2() to authenticated;

-- ---- 2. Rôles à privilèges : exiger la 2FA ----
-- is_admin() et is_faiseur() commandent toutes les écritures du dashboard et du
-- planning : y placer l'exigence protège d'un coup lectures ET écritures.
-- (is_iade() et is_gestion_iade() ne sont volontairement PAS concernées.)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.est_aal2() and exists (
    select 1 from public.profiles
    where id     = auth.uid()
      and role   = 'admin'
      and status = 'active'
  );
$$;

revoke all    on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

create or replace function public.is_faiseur()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.est_aal2() and exists (
    select 1 from public.profiles
    where id         = auth.uid()
      and is_faiseur = true
      and status     = 'active'
  );
$$;

revoke all    on function public.is_faiseur() from public, anon, authenticated;
grant execute on function public.is_faiseur() to authenticated;

-- ---- 3. Lectures des données du cabinet : IADE exclu ET 2FA exigée ----
do $$
declare
  paires text[][] := array[
    ['planning_compteurs_ref',    'planning_compteurs_ref_select'],
    ['planning_consultations',    'planning_consultations_select'],
    ['planning_calendrier',       'planning_calendrier_select'],
    ['planning_archives',         'planning_archives_select'],
    ['planning_noel',             'planning_noel_select'],
    ['planning_recueils',         'planning_recueils_select'],
    ['planning_toussaint',        'planning_toussaint_select'],
    ['planning_agenda_evenements','pae_select'],
    ['planning_objectifs',        'planning_objectifs_select'],
    ['planning_semaines',         'planning_semaines_select'],
    ['planning_trame_ete',        'planning_trame_ete_select'],
    ['planning_trames',           'planning_trames_select'],
    ['planning_rea',              'planning_rea_select'],
    ['planning_weekends',         'planning_weekends_select'],
    ['planning_vacances',         'planning_vacances_select'],
    ['planning_ref',              'planning_ref_select'],
    ['planning_remplacants',      'planning_remplacants_select']
  ];
  i int;
begin
  for i in 1 .. array_length(paires, 1) loop
    if to_regclass('public.' || paires[i][1]) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', paires[i][2], paires[i][1]);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ( not public.is_iade() and public.est_aal2() )',
      paires[i][2], paires[i][1]
    );
  end loop;
end $$;

-- ⚠️ EXCEPTION VOLONTAIRE — planning_associes (liste des initiales) :
-- AuthContext la charge dès l'ouverture de session, donc AVANT la saisie du code
-- TOTP, et ne relance pas la requête après passage en aal2. Exiger la 2FA ici
-- ferait silencieusement retomber l'app sur la liste d'initiales codée en dur.
-- Une liste d'initiales n'est pas une donnée sensible ; le cloisonnement IADE, lui, reste.
drop policy if exists planning_associes_select on public.planning_associes;
create policy planning_associes_select
  on public.planning_associes for select to authenticated
  using ( not public.is_iade() );

-- ---- 4. Données personnelles des associés : 2FA exigée aussi ----
drop policy if exists planning_desiderata_select on public.planning_desiderata;
create policy planning_desiderata_select
  on public.planning_desiderata for select to authenticated
  using ( (user_id = auth.uid() or public.is_faiseur()) and public.est_aal2() );

drop policy if exists planning_agenda_select_self on public.planning_agenda;
create policy planning_agenda_select_self
  on public.planning_agenda for select to authenticated
  using ( user_id = auth.uid() and public.est_aal2() );

drop policy if exists planning_agenda_manuel_select_self on public.planning_agenda_manuel;
create policy planning_agenda_manuel_select_self
  on public.planning_agenda_manuel for select to authenticated
  using ( user_id = auth.uid() and public.est_aal2() );

-- Archives Excel des plannings (bucket privé).
drop policy if exists planning_archives_obj_select on storage.objects;
create policy planning_archives_obj_select
  on storage.objects for select to authenticated
  using ( bucket_id = 'planning-archives' and not public.is_iade() and public.est_aal2() );

-- ---- 5. Ce qui reste accessible SANS 2FA (et pourquoi) ----
--   • profiles  : chacun doit lire SA ligne dès l'aal1 — c'est elle qui dit à
--                 l'app s'il s'agit d'un compte IADE (donc s'il faut exiger le TOTP).
--                 Ne contient que e-mail / rôle / initiales / nom.
--   • planning_associes : cf. § 3.
--   • iade_conges + iade_calendrier() : le module congés IADE, par construction
--                 (un IADE se connecte sans 2FA, cf. IADE.md).
-- ============================================================
