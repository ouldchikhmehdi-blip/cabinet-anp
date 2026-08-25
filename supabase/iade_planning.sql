-- ============================================================
-- SARM — Module « Planning IADE » (affichage)
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS iade_conges.sql,
-- securite_aal2.sql et connexion_google.sql (il réutilise is_iade(),
-- acces_cabinet(), peut_gerer_iade()). Idempotent (réexécutable sans erreur).
--
-- MODÈLE : ces tables sont un MIROIR EN LECTURE du fichier Excel du planning,
-- pas une source. Le fichier `Planning IADE 2026.xlsx` (vault, mini PC) fait foi ;
-- chaque nuit, `pousser_planning.py` y republie l'année entière avec la clé de
-- service. Personne n'écrit ici depuis l'application — pas même la gestion IADE :
-- une correction se fait dans le fichier, sinon les deux versions divergent et
-- plus personne ne sait laquelle croire.
--
-- Qui lit : les agents IADE (comptes restreints, sans 2FA) ET les associés MAR
-- (acces_cabinet(), donc 2FA exigée). Même écran, mêmes données pour tous.
-- ============================================================

-- ---- 1. Une ligne = UN JOUR × UN IADE ----
create table if not exists public.iade_planning (
  jour        date    not null,
  iade        text    not null,          -- prénom, tel qu'en tête de colonne du fichier
  rang        smallint not null default 0, -- ordre des colonnes dans le fichier
  matin       text,
  apres_midi  text,
  poste       text,                      -- A | B | CPRE | VISC | RENFORT | OFF
  note        text,                      -- « Congé CP », « +10h »… (n'efface jamais le poste)
  -- Horodatage du passage qui a écrit la ligne. Il permet de republier par
  -- fusion, puis de supprimer ce que le fichier ne contient plus (colonne
  -- renommée, agent parti), SANS vider la table entre-temps : personne ne tombe
  -- sur un planning vide pendant la republication.
  maj         timestamptz not null default now(),
  primary key (jour, iade)
);

create index if not exists iade_planning_jour_idx on public.iade_planning (jour);

-- ---- 2. Une ligne = UN JOUR (ce qui ne dépend pas d'un agent) ----
create table if not exists public.iade_planning_jour (
  jour         date    primary key,
  vacances     boolean not null default false,          -- vacances scolaires / férié
  remplacants  text[]  not null default '{}'::text[],   -- jusqu'à 3, dans l'ordre du fichier
  maj          timestamptz not null default now()
);

-- ---- 3. Horodatage de la dernière publication ----
-- Une seule ligne (id = true) : l'écran affiche « à jour au … », pour qu'un
-- planning figé par un cron en panne se voie tout de suite.
create table if not exists public.iade_planning_maj (
  id         boolean primary key default true check (id),
  genere_le  timestamptz not null,
  annee      smallint
);

-- ---- 4. RLS : lecture pour les IADE et les associés, écriture pour personne ----
-- L'absence de politique INSERT/UPDATE/DELETE est volontaire : seule la clé de
-- service (qui contourne la RLS) écrit, depuis le mini PC.
alter table public.iade_planning       enable row level security;
alter table public.iade_planning_jour  enable row level security;
alter table public.iade_planning_maj   enable row level security;

drop policy if exists iade_planning_select on public.iade_planning;
create policy iade_planning_select
  on public.iade_planning for select to authenticated
  using ( public.is_iade() or public.acces_cabinet() );

drop policy if exists iade_planning_jour_select on public.iade_planning_jour;
create policy iade_planning_jour_select
  on public.iade_planning_jour for select to authenticated
  using ( public.is_iade() or public.acces_cabinet() );

drop policy if exists iade_planning_maj_select on public.iade_planning_maj;
create policy iade_planning_maj_select
  on public.iade_planning_maj for select to authenticated
  using ( public.is_iade() or public.acces_cabinet() );

revoke all on public.iade_planning      from public, anon;
revoke all on public.iade_planning_jour from public, anon;
revoke all on public.iade_planning_maj  from public, anon;

grant select on public.iade_planning      to authenticated;
grant select on public.iade_planning_jour to authenticated;
grant select on public.iade_planning_maj  to authenticated;

-- ---- 5. Ordre d'exécution ----
-- schema.sql → planning.sql → iade_conges.sql → iade_heures_sup.sql
-- → securite_aal2.sql → connexion_google.sql → **iade_planning.sql** (ce fichier).
