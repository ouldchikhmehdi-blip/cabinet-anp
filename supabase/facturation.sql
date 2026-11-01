-- ============================================================
-- SARM — Facturation : facturé / réglé par mois, facturé par chirurgien
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS compta.sql
-- (compta_touch(), acces_cabinet(), is_admin()). Idempotent.
--
-- POURQUOI
-- La clinique fournit chaque mois, par associé et par établissement, deux
-- justificatifs d'honoraires : FAC (lignes facturées dans le mois) et RED
-- (lignes réglées dans le mois, avec la redevance clinique). Ces fichiers
-- portent des noms de patients : ils sont lus UNIQUEMENT sur le mini PC par
-- compta/facturation.js, qui ne pousse ici que des AGRÉGATS. Le chirurgien
-- d'une ligne facturée est retrouvé par le numéro de séjour dans les exports
-- d'actes des associés ; ce qui n'est pas retrouvé reste dans des buckets
-- (__consultations, __sans_chirurgien, __sejour_inconnu, __a_arbitrer).
--
-- SÉCURITÉ
-- Lecture : acces_cabinet(). Écriture : is_admin() (le script utilise la clé
-- service role, hors RLS). Aucune fonction serverless (Vercel 12/12).
-- ============================================================

-- ---- 1. Facturé / réglé : une ligne par mois × associé × établissement ----
create table if not exists public.facturation_mensuelle (
  annee          integer       not null,
  mois           integer       not null check (mois between 1 and 12),
  associe        text          not null,            -- code clinique, ex. OULD010
  etablissement  text          not null,            -- MIL, CLE, STR…
  facture_total  numeric(12,2) not null default 0,  -- FAC : Mt Total
  facture_dh     numeric(12,2) not null default 0,  -- FAC : Mt DH
  facture_amo    numeric(12,2) not null default 0,
  facture_amc    numeric(12,2) not null default 0,
  facture_pat    numeric(12,2) not null default 0,
  regle_total    numeric(12,2) not null default 0,  -- RED : Base Conv + Base DH
  regle_conv     numeric(12,2) not null default 0,
  regle_dh       numeric(12,2) not null default 0,
  redevance_ttc  numeric(12,2) not null default 0,  -- RED : Redev. TTC
  nb_lignes_fac  integer       not null default 0,
  nb_lignes_red  integer       not null default 0,
  fichier_fac    text          not null default '',
  fichier_red    text          not null default '',
  importe_le     timestamptz   not null default now(),
  primary key (annee, mois, associe, etablissement)
);

-- ---- 2. Facturé par chirurgien : une ligne par mois × chirurgien (ou bucket) ----
create table if not exists public.facturation_chirurgiens (
  annee       integer       not null,
  mois        integer       not null check (mois between 1 and 12),
  chirurgien  text          not null,               -- « NOM Prenom » ou __bucket
  montant     numeric(12,2) not null default 0,     -- somme des Mt Total FAC
  nb_lignes   integer       not null default 0,
  nb_sejours  integer       not null default 0,
  importe_le  timestamptz   not null default now(),
  primary key (annee, mois, chirurgien)
);

-- ---- 2 bis. Lignes d'actes facturés (export Excel par spécialité ou chirurgien) ----
-- Ajoutée le 2026-11-01 (décision drmoc) : une ligne par acte FAC rattaché, SANS nom ni prénom de
-- patient ; le n° de séjour est gardé pour retrouver un dossier à la clinique (donnée pseudonyme).
-- Écrite par compta/facturation.js (clé service role), un mois rejoué est effacé puis réécrit.
create table if not exists public.facturation_actes (
  annee          integer       not null,
  mois           integer       not null check (mois between 1 and 12),
  associe        text          not null,
  etablissement  text          not null,
  ligne          integer       not null,               -- rang de la ligne dans le fichier FAC
  chirurgien     text          not null,               -- même clé que facturation_chirurgiens
  sejour         text          not null default '',
  date_acte      date,
  date_facture   date,
  code           text          not null default '',
  coef           text          not null default '',
  dh             numeric(12,2) not null default 0,
  amo            numeric(12,2) not null default 0,
  amc            numeric(12,2) not null default 0,
  pat            numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  motif          text          not null default '',    -- raison d'un bucket ou d'un rattachement YYYY400
  importe_le     timestamptz   not null default now(),
  primary key (annee, mois, associe, etablissement, ligne)
);
create index if not exists facturation_actes_chirurgien_idx on public.facturation_actes (annee, chirurgien, mois);

create index if not exists facturation_mensuelle_annee_idx   on public.facturation_mensuelle (annee, mois);
create index if not exists facturation_chirurgiens_annee_idx on public.facturation_chirurgiens (annee, mois);

-- ---- 3. RLS ----
alter table public.facturation_mensuelle   enable row level security;
alter table public.facturation_chirurgiens enable row level security;
alter table public.facturation_actes       enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['facturation_mensuelle', 'facturation_chirurgiens', 'facturation_actes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.acces_cabinet())', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_delete', t);
  end loop;
end $$;

grant select, insert, update, delete on public.facturation_mensuelle, public.facturation_chirurgiens, public.facturation_actes to authenticated;
