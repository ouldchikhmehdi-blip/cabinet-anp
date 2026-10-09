-- ============================================================
-- SARM — Module « Compteur de congés IADE » (bloc CONGES du bulletin de paie)
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS connexion_google.sql
-- (pour est_actif()) et agent_ia.sql (pour peut_gerer_iade()).
-- Idempotent (réexécutable sans erreur).
--
-- MODÈLE : une ligne = UN AGENT, les chiffres d'UN bulletin.
--
--   CONGES    | Acquis | Pris  | Solde
--   En-cours  |  15,00 |  8,00 |  7,00
--   N         |  30,00 | 30,00 |
--   N-1       |        |       |
--
-- C'est une TRANSCRIPTION, pas un calcul : ces chiffres viennent de la paie. Le
-- dashboard ne les déduit pas de ses propres jours validés et ne cherche pas à
-- les rapprocher. Le solde n'est pas stocké : c'est Acquis − Pris, calculé à
-- l'affichage (src/utils/iadeCompteurConges.js) — une seule source de vérité,
-- et la grille de saisie doit pouvoir montrer le solde AVANT que la ligne existe.
--
-- PAS D'HISTORIQUE : la ligne est écrasée à chaque nouveau bulletin, d'où la clé
-- primaire sur user_id — une ligne par agent, rien d'autre à garantir.
-- `mois_ref` dit DE QUEL bulletin viennent les chiffres : faute d'historique,
-- c'est la SEULE trace de provenance, et sans elle plus rien ne dirait si un
-- solde affiché date du mois dernier ou de l'an passé.
--
-- Les six colonnes chiffrées sont NULLABLES, et c'est voulu : le bulletin laisse
-- la ligne N-1 VIDE plutôt que d'y imprimer 0,00. null = « le bulletin ne dit
-- rien », 0 = « le bulletin dit zéro ». Un 0 inventé à la place d'un blanc
-- serait une affirmation que le bulletin ne fait pas.
--
-- Qui écrit : la gestion IADE, le faiseur de planning, l'admin et l'agent IA
-- (peut_gerer_iade()). L'agent, lui, LIT son compteur — et rien de plus : ce
-- chiffre part en paie, il doit venir de qui tient les bulletins.
--
-- Premier numeric(x,y) du projet : jusqu'ici tout était entier (heures sup).
-- Deux décimales, parce que le bulletin en imprime deux.
--
-- Logique pure : src/utils/iadeCompteurConges.js
-- Accès client  : src/utils/iadeCompteurCongesApi.js
-- ============================================================

create table if not exists public.iade_compteur_conges (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  -- Le bulletin d'où viennent les chiffres, ramené au 1er du mois : un bulletin
  -- = un mois, garder un jour quelconque ouvrirait deux écritures pour le même.
  mois_ref        date not null,
  encours_acquis  numeric(6,2),
  encours_pris    numeric(6,2),
  n_acquis        numeric(6,2),
  n_pris          numeric(6,2),
  n1_acquis       numeric(6,2),
  n1_pris         numeric(6,2),
  -- Qui a recopié ce bulletin, et quand — posés par la base, le client n'a pas à
  -- être cru là-dessus. Pas de cree_par / cree_le : une ligne écrasée chaque mois
  -- n'a pas de naissance qui veuille dire quelque chose, seule la dernière main
  -- compte.
  maj_par         uuid references auth.users(id) on delete set null,
  maj_le          timestamptz not null default now(),

  constraint iade_compteur_conges_mois_ref_premier
    check ( extract(day from mois_ref) = 1 ),

  -- Bornes de bon sens : des jours de congé, jamais négatifs, jamais 1 500
  -- (une virgule oubliée dans « 15,00 »).
  -- ⚠️ Doit rester aligné sur MAX_JOURS — src/utils/iadeCompteurConges.js.
  constraint iade_compteur_conges_bornes check (
        (encours_acquis is null or encours_acquis between 0 and 999.99)
    and (encours_pris   is null or encours_pris   between 0 and 999.99)
    and (n_acquis       is null or n_acquis       between 0 and 999.99)
    and (n_pris         is null or n_pris         between 0 and 999.99)
    and (n1_acquis      is null or n1_acquis      between 0 and 999.99)
    and (n1_pris        is null or n1_pris        between 0 and 999.99)
  ),

  -- Une ligne entièrement vide ne dit rien : c'est l'ABSENCE de ligne qui dit
  -- « aucun bulletin recopié ». L'écran supprime la ligne plutôt que de la vider.
  constraint iade_compteur_conges_non_vide check (
    coalesce(encours_acquis, encours_pris, n_acquis, n_pris, n1_acquis, n1_pris) is not null
  )
);

comment on table public.iade_compteur_conges is
  'Bloc CONGES du bulletin de paie, recopié par la gestion. Une ligne = un agent, écrasée à chaque bulletin. Transcription, pas un calcul.';

-- Pas d'index supplémentaire : la clé primaire couvre les deux seuls accès
-- (son propre compteur, et la liste complète d'une dizaine de lignes).

-- ---- Trace : qui a recopié, et quand ----
create or replace function public.iade_compteur_conges_trace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.maj_par := auth.uid();
  new.maj_le  := now();
  return new;
end;
$$;

drop trigger if exists iade_compteur_conges_trace on public.iade_compteur_conges;
create trigger iade_compteur_conges_trace
  before insert or update on public.iade_compteur_conges
  for each row execute function public.iade_compteur_conges_trace();

-- Fonction de trigger : personne ne doit pouvoir l'appeler en RPC (/rest/v1/rpc/…).
-- Le trigger, lui, continue de s'exécuter : EXECUTE n'est vérifié qu'à sa création.
revoke execute on function public.iade_compteur_conges_trace() from public, anon, authenticated;

-- ---- RLS ----
alter table public.iade_compteur_conges enable row level security;

-- SELECT : son propre compteur, ou la gestion. `est_actif()` et non
-- `acces_cabinet()` : un compte IADE se connecte sans 2FA, acces_cabinet()
-- l'enfermerait dehors de sa propre ligne.
drop policy if exists iade_compteur_conges_select on public.iade_compteur_conges;
create policy iade_compteur_conges_select
  on public.iade_compteur_conges for select to authenticated
  using ( (user_id = auth.uid() and public.est_actif()) or public.peut_gerer_iade() );

-- INSERT / UPDATE / DELETE : la gestion IADE seule (gestionnaire, faiseur de
-- planning, admin, agent IA). L'agent ne recopie pas son propre bulletin.
drop policy if exists iade_compteur_conges_insert on public.iade_compteur_conges;
create policy iade_compteur_conges_insert
  on public.iade_compteur_conges for insert to authenticated
  with check ( public.peut_gerer_iade() );

drop policy if exists iade_compteur_conges_update on public.iade_compteur_conges;
create policy iade_compteur_conges_update
  on public.iade_compteur_conges for update to authenticated
  using      ( public.peut_gerer_iade() )
  with check ( public.peut_gerer_iade() );

-- DELETE : un compteur vidé à l'écran s'efface (l'upsert ne sait pas supprimer,
-- et la contrainte `non_vide` interdit d'enregistrer une ligne de blancs).
drop policy if exists iade_compteur_conges_delete on public.iade_compteur_conges;
create policy iade_compteur_conges_delete
  on public.iade_compteur_conges for delete to authenticated
  using ( public.peut_gerer_iade() );

revoke all on public.iade_compteur_conges from public, anon;
grant select, insert, update, delete on public.iade_compteur_conges to authenticated;

-- ============================================================
-- ORDRE D'EXÉCUTION : … → iade_conges.sql → securite_aal2.sql →
--   connexion_google.sql → iade_heures_sup.sql → agent_ia.sql →
--   iade_compteur_conges.sql (ce fichier).
-- Ce fichier ne touche à AUCUNE politique existante : il n'ajoute que sa table,
-- son trigger et ses politiques. Le relancer ne peut pas affaiblir le reste.
--
-- NOTE : l'upsert du client envoie `Prefer: resolution=merge-duplicates`, qui
-- exige à la fois le `with check` de l'INSERT et le `using`/`with check` de
-- l'UPDATE — les deux sont présents.
-- ============================================================
