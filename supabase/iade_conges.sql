-- ============================================================
-- SARM — Module « Congés IADE »
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS schema.sql et planning.sql,
-- et AVANT securite_aal2.sql / connexion_google.sql (qui durcissent ensuite les
-- politiques de lecture du cabinet — cf. « ordre d'exécution » en fin de fichier).
-- Réutilise public.touch_updated_at(), public.is_admin(), public.is_faiseur().
-- Idempotent (réexécutable sans erreur).
--
-- MODÈLE : une ligne = UN JOUR posé par UN agent, avec sa nature :
--   • 'cp'          → jour de congé payé ;
--   • 'recup_ferie' → récupération d'un jour férié travaillé.
-- L'agent pose ses jours un par un en cliquant dans un calendrier ; les jours
-- envoyés ensemble partagent un même `lot`, ce qui permet à la gestion de
-- répondre d'un coup à une demande sans perdre le détail jour par jour.
-- On ne demande AUCUN motif à l'agent : la raison d'un congé ne regarde pas
-- l'employeur. Seule la réponse (`motif_reponse`) peut être commentée.
--
-- Trois populations :
--   • IADE (profiles.is_iade)            → pose SES jours, voit le calendrier
--                                          de l'équipe. RIEN d'autre.
--   • Gestion IADE (is_gestion_iade)     → valide / refuse.
--   • Faiseur de planning (is_faiseur)   → même visibilité + validation
--                                          (les congés IADE conditionnent le planning).
--   • Admin                              → tout (super-utilisateur de l'app).
-- ============================================================

-- ---- 1. profiles : drapeaux IADE ----
alter table public.profiles
  add column if not exists is_iade         boolean not null default false,
  add column if not exists is_gestion_iade boolean not null default false;

create index if not exists profiles_is_iade_idx
  on public.profiles (is_iade) where is_iade;

-- Un compte IADE est un compte restreint : il ne peut pas cumuler avec les
-- rôles à privilèges (défense en profondeur — l'API /api/iade-attribuer refuse
-- déjà le cumul côté serveur).
alter table public.profiles drop constraint if exists profiles_iade_exclusif;
alter table public.profiles add constraint profiles_iade_exclusif
  check ( not is_iade or (role = 'user' and not is_faiseur and not is_gestion_iade) );

-- ---- 2. invitations : inviter directement un IADE ----
alter table public.invitations
  add column if not exists is_iade boolean not null default false;

-- ---- 3. is_iade() / is_gestion_iade() — SECURITY DEFINER (modèle is_admin) ----
create or replace function public.is_iade()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id      = auth.uid()
      and is_iade = true
      and status  = 'active'
  );
$$;

revoke all    on function public.is_iade() from public, anon, authenticated;
grant execute on function public.is_iade() to authenticated;

create or replace function public.is_gestion_iade()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id              = auth.uid()
      and is_gestion_iade = true
      and status          = 'active'
  );
$$;

revoke all    on function public.is_gestion_iade() from public, anon, authenticated;
grant execute on function public.is_gestion_iade() to authenticated;

-- Peut décider (valider / refuser) une demande.
create or replace function public.peut_gerer_iade()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_gestion_iade() or public.is_faiseur() or public.is_admin();
$$;

revoke all    on function public.peut_gerer_iade() from public, anon, authenticated;
grant execute on function public.peut_gerer_iade() to authenticated;

-- ---- 4. profiles_select : le gestionnaire IADE voit les comptes IADE ----
-- (il lui faut leurs noms ; il ne voit rien des associés).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or public.is_faiseur()
    or (public.is_gestion_iade() and is_iade)
  );

-- ---- 5. Reprise de l'ancien modèle « période » (v1) ----
-- La v1 stockait une ligne par PÉRIODE (date_debut → date_fin) avec un motif
-- libre. Le modèle est maintenant « une ligne = un jour ». La conversion n'a
-- jamais eu à tourner sur des données réelles (module mis en service après le
-- changement) : par prudence on REFUSE de détruire des lignes existantes plutôt
-- que de les convertir à l'aveugle.
do $$
begin
  if to_regclass('public.iade_conges') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'iade_conges' and column_name = 'date_debut'
     )
  then
    if exists (select 1 from public.iade_conges) then
      raise exception
        'iade_conges contient des demandes au format « période » : convertissez-les en jours avant de relancer ce fichier.';
    end if;
    drop table public.iade_conges;
  end if;
end $$;

-- ---- 6. Table iade_conges — une ligne = un jour ----
-- ⚠️ La liste des types doit rester alignée sur TYPES_CONGE (src/utils/iadeConges.js).
create table if not exists public.iade_conges (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  jour          date not null,
  type_conge    text not null default 'cp'
                check (type_conge in ('cp','recup_ferie')),
  -- Jours envoyés dans le même geste : permet de répondre à « la demande »
  -- d'un seul clic tout en gardant une décision par jour.
  lot           uuid not null default gen_random_uuid(),
  statut        text not null default 'en_attente'
                check (statut in ('en_attente','validee','refusee')),
  motif_reponse text,
  decide_par    uuid references auth.users(id) on delete set null,
  decide_le     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Ajouté le 2026-08-27 : DE QUEL jour férié la récupération provient.
-- Sans lui, la comptable recevait « récup. de jour férié » et devait demander
-- lequel, agent par agent. On stocke la DATE du férié ; son nom s'en déduit
-- (`joursFeriesFR`, src/utils/calendrier.js), donc rien n'est saisi à la main.
alter table public.iade_conges add column if not exists ferie date;

-- Un férié ne se rattache qu'à une récupération : jamais à un congé payé.
alter table public.iade_conges drop constraint if exists iade_conges_ferie_sur_recup;
alter table public.iade_conges add constraint iade_conges_ferie_sur_recup
  check ( ferie is null or type_conge = 'recup_ferie' );

-- Et toute récupération DOIT dire lequel. `not valid` : la seule ligne posée
-- avant l'ajout du champ survit telle quelle, mais plus aucun insert ni update
-- ne passe sans son férié — y compris depuis un client bricolé, la RLS ne
-- protégeant que l'accès, pas le contenu.
alter table public.iade_conges drop constraint if exists iade_conges_recup_precise;
alter table public.iade_conges add constraint iade_conges_recup_precise
  check ( type_conge <> 'recup_ferie' or ferie is not null ) not valid;

create index if not exists iade_conges_user_idx   on public.iade_conges (user_id);
create index if not exists iade_conges_jour_idx   on public.iade_conges (jour);
create index if not exists iade_conges_lot_idx    on public.iade_conges (lot);
create index if not exists iade_conges_statut_idx on public.iade_conges (statut);

-- Un même jour ne peut être posé qu'une fois par agent — sauf s'il a été refusé :
-- un refus doit pouvoir être re-demandé (et l'historique du refus est conservé).
create unique index if not exists iade_conges_jour_unique
  on public.iade_conges (user_id, jour) where statut <> 'refusee';

alter table public.iade_conges enable row level security;

drop trigger if exists iade_conges_touch_updated_at on public.iade_conges;
create trigger iade_conges_touch_updated_at
  before update on public.iade_conges
  for each row execute function public.touch_updated_at();

-- ---- 7. Trigger : horodatage de la décision, non falsifiable côté client ----
-- Le client n'a jamais la main sur decide_par / decide_le : ils sont posés ici.
create or replace function public.iade_conges_stamp_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.statut = 'en_attente' then
      -- Jour posé par l'agent : aucune décision.
      new.decide_par := null;
      new.decide_le  := null;
    else
      -- Absence saisie directement par la gestion : déjà décidée.
      if not public.peut_gerer_iade() then
        raise exception 'Un jour posé est créé « en attente ».';
      end if;
      new.decide_par := auth.uid();
      new.decide_le  := now();
    end if;
    return new;
  end if;

  if new.statut is distinct from old.statut then
    if not public.peut_gerer_iade() then
      raise exception 'Seule la gestion IADE peut décider d''une demande.';
    end if;
    new.decide_par := auth.uid();
    new.decide_le  := now();
  else
    new.decide_par := old.decide_par;
    new.decide_le  := old.decide_le;
  end if;

  return new;
end;
$$;

-- Fonction de trigger : personne ne doit pouvoir l'appeler en RPC (/rest/v1/rpc/…).
-- Le trigger, lui, continue de s'exécuter : le droit EXECUTE n'est vérifié qu'à la
-- création du trigger, pas à chaque déclenchement.
revoke all on function public.iade_conges_stamp_decision() from public, anon, authenticated;

drop trigger if exists iade_conges_decision on public.iade_conges;
create trigger iade_conges_decision
  before insert or update on public.iade_conges
  for each row execute function public.iade_conges_stamp_decision();

-- ---- 8. RLS iade_conges ----
-- SELECT : ses propres jours, ou la gestion. Les IADE voient les absences de
-- leurs collègues via la RPC iade_calendrier() ci-dessous, qui n'expose ni motif
-- de refus ni demande refusée.
drop policy if exists iade_conges_select on public.iade_conges;
create policy iade_conges_select
  on public.iade_conges for select to authenticated
  using ( (user_id = auth.uid() and public.est_actif()) or public.peut_gerer_iade() );

-- INSERT : un IADE pose SES jours ; la gestion peut saisir pour un agent.
drop policy if exists iade_conges_insert on public.iade_conges;
create policy iade_conges_insert
  on public.iade_conges for insert to authenticated
  with check (
    (user_id = auth.uid() and public.is_iade())
    or public.peut_gerer_iade()
  );

-- UPDATE : l'IADE ne modifie que SES jours encore « en attente »
-- (il ne peut donc pas se valider lui-même — cf. aussi le trigger).
drop policy if exists iade_conges_update_self on public.iade_conges;
create policy iade_conges_update_self
  on public.iade_conges for update to authenticated
  using      ( user_id = auth.uid() and statut = 'en_attente' and public.is_iade() )
  with check ( user_id = auth.uid() and statut = 'en_attente' and public.is_iade() );

drop policy if exists iade_conges_update_gestion on public.iade_conges;
create policy iade_conges_update_gestion
  on public.iade_conges for update to authenticated
  using      ( public.peut_gerer_iade() )
  with check ( public.peut_gerer_iade() );

-- DELETE : ses jours tant qu'ils sont en attente ; la gestion sans restriction.
drop policy if exists iade_conges_delete_self on public.iade_conges;
create policy iade_conges_delete_self
  on public.iade_conges for delete to authenticated
  using ( user_id = auth.uid() and statut = 'en_attente' and public.is_iade() );

drop policy if exists iade_conges_delete_gestion on public.iade_conges;
create policy iade_conges_delete_gestion
  on public.iade_conges for delete to authenticated
  using ( public.peut_gerer_iade() );

-- ---- 9. RPC iade_calendrier() — calendrier d'équipe, sans données sensibles ----
-- Renvoie les jours demandés ou validés d'une plage de dates, avec le nom de
-- l'agent. N'expose pas les motifs de refus ni les jours refusés.
-- Réservée aux IADE et à la gestion.
drop function if exists public.iade_calendrier(date, date);
create function public.iade_calendrier(p_debut date, p_fin date)
returns table (
  id         uuid,
  user_id    uuid,
  nom        text,
  jour       date,
  type_conge text,
  ferie      date,
  statut     text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         c.user_id,
         coalesce(nullif(btrim(p.nom_complet), ''), split_part(p.email, '@', 1)) as nom,
         c.jour,
         c.type_conge,
         c.ferie,
         c.statut
  from public.iade_conges c
  join public.profiles    p on p.id = c.user_id
  where c.statut in ('en_attente', 'validee')
    and c.jour between p_debut and p_fin
    and ( public.is_iade() or public.peut_gerer_iade() )
  -- Tri sur l'expression, pas sur l'alias « nom » : dans une fonction RETURNS TABLE,
  -- les colonnes de sortie sont des variables et un alias non qualifié serait ambigu.
  order by c.jour, coalesce(nullif(btrim(p.nom_complet), ''), split_part(p.email, '@', 1));
$$;

revoke all    on function public.iade_calendrier(date, date) from public, anon, authenticated;
grant execute on function public.iade_calendrier(date, date) to authenticated;

-- ============================================================
-- ORDRE D'EXÉCUTION — à respecter sur un nouvel environnement :
--   schema.sql → planning*.sql → iade_conges.sql → securite_aal2.sql → connexion_google.sql
--
-- Ce fichier ne touche volontairement PAS :
--   • handle_new_user()  → version de référence dans connexion_google.sql
--     (le rôle vient de la table invitations, pas des métadonnées) ;
--   • les politiques de lecture du planning et des consultations
--     → connexion_google.sql les pose en `using ( acces_cabinet() )`,
--       qui exige déjà 2FA + compte actif + non-IADE.
-- Les relancer depuis ici affaiblirait la sécurité.
--
-- APRÈS exécution :
--   • Onglet « Comptes » → cocher « Gestion IADE » sur le compte qui gérera les IADE.
--   • Onglet « Comptes » → inviter chaque IADE avec le rôle « IADE (congés) ».
-- ============================================================
