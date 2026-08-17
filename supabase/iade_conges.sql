-- ============================================================
-- SARM — Module « Congés IADE »
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS schema.sql et planning.sql.
-- Réutilise public.touch_updated_at(), public.is_admin(), public.is_faiseur().
-- Idempotent (réexécutable sans erreur).
--
-- Trois populations :
--   • IADE (profiles.is_iade)            → dépose SES demandes de congé, voit le
--                                          calendrier de l'équipe. RIEN d'autre.
--   • Gestion IADE (is_gestion_iade)     → valide / refuse les demandes.
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

-- ---- 5. handle_new_user : propager is_iade depuis les métadonnées ----
-- Le drapeau est posé par /api/accept (service_role) d'après l'invitation ;
-- un client ne peut pas créer d'auth.users, donc pas s'auto-attribuer un rôle.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_iade boolean;
begin
  v_role := coalesce(
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    'user'
  );
  v_iade := coalesce((new.raw_user_meta_data ->> 'is_iade')::boolean, false);

  -- Un IADE reste un compte restreint : jamais admin.
  if v_iade then v_role := 'user'; end if;

  insert into public.profiles (id, email, role, status, is_iade)
  values (new.id, new.email, v_role, 'active', v_iade)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---- 6. Table iade_conges ----
-- Une ligne = une demande d'absence d'un IADE sur une période [date_debut, date_fin].
-- ⚠️ La liste des types doit rester alignée sur TYPES_CONGE (src/utils/iadeConges.js).
create table if not exists public.iade_conges (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  date_debut    date not null,
  date_fin      date not null,
  type_conge    text not null default 'conges'
                check (type_conge in ('conges','rtt','sans_solde','formation','enfant_malade','autre')),
  commentaire   text,
  statut        text not null default 'en_attente'
                check (statut in ('en_attente','validee','refusee')),
  motif_reponse text,
  decide_par    uuid references auth.users(id) on delete set null,
  decide_le     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (date_fin >= date_debut)
);

create index if not exists iade_conges_user_idx   on public.iade_conges (user_id);
create index if not exists iade_conges_debut_idx  on public.iade_conges (date_debut);
create index if not exists iade_conges_statut_idx on public.iade_conges (statut);

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
      -- Demande déposée par l'agent : aucune décision.
      new.decide_par := null;
      new.decide_le  := null;
    else
      -- Absence saisie directement par la gestion : déjà décidée.
      if not public.peut_gerer_iade() then
        raise exception 'Une demande est créée « en attente ».';
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
-- SELECT (table brute, commentaires compris) : sa propre ligne, ou la gestion.
-- Les IADE voient les absences de leurs collègues via la RPC iade_calendrier()
-- ci-dessous, qui n'expose ni commentaire ni motif de refus.
drop policy if exists iade_conges_select on public.iade_conges;
create policy iade_conges_select
  on public.iade_conges for select to authenticated
  using ( user_id = auth.uid() or public.peut_gerer_iade() );

-- INSERT : un IADE dépose SA demande ; la gestion peut saisir pour un agent.
drop policy if exists iade_conges_insert on public.iade_conges;
create policy iade_conges_insert
  on public.iade_conges for insert to authenticated
  with check (
    (user_id = auth.uid() and public.is_iade())
    or public.peut_gerer_iade()
  );

-- UPDATE : l'IADE ne modifie que SA demande encore « en attente »
-- (il ne peut donc pas se valider lui-même — cf. aussi le trigger).
drop policy if exists iade_conges_update_self on public.iade_conges;
create policy iade_conges_update_self
  on public.iade_conges for update to authenticated
  using      ( user_id = auth.uid() and statut = 'en_attente' )
  with check ( user_id = auth.uid() and statut = 'en_attente' );

drop policy if exists iade_conges_update_gestion on public.iade_conges;
create policy iade_conges_update_gestion
  on public.iade_conges for update to authenticated
  using      ( public.peut_gerer_iade() )
  with check ( public.peut_gerer_iade() );

-- DELETE : sa demande tant qu'elle est en attente ; la gestion sans restriction.
drop policy if exists iade_conges_delete_self on public.iade_conges;
create policy iade_conges_delete_self
  on public.iade_conges for delete to authenticated
  using ( user_id = auth.uid() and statut = 'en_attente' );

drop policy if exists iade_conges_delete_gestion on public.iade_conges;
create policy iade_conges_delete_gestion
  on public.iade_conges for delete to authenticated
  using ( public.peut_gerer_iade() );

-- ---- 9. RPC iade_calendrier() — calendrier d'équipe, sans données sensibles ----
-- Renvoie les absences demandées ou validées d'une plage de dates, avec le nom
-- de l'agent. N'expose ni commentaire ni motif de refus, et ne renvoie pas les
-- demandes refusées. Réservée aux IADE et à la gestion.
create or replace function public.iade_calendrier(p_debut date, p_fin date)
returns table (
  id         uuid,
  user_id    uuid,
  nom        text,
  date_debut date,
  date_fin   date,
  type_conge text,
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
         c.date_debut,
         c.date_fin,
         c.type_conge,
         c.statut
  from public.iade_conges c
  join public.profiles    p on p.id = c.user_id
  where c.statut in ('en_attente', 'validee')
    and c.date_debut <= p_fin
    and c.date_fin   >= p_debut
    and ( public.is_iade() or public.peut_gerer_iade() )
  -- Tri sur l'expression, pas sur l'alias « nom » : dans une fonction RETURNS TABLE,
  -- les colonnes de sortie sont des variables et un alias non qualifié serait ambigu.
  order by c.date_debut, coalesce(nullif(btrim(p.nom_complet), ''), split_part(p.email, '@', 1));
$$;

revoke all    on function public.iade_calendrier(date, date) from public, anon, authenticated;
grant execute on function public.iade_calendrier(date, date) to authenticated;

-- ---- 10. Cloisonnement : un compte IADE ne lit AUCUNE donnée du cabinet ----
-- Les tables du planning et des consultations sont en `select using (true)` pour
-- tout compte authentifié : on y ajoute `not public.is_iade()`. Le blocage est
-- ainsi côté base, pas seulement côté écran.
--
-- ⚠️ Si l'un des fichiers supabase/planning_*.sql est réexécuté plus tard, il
--    restaure `using (true)` : relancer CE fichier ensuite (il est idempotent).
do $$
declare
  paires text[][] := array[
    ['planning_associes',         'planning_associes_select'],
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
    -- Table absente (fichier SQL correspondant pas encore exécuté) → on passe.
    if to_regclass('public.' || paires[i][1]) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', paires[i][2], paires[i][1]);
    execute format(
      'create policy %I on public.%I for select to authenticated using ( not public.is_iade() )',
      paires[i][2], paires[i][1]
    );
  end loop;
end $$;

-- Archives Excel des plannings (bucket privé) : idem.
drop policy if exists planning_archives_obj_select on storage.objects;
create policy planning_archives_obj_select
  on storage.objects for select to authenticated
  using ( bucket_id = 'planning-archives' and not public.is_iade() );

-- ============================================================
-- APRÈS exécution :
--   • Onglet « Comptes » → cocher « Gestion IADE » sur le compte qui gérera les IADE.
--   • Onglet « Comptes » → inviter chaque IADE avec le rôle « IADE (congés) ».
-- ============================================================
