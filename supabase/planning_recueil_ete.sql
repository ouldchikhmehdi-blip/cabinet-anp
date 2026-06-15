-- ============================================================
-- SARM — Module Planning : type de recueil (normal / été)
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Migration NON destructive et idempotente (ne supprime aucune donnée).
--
-- Un recueil « été » correspond au fonctionnement particulier de l'été
-- (PLANNING.md §9) : les congés se répartissent par choix de colonnes
-- (maquette), pas par week-ends/jours off. La saisie des desiderata est
-- donc simplifiée pour ce type de recueil.
-- ============================================================

alter table public.planning_recueils
  add column if not exists type text not null default 'normal'
  check (type in ('normal', 'ete'));
