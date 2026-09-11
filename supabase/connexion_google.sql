-- ============================================================
-- SARM — Connexion « Continuer avec Google » : autorisation par invitation
-- À exécuter APRÈS securite_aal2.sql et invitation_nom_complet.sql. Idempotent.
--
-- POURQUOI CE FICHIER EST INDISPENSABLE AVANT D'ACTIVER GOOGLE
-- Jusqu'ici, un compte ne pouvait naître que par /api/accept (service_role) :
-- l'invitation était donc, de fait, la seule porte d'entrée. Avec le fournisseur
-- Google activé, **n'importe quel compte Gmail** peut déclencher la création d'un
-- auth.users en cliquant « Continuer avec Google ». Sans ce fichier, cet inconnu
-- obtiendrait un profil `user` actif, enrôlerait son propre TOTP et lirait tout
-- le cabinet.
--
-- Le verrou est déplacé au bon endroit : ce n'est plus le CHEMIN de création qui
-- autorise, c'est l'EXISTENCE D'UNE INVITATION pour cette adresse e-mail.
--   • invité (lien déjà consommé, ou invitation encore valable) → compte actif,
--     avec le rôle et les drapeaux de SON invitation ;
--   • non invité → compte créé mais **désactivé** : il ne lit rien, nulle part.
--
-- Effet de bord voulu : le rôle n'est plus lu dans raw_user_meta_data (que le
-- client peut renseigner lors d'un signUp) mais dans la table invitations, que
-- seul le service_role écrit. Plus aucune élévation de privilège possible.
-- ============================================================

-- ---- 1. Compte actif ? Accès aux données du cabinet ? ----
create or replace function public.est_actif()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

revoke all    on function public.est_actif() from public, anon, authenticated;
grant execute on function public.est_actif() to authenticated;

-- Les trois conditions pour lire une donnée du cabinet, réunies en un seul test :
-- compte actif · 2FA franchie · ce n'est pas un compte IADE.
create or replace function public.acces_cabinet()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.est_aal2() and exists (
    select 1 from public.profiles
    where id      = auth.uid()
      and status  = 'active'
      and is_iade = false
  );
$$;

revoke all    on function public.acces_cabinet() from public, anon, authenticated;
grant execute on function public.acces_cabinet() to authenticated;

-- ---- 2. Lectures du cabinet : un seul test, qui couvre aussi les comptes révoqués ----
do $$
declare
  tables text[][] := array[
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
  for i in 1 .. array_length(tables, 1) loop
    if to_regclass('public.' || tables[i][1]) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', tables[i][2], tables[i][1]);
    execute format(
      'create policy %I on public.%I for select to authenticated using ( public.acces_cabinet() )',
      tables[i][2], tables[i][1]
    );
  end loop;
end $$;

-- Liste des initiales : lue avant la 2FA (cf. securite_aal2.sql § 3), mais réservée
-- aux comptes actifs non-IADE.
drop policy if exists planning_associes_select on public.planning_associes;
create policy planning_associes_select
  on public.planning_associes for select to authenticated
  using ( public.est_actif() and not public.is_iade() );

drop policy if exists planning_desiderata_select on public.planning_desiderata;
create policy planning_desiderata_select
  on public.planning_desiderata for select to authenticated
  using ( public.acces_cabinet() and (user_id = auth.uid() or public.is_faiseur()) );

drop policy if exists planning_agenda_select_self on public.planning_agenda;
create policy planning_agenda_select_self
  on public.planning_agenda for select to authenticated
  using ( public.acces_cabinet() and user_id = auth.uid() );

drop policy if exists planning_agenda_manuel_select_self on public.planning_agenda_manuel;
create policy planning_agenda_manuel_select_self
  on public.planning_agenda_manuel for select to authenticated
  using ( public.acces_cabinet() and user_id = auth.uid() );

drop policy if exists planning_archives_obj_select on storage.objects;
create policy planning_archives_obj_select
  on storage.objects for select to authenticated
  using ( bucket_id = 'planning-archives' and public.acces_cabinet() );

-- ---- 3. Congés IADE : un compte révoqué ne touche plus à ses propres demandes ----
drop policy if exists iade_conges_select on public.iade_conges;
create policy iade_conges_select
  on public.iade_conges for select to authenticated
  using ( (user_id = auth.uid() and public.est_actif()) or public.peut_gerer_iade() );

drop policy if exists iade_conges_update_self on public.iade_conges;
create policy iade_conges_update_self
  on public.iade_conges for update to authenticated
  using      ( user_id = auth.uid() and statut = 'en_attente' and public.is_iade() )
  with check ( user_id = auth.uid() and statut = 'en_attente' and public.is_iade() );

drop policy if exists iade_conges_delete_self on public.iade_conges;
create policy iade_conges_delete_self
  on public.iade_conges for delete to authenticated
  using ( user_id = auth.uid() and statut = 'en_attente' and public.is_iade() );

-- ---- 4. handle_new_user : l'invitation fait foi, quel que soit le mode de connexion ----
-- ---- Forme canonique d'une adresse (ajouté le 2026-09-11) ----
-- Gmail IGNORE LES POINTS et tout ce qui suit un « + » : nellycantin@gmail.com,
-- nelly.cantin@gmail.com et nelly.cantin+sarm@gmail.com sont UNE SEULE boîte.
-- L'invitation partie à l'une arrive donc à l'autre — mais l'appariement se
-- faisait par égalité stricte. Une IADE invitée à « nellycantin@ » qui se
-- connecte avec Google sous « nelly.cantin@ » ne trouvait aucune invitation :
-- compte créé DISABLED, sans le drapeau IADE, donc l'écran lui réclamait une 2FA
-- dont les comptes IADE sont dispensés. C'est arrivé le 2026-09-11.
--
-- La souplesse est sans risque : deux écritures qui se ramènent à la même forme
-- canonique désignent la MÊME boîte chez Google. S'emparer de l'invitation d'un
-- tiers supposerait déjà de lire son courrier. Les autres domaines restent
-- stricts — ailleurs, le point est significatif (a.b@orange.fr ≠ ab@orange.fr).
create or replace function public.email_canonique(adresse text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
           when d in ('gmail.com', 'googlemail.com')
             then replace(split_part(l, '+', 1), '.', '') || '@gmail.com'
           else l || '@' || d
         end
  from (select split_part(lower(btrim(adresse)), '@', 1) as l,
               split_part(lower(btrim(adresse)), '@', 2) as d) x;
$$;

comment on function public.email_canonique(text) is
  'Forme canonique d''une adresse pour retrouver une invitation. Chez Gmail, points et suffixe « + » sont ignorés : ils désignent la même boîte.';

revoke all    on function public.email_canonique(text) from public, anon, authenticated;
grant execute on function public.email_canonique(text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv    record;
  v_role   public.user_role := 'user';
  v_iade   boolean          := false;
  v_nom    text;
  v_status public.user_status := 'disabled';
begin
  -- Invitation la plus récente pour cette adresse (créée par /api/invite,
  -- table écrite uniquement par le service_role). L'appariement passe par la
  -- forme canonique : chez Gmail, « nellycantin@ » et « nelly.cantin@ » sont la
  -- même boîte, et l'invitation doit se retrouver dans les deux sens.
  select id, role, is_iade, nom_complet, expires_at, used_at
    into v_inv
    from public.invitations
   where public.email_canonique(email) = public.email_canonique(new.email)
   order by created_at desc
   limit 1;

  if v_inv.id is not null then
    v_role := v_inv.role;
    v_iade := coalesce(v_inv.is_iade, false);
    v_nom  := nullif(btrim(coalesce(v_inv.nom_complet, '')), '');

    if v_inv.used_at is not null then
      -- Cas 1 : lien d'invitation utilisé — /api/accept vient de la consommer.
      v_status := 'active';
    elsif v_inv.expires_at > now() then
      -- Cas 2 : 1re connexion directe (Google) sans passer par le lien :
      -- l'invitation est encore valable, on la consomme ici.
      v_status := 'active';
      update public.invitations set used_at = now() where id = v_inv.id;
    else
      -- Invitation expirée : compte créé mais fermé (l'admin réinvite).
      v_status := 'disabled';
    end if;
  end if;

  -- Un IADE reste un compte restreint : jamais admin.
  if v_iade then v_role := 'user'; end if;

  insert into public.profiles (id, email, role, status, is_iade, nom_complet)
  values (new.id, new.email, v_role, v_status, v_iade, v_nom)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ============================================================
-- ⚠️ CONSÉQUENCE À CONNAÎTRE
-- Un compte créé À LA MAIN dans Supabase (Authentication → Add user) sans
-- invitation préalable naît désormais **désactivé**. Pour l'ouvrir :
--   update public.profiles set status = 'active' where email = '…';
-- Le chemin recommandé reste l'invitation depuis l'onglet « Comptes ».
--
-- ⚠️ À FAIRE DANS LE DASHBOARD SUPABASE (hors SQL) — cf. IADE.md § Google :
--   Authentication → Sign In / Providers → Google : activer, coller le Client ID
--   et le Client Secret créés dans Google Cloud Console, et déclarer l'URI de
--   redirection indiquée par Supabase dans le client OAuth Google.
-- ============================================================
