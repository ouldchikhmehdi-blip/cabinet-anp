-- ============================================================
-- role_compta.sql — le rôle « Compta » (2026-11-04)
--
-- Une case à cocher dans « Comptes », comme « Faiseur » : le compte ajoute les consultations
-- Doctolib et tient « Règles virements » (import du relevé, règles, classement des lignes).
-- Gestion des praticiens, suppression d'un mois et retrait d'une règle Doctolib restent à
-- l'administrateur.
--
-- CE QUE LA BASE GARANTIT
-- • compta_regles : ajout et mise à jour du dictionnaire, sans suppression.
-- • compta_transactions : ajout et mise à jour, jamais de suppression. Un trigger empêche
--   de changer la date ou le montant d'une ligne déjà en base.
-- • compta_soldes : ajout et mise à jour du solde lu dans le relevé.
--
-- LIMITE CONNUE (à l'inverse de l'arbitrage du 2026-08-13, planning_consultations_admin.sql)
-- planning_consultations est une ligne JSON unique : pour la base, un import et la
-- suppression d'un mois sont le même UPDATE. Sur cette table, le verrou « pas de
-- suppression de mois » du compte Compta n'existe donc que dans l'interface. Accepté parce
-- que la case n'est cochée que pour un compte de confiance, posée par un administrateur.
--
-- Idempotent. À exécuter dans le SQL Editor APRÈS connexion_google.sql et
-- planning_consultations_admin.sql, et AVANT de déployer le code : AuthContext sélectionne
-- is_compta, et sans la colonne il retomberait sur les champs historiques, sans is_iade.
-- ============================================================

-- ---- 1. Le drapeau ----
alter table public.profiles
  add column if not exists is_compta boolean not null default false;

-- Un compte IADE reste hors des données du cabinet : jamais Compta.
alter table public.profiles drop constraint if exists profiles_compta_pas_iade;
alter table public.profiles add constraint profiles_compta_pas_iade
  check ( not is_compta or not is_iade );

-- ---- 2. is_compta() — même modèle que is_faiseur(), 2FA exigée ----
create or replace function public.is_compta()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.est_aal2() and exists (
    select 1 from public.profiles
    where id        = auth.uid()
      and is_compta = true
      and is_iade   = false
      and status    = 'active'
  );
$$;

revoke all    on function public.is_compta() from public, anon, authenticated;
grant execute on function public.is_compta() to authenticated;

-- ---- 3. Règles virements : dictionnaire, lignes, soldes (policies en OU avec celles de l'admin) ----
drop policy if exists compta_regles_insert_compta on public.compta_regles;
create policy compta_regles_insert_compta
  on public.compta_regles for insert to authenticated
  with check ( public.is_compta() );

drop policy if exists compta_regles_update_compta on public.compta_regles;
create policy compta_regles_update_compta
  on public.compta_regles for update to authenticated
  using ( public.is_compta() )
  with check ( public.is_compta() );

drop policy if exists compta_transactions_insert_compta on public.compta_transactions;
create policy compta_transactions_insert_compta
  on public.compta_transactions for insert to authenticated
  with check ( public.is_compta() );

drop policy if exists compta_transactions_update_compta on public.compta_transactions;
create policy compta_transactions_update_compta
  on public.compta_transactions for update to authenticated
  using ( public.is_compta() )
  with check ( public.is_compta() );

drop policy if exists compta_soldes_insert_compta on public.compta_soldes;
create policy compta_soldes_insert_compta
  on public.compta_soldes for insert to authenticated
  with check ( public.is_compta() );

drop policy if exists compta_soldes_update_compta on public.compta_soldes;
create policy compta_soldes_update_compta
  on public.compta_soldes for update to authenticated
  using ( public.is_compta() )
  with check ( public.is_compta() );

-- ---- 4. Garde : une ligne de relevé garde sa date et son montant ----
-- Le classement et le libellé changent ; ce que dit la banque, non. L'admin et le service role
-- (auth.uid() nul, donc is_compta() faux) ne sont pas concernés.
create or replace function public.compta_garde_import()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() or not public.is_compta() then
    return new;
  end if;
  if new.date is distinct from old.date or new.montant is distinct from old.montant then
    raise exception 'Le rôle Compta ne modifie ni la date ni le montant d''une ligne.';
  end if;
  return new;
end;
$$;

drop trigger if exists compta_transactions_garde_import on public.compta_transactions;
create trigger compta_transactions_garde_import
  before update on public.compta_transactions
  for each row execute function public.compta_garde_import();

-- ---- 5. Consultations Doctolib : même ligne JSON que l'admin (cf. LIMITE CONNUE) ----
drop policy if exists planning_consultations_insert_compta on public.planning_consultations;
create policy planning_consultations_insert_compta
  on public.planning_consultations for insert to authenticated
  with check ( public.is_compta() );

drop policy if exists planning_consultations_update_compta on public.planning_consultations;
create policy planning_consultations_update_compta
  on public.planning_consultations for update to authenticated
  using ( public.is_compta() )
  with check ( public.is_compta() );
