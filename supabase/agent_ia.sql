-- ============================================================
-- agent_ia.sql — le profil « Agent IA » du module IADE (2026-09-28)
--
-- Un compte tenu par un assistant IA (Instinct), cloisonné à DEUX écrans :
-- « Congés, HS et rempla » (sans les onglets Créneaux et Synthèse) et
-- « Planning IADE » avec le droit de modifier une case. Tout le reste du
-- dashboard lui est fermé, côté écran (App.jsx) ET côté base (ici).
--
-- Principe : l'agent IA est un compte IADE (is_iade = true) qui porte en plus
-- le drapeau is_agent_ia. Rester un compte IADE, c'est rester HORS de
-- acces_cabinet() — donc hors des finances, du planning MAR et des archives,
-- quel que soit le niveau de sa session. Le drapeau ne fait qu'ajouter la
-- gestion IADE (peut_gerer_iade), moins les créneaux fermés.
--
-- Idempotent (réexécutable sans erreur). À exécuter dans le SQL Editor
-- APRÈS iade_conges.sql et iade_creneaux_fermes.sql, AVANT de déployer le
-- code qui lit la colonne (api/_lib/auth.js la sélectionne explicitement).
-- ============================================================

-- ---- 1. Le drapeau ----
alter table public.profiles
  add column if not exists is_agent_ia boolean not null default false;

-- Un agent IA est TOUJOURS un compte IADE : jamais admin, faiseur, gestionnaire
-- ni associé (profiles_iade_exclusif s'en charge), et jamais dans acces_cabinet().
alter table public.profiles drop constraint if exists profiles_agent_ia_est_iade;
alter table public.profiles add constraint profiles_agent_ia_est_iade
  check ( not is_agent_ia or is_iade );

-- ---- 2. is_agent_ia() — même modèle que is_iade() ----
create or replace function public.is_agent_ia()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id          = auth.uid()
      and is_agent_ia = true
      and is_iade     = true
      and status      = 'active'
  );
$$;

revoke all    on function public.is_agent_ia() from public, anon, authenticated;
grant execute on function public.is_agent_ia() to authenticated;

-- ---- 3. peut_gerer_iade() : l'agent IA décide comme la gestion ----
-- Congés (valider / refuser), heures sup, remplaçants, cases du planning :
-- toutes les policies et les triggers passent par cette fonction. Chaque
-- écriture reste tracée à son uid (cree_par / maj_par / decide_par).
create or replace function public.peut_gerer_iade()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_gestion_iade() or public.is_faiseur() or public.is_admin()
      or public.is_agent_ia();
$$;

revoke all    on function public.peut_gerer_iade() from public, anon, authenticated;
grant execute on function public.peut_gerer_iade() to authenticated;

-- ---- 4. Créneaux fermés : PAS pour l'agent IA ----
-- L'onglet ne lui est pas ouvert ; la base dit la même chose.
drop policy if exists iade_creneaux_fermes_insert on public.iade_creneaux_fermes;
create policy iade_creneaux_fermes_insert
  on public.iade_creneaux_fermes for insert to authenticated
  with check ( public.peut_gerer_iade() and not public.is_agent_ia() );

drop policy if exists iade_creneaux_fermes_update on public.iade_creneaux_fermes;
create policy iade_creneaux_fermes_update
  on public.iade_creneaux_fermes for update to authenticated
  using      ( public.peut_gerer_iade() and not public.is_agent_ia() )
  with check ( public.peut_gerer_iade() and not public.is_agent_ia() );

drop policy if exists iade_creneaux_fermes_delete on public.iade_creneaux_fermes;
create policy iade_creneaux_fermes_delete
  on public.iade_creneaux_fermes for delete to authenticated
  using ( public.peut_gerer_iade() and not public.is_agent_ia() );

-- ---- 5. profiles_select : l'agent IA voit les comptes IADE (leurs noms) ----
-- Comme le gestionnaire : les comptes IADE, rien des associés.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or public.is_faiseur()
    or (public.is_gestion_iade() and is_iade)
    or (public.is_agent_ia() and is_iade)
  );
