-- ============================================================
-- SARM — Comptabilité : règles de classement et lignes bancaires classées
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS securite_aal2.sql et
-- connexion_google.sql (acces_cabinet()). Idempotent.
--
-- POURQUOI
-- Les pages finance du dashboard tournaient sur des données fictives dans le
-- bundle. Les vraies lignes viennent des relevés OFX de la BNP, classées par le
-- moteur compta/moteur.js (même code côté script local et côté navigateur). Les
-- règles de classement vivent ici, en un seul document JSON (même structure que
-- compta/regles.json, qui n'est plus que la graine et l'export).
--
-- SÉCURITÉ
-- Lecture : acces_cabinet() — associés actifs, hors comptes IADE, 2FA exigée.
-- Écriture : is_admin() — 2FA exigée. Aucune fonction serverless : le navigateur
-- écrit sous RLS (plan Vercel à 12/12 fonctions).
-- ============================================================

-- ---- 1. Document de règles (une seule ligne) ----
create table if not exists public.compta_regles (
  id       integer     primary key default 1 check (id = 1),
  doc      jsonb       not null,
  maj_le   timestamptz not null default now(),
  maj_par  uuid        references auth.users (id) on delete set null
);

-- ---- 2. Lignes bancaires classées (une par FITID BNP) ----
create table if not exists public.compta_transactions (
  fitid      text          primary key,
  date       date          not null,
  montant    numeric(12,2) not null,
  type       text          not null default '',
  libelle    text          not null default '',
  tiers      text          not null default '',
  groupe     text          not null default 'À arbitrer',
  categorie  text          not null default 'À arbitrer',
  associe    text          not null default '',
  regle      text          not null default '',
  alerte     text          not null default '',
  -- true : catégorie posée à la main dans le dashboard, le reclassement ne la touche plus
  manuel     boolean       not null default false,
  fichier    text          not null default '',
  importe_le timestamptz   not null default now(),
  maj_le     timestamptz   not null default now(),
  maj_par    uuid          references auth.users (id) on delete set null
);

create index if not exists compta_transactions_date_idx      on public.compta_transactions (date);
create index if not exists compta_transactions_categorie_idx on public.compta_transactions (categorie);

-- ---- 3. Soldes connus (LEDGERBAL des relevés) : ancre de la courbe de trésorerie ----
create table if not exists public.compta_soldes (
  date       date          primary key,
  solde      numeric(12,2) not null,
  fichier    text          not null default '',
  importe_le timestamptz   not null default now()
);

-- ---- 4. maj_le / maj_par posés par la base ----
create or replace function public.compta_touch()
returns trigger
language plpgsql
as $$
begin
  new.maj_le  := now();
  new.maj_par := auth.uid();
  return new;
end;
$$;

drop trigger if exists compta_regles_touch on public.compta_regles;
create trigger compta_regles_touch
  before insert or update on public.compta_regles
  for each row execute function public.compta_touch();

drop trigger if exists compta_transactions_touch on public.compta_transactions;
create trigger compta_transactions_touch
  before update on public.compta_transactions
  for each row execute function public.compta_touch();

-- ---- 5. RLS ----
alter table public.compta_regles       enable row level security;
alter table public.compta_transactions enable row level security;
alter table public.compta_soldes       enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['compta_regles', 'compta_transactions', 'compta_soldes'] loop
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

grant select, insert, update, delete on public.compta_regles, public.compta_transactions, public.compta_soldes to authenticated;
