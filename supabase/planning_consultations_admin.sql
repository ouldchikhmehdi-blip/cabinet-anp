-- ============================================================
-- SARM — Consultations : écriture réservée à l'ADMIN.
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning_consultations.sql.
-- Réutilise public.is_admin() de schema.sql. Idempotent (réexécutable sans erreur).
--
-- POURQUOI
-- La suppression des données d'un mois (rattrapage d'un import erroné) doit être réservée au
-- compte admin. Or `planning_consultations` est une ligne JSON UNIQUE (id=1) : côté base, une
-- suppression de mois et un import sont le même UPDATE — la RLS ne peut pas les distinguer.
-- Un faiseur autorisé à écrire peut donc effacer n'importe quel mois en réécrivant le store,
-- quel que soit le verrou posé dans l'interface.
--
-- Le seul verrou réellement côté serveur est donc : ÉCRITURE = ADMIN.
--
-- CONSÉQUENCE ASSUMÉE (arbitrage validé)
-- Les faiseurs NON-admins perdent l'import Doctolib et la gestion des praticiens sur cet onglet.
-- L'import des consultations devient une action d'administration. La LECTURE reste ouverte à
-- tous les authentifiés : l'onglet Consultations s'affiche normalement pour les 8 associés.
--
-- Pour revenir en arrière : remplacer public.is_admin() par public.is_faiseur() ci-dessous
-- (état d'origine, cf. planning_consultations.sql).
-- ============================================================

-- Lecture : inchangée — tout authenticated (l'onglet est visible par tous).
drop policy if exists planning_consultations_select on public.planning_consultations;
create policy planning_consultations_select
  on public.planning_consultations for select to authenticated
  using ( true );

-- Écriture : admin uniquement. On retire explicitement les anciennes policies « faiseur »
-- (elles s'additionneraient sinon : en RLS, les policies d'une même commande sont en OU).
drop policy if exists planning_consultations_insert_faiseur on public.planning_consultations;
drop policy if exists planning_consultations_update_faiseur on public.planning_consultations;
drop policy if exists planning_consultations_delete_faiseur on public.planning_consultations;

drop policy if exists planning_consultations_insert_admin on public.planning_consultations;
create policy planning_consultations_insert_admin
  on public.planning_consultations for insert to authenticated
  with check ( public.is_admin() );

drop policy if exists planning_consultations_update_admin on public.planning_consultations;
create policy planning_consultations_update_admin
  on public.planning_consultations for update to authenticated
  using ( public.is_admin() )
  with check ( public.is_admin() );

drop policy if exists planning_consultations_delete_admin on public.planning_consultations;
create policy planning_consultations_delete_admin
  on public.planning_consultations for delete to authenticated
  using ( public.is_admin() );
