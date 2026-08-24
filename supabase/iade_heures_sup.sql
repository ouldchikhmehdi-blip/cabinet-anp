-- ============================================================
-- SARM — Module « Heures supplémentaires IADE »
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS iade_conges.sql
-- et securite_aal2.sql (il réutilise est_aal2() / acces_cabinet()).
-- Idempotent (réexécutable sans erreur).
--
-- MODÈLE : une ligne = UN JOUR, UN nombre d'heures ENTIER, pour UN agent.
-- Deux chemins d'entrée, distingués par `origine` :
--
--   • origine = 'iade'    → l'agent déclare ses heures et DÉSIGNE le MAR qui les
--                           lui a demandées. La ligne naît « en attente ».
--                           Le MAR désigné valide ou refuse. La gestion IADE peut
--                           trancher en secours, pour qu'une déclaration ne reste
--                           jamais bloquée si ce MAR est absent à l'approche de la paie.
--
--   • origine = 'gestion' → la gestion IADE ajoute des heures à un agent.
--                           La ligne naît DÉJÀ VALIDÉE : l'agent est informé,
--                           il n'a rien à approuver.
--
-- « MAR » n'est pas un nouveau drapeau : c'est acces_cabinet(), qui vaut déjà
-- « compte actif, 2FA vérifiée, non-IADE » — soit exactement les associés.
--
-- Une fois validées, ces heures s'inscrivent dans le planning (colonne « Congé / HS »
-- du fichier visuel, rendu « +Xh ») et entrent dans la synthèse mensuelle envoyée
-- à la comptable, à côté des congés.
-- ============================================================

-- ---- 1. Table ----
-- ⚠️ La liste des statuts doit rester alignée sur STATUTS (src/utils/iadeConges.js),
-- partagée avec les congés.
create table if not exists public.iade_heures_sup (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  jour          date not null,
  -- Heures entières : c'est la forme déjà utilisée dans le planning (« 10 HS »).
  heures        integer not null check (heures >= 1 and heures <= 24),
  origine       text not null default 'iade'
                check (origine in ('iade','gestion')),
  -- Le MAR qui a demandé les heures. C'est lui qui valide quand origine = 'iade'.
  mar_id        uuid references auth.users(id) on delete set null,
  commentaire   text,
  statut        text not null default 'en_attente'
                check (statut in ('en_attente','validee','refusee')),
  motif_reponse text,
  decide_par    uuid references auth.users(id) on delete set null,
  decide_le     timestamptz,
  -- URL-capacité remise au MAR désigné dans son e-mail : elle lui permet de
  -- décider depuis une page légère, sans connexion (cf. api/hs-decision.js).
  -- Une par déclaration, jamais réutilisée ailleurs.
  jeton         uuid not null default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Déclarer sans dire qui a demandé n'aurait personne pour valider.
  constraint iade_heures_sup_mar_requis
    check (origine <> 'iade' or mar_id is not null)
);

-- Réexécution sur une base où la table existe déjà sans le jeton.
alter table public.iade_heures_sup
  add column if not exists jeton uuid not null default gen_random_uuid();

create unique index if not exists iade_heures_sup_jeton_unique
  on public.iade_heures_sup (jeton);

create index if not exists iade_heures_sup_user_idx   on public.iade_heures_sup (user_id);
create index if not exists iade_heures_sup_jour_idx   on public.iade_heures_sup (jour);
create index if not exists iade_heures_sup_mar_idx    on public.iade_heures_sup (mar_id);
create index if not exists iade_heures_sup_statut_idx on public.iade_heures_sup (statut);

-- Un même jour ne porte qu'une déclaration par agent — sauf refus, qui peut être
-- redéclaré (et dont l'historique est conservé). Évite le double comptage en paie.
create unique index if not exists iade_heures_sup_jour_unique
  on public.iade_heures_sup (user_id, jour) where statut <> 'refusee';

alter table public.iade_heures_sup enable row level security;

drop trigger if exists iade_heures_sup_touch_updated_at on public.iade_heures_sup;
create trigger iade_heures_sup_touch_updated_at
  before update on public.iade_heures_sup
  for each row execute function public.touch_updated_at();

-- ---- 1 bis. Fenêtre de correction d'une décision ----
-- Un MAR qui s'est trompé doit pouvoir revenir sur son refus (ou sa validation)
-- « d'ici la fin du mois ». Retenu : la fin du mois QUI SUIT le jour concerné —
-- des heures du 14/09 se corrigent jusqu'au 31/10. C'est ce qui couvre l'envoi de
-- la synthèse à la comptable, et surtout ce qui évite une fenêtre déjà fermée pour
-- des heures faites le 30/09 et déclarées le 1er octobre.
--
-- La gestion IADE n'est PAS soumise à cette limite : c'est elle qui rattrape les
-- erreurs découvertes tard.
create or replace function public.iade_hs_fin_fenetre(p_jour date)
returns date
language sql
immutable
set search_path = public
as $$
  select (date_trunc('month', p_jour)::date + interval '2 months' - interval '1 day')::date;
$$;

revoke all    on function public.iade_hs_fin_fenetre(date) from public, anon;
grant execute on function public.iade_hs_fin_fenetre(date) to authenticated;

-- ---- 2. Trigger : qui crée quoi, qui décide, horodatage non falsifiable ----
-- Le client n'a jamais la main sur statut (à l'insertion), decide_par ni decide_le.
create or replace function public.iade_heures_sup_garde()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  par_jeton boolean;
begin
  if tg_op = 'INSERT' then
    if new.origine = 'iade' then
      if not (new.user_id = auth.uid() and public.is_iade()) then
        raise exception 'Une déclaration « iade » ne peut être créée que par l''agent lui-même.';
      end if;
      new.statut     := 'en_attente';
      new.decide_par := null;
      new.decide_le  := null;
    else
      if not public.peut_gerer_iade() then
        raise exception 'Seule la gestion IADE peut ajouter des heures sup à un agent.';
      end if;
      -- Ajoutées par la gestion : déjà actées, l'agent est seulement informé.
      new.statut     := 'validee';
      new.mar_id     := coalesce(new.mar_id, auth.uid());
      new.decide_par := auth.uid();
      new.decide_le  := now();
    end if;
    return new;
  end if;

  -- Décision prise depuis le lien reçu par e-mail : ce marqueur n'est posé que par
  -- public.iade_hs_decider_par_jeton(), qui a vérifié le jeton. Il ne donne aucun
  -- droit à lui seul : la RLS bloque toujours un tiers qui le poserait à la main.
  par_jeton := coalesce(current_setting('app.hs_jeton', true), '') = old.jeton::text;

  -- Le MAR désigné décide, il ne réécrit pas la déclaration.
  if not par_jeton and not public.peut_gerer_iade() and old.user_id is distinct from auth.uid() then
    if new.heures  is distinct from old.heures
       or new.jour    is distinct from old.jour
       or new.user_id is distinct from old.user_id
       or new.origine is distinct from old.origine
       or new.mar_id  is distinct from old.mar_id
       or new.jeton   is distinct from old.jeton then
      raise exception 'Le MAR désigné peut valider ou refuser, pas modifier la déclaration.';
    end if;
  end if;

  if new.statut is distinct from old.statut then
    if not (par_jeton
            or (old.mar_id = auth.uid() and public.acces_cabinet())
            or public.peut_gerer_iade()) then
      raise exception 'Seul le MAR désigné ou la gestion IADE peut décider de ces heures.';
    end if;
    -- Revenir sur une décision déjà prise : seulement dans la fenêtre, et
    -- seulement pour le MAR (la gestion rattrape sans limite de date).
    if old.statut <> 'en_attente'
       and not public.peut_gerer_iade()
       and current_date > public.iade_hs_fin_fenetre(old.jour) then
      raise exception
        'Le délai pour revenir sur cette décision est passé (il courait jusqu''au %). Demandez à la gestion IADE.',
        to_char(public.iade_hs_fin_fenetre(old.jour), 'DD/MM/YYYY');
    end if;
    new.decide_par := case when par_jeton then old.mar_id else auth.uid() end;
    new.decide_le  := now();
  else
    new.decide_par := old.decide_par;
    new.decide_le  := old.decide_le;
  end if;

  return new;
end;
$$;

-- Fonction de trigger : personne ne doit pouvoir l'appeler en RPC (/rest/v1/rpc/…).
-- Le trigger continue de s'exécuter : EXECUTE n'est vérifié qu'à sa création.
revoke all on function public.iade_heures_sup_garde() from public, anon, authenticated;

drop trigger if exists iade_heures_sup_decision on public.iade_heures_sup;
create trigger iade_heures_sup_decision
  before insert or update on public.iade_heures_sup
  for each row execute function public.iade_heures_sup_garde();

-- ---- 3. RLS ----
-- SELECT : l'agent ses lignes · le MAR désigné celles qui lui sont adressées ·
-- la gestion tout.
drop policy if exists iade_heures_sup_select on public.iade_heures_sup;
create policy iade_heures_sup_select
  on public.iade_heures_sup for select to authenticated
  using (
    (user_id = auth.uid() and public.est_actif())
    or (mar_id = auth.uid() and public.acces_cabinet())
    or public.peut_gerer_iade()
  );

-- INSERT : l'agent pour lui-même (origine 'iade'), la gestion pour un agent.
drop policy if exists iade_heures_sup_insert on public.iade_heures_sup;
create policy iade_heures_sup_insert
  on public.iade_heures_sup for insert to authenticated
  with check (
    (user_id = auth.uid() and public.is_iade() and origine = 'iade')
    or (public.peut_gerer_iade() and origine = 'gestion')
  );

-- UPDATE : l'agent corrige tant que personne n'a décidé.
drop policy if exists iade_heures_sup_update_self on public.iade_heures_sup;
create policy iade_heures_sup_update_self
  on public.iade_heures_sup for update to authenticated
  using      ( user_id = auth.uid() and statut = 'en_attente' and public.is_iade() )
  with check ( user_id = auth.uid() and statut = 'en_attente' and public.is_iade() );

-- Le MAR désigné décide (le trigger l'empêche de toucher au reste).
drop policy if exists iade_heures_sup_update_mar on public.iade_heures_sup;
create policy iade_heures_sup_update_mar
  on public.iade_heures_sup for update to authenticated
  using      ( mar_id = auth.uid() and public.acces_cabinet() )
  with check ( mar_id = auth.uid() and public.acces_cabinet() );

drop policy if exists iade_heures_sup_update_gestion on public.iade_heures_sup;
create policy iade_heures_sup_update_gestion
  on public.iade_heures_sup for update to authenticated
  using      ( public.peut_gerer_iade() )
  with check ( public.peut_gerer_iade() );

-- DELETE : l'agent tant que c'est en attente ; la gestion sans restriction.
drop policy if exists iade_heures_sup_delete_self on public.iade_heures_sup;
create policy iade_heures_sup_delete_self
  on public.iade_heures_sup for delete to authenticated
  using ( user_id = auth.uid() and statut = 'en_attente' and public.is_iade() );

drop policy if exists iade_heures_sup_delete_gestion on public.iade_heures_sup;
create policy iade_heures_sup_delete_gestion
  on public.iade_heures_sup for delete to authenticated
  using ( public.peut_gerer_iade() );

-- ---- 4. RPC iade_mars() — la liste où l'agent désigne son MAR ----
-- profiles_select ne laisse pas un IADE lire les comptes des associés (et c'est
-- très bien). Il lui faut pourtant leurs NOMS pour désigner qui a demandé les
-- heures : cette RPC n'expose que id + nom, jamais l'e-mail ni le rôle.
drop function if exists public.iade_mars();
create function public.iade_mars()
returns table (id uuid, nom text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         coalesce(nullif(btrim(p.nom_complet), ''), split_part(p.email, '@', 1)) as nom
  from public.profiles p
  where p.is_iade = false
    and p.status  = 'active'
    and ( public.is_iade() or public.peut_gerer_iade() or public.acces_cabinet() )
  order by coalesce(nullif(btrim(p.nom_complet), ''), split_part(p.email, '@', 1));
$$;

revoke all    on function public.iade_mars() from public, anon, authenticated;
grant execute on function public.iade_mars() to authenticated;

-- ---- 5. RPC iade_hs_pour_mar() — ce qu'un MAR doit valider, et son historique ----
-- Un associé qui n'est pas gestionnaire IADE ne peut pas lire les profils des
-- agents : il ne verrait que des identifiants. Cette RPC joint le nom de l'agent
-- aux seules lignes qui LUI sont adressées.
drop function if exists public.iade_hs_pour_mar(integer);
create function public.iade_hs_pour_mar(p_annee integer)
returns table (
  id          uuid,
  user_id     uuid,
  nom         text,
  jour        date,
  heures      integer,
  commentaire text,
  statut      text,
  origine     text,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select h.id,
         h.user_id,
         coalesce(nullif(btrim(p.nom_complet), ''), split_part(p.email, '@', 1)) as nom,
         h.jour,
         h.heures,
         h.commentaire,
         h.statut,
         h.origine,
         h.created_at
  from public.iade_heures_sup h
  join public.profiles        p on p.id = h.user_id
  where h.mar_id = auth.uid()
    and public.acces_cabinet()
    and h.jour between make_date(p_annee, 1, 1) and make_date(p_annee, 12, 31)
  -- Tri sur l'expression, pas sur l'alias « nom » : dans une fonction RETURNS TABLE,
  -- les colonnes de sortie sont des variables et un alias non qualifié serait ambigu.
  order by h.jour desc,
           coalesce(nullif(btrim(p.nom_complet), ''), split_part(p.email, '@', 1));
$$;

revoke all    on function public.iade_hs_pour_mar(integer) from public, anon, authenticated;
grant execute on function public.iade_hs_pour_mar(integer) to authenticated;

-- ---- 6. RPC iade_hs_decider_par_jeton() — décider depuis l'e-mail ----
-- Le MAR reçoit dans son e-mail deux liens portant le `jeton` de la déclaration.
-- Ils ouvrent une page de confirmation (api/hs-decision.js) qui appelle cette
-- fonction. **Le jeton EST l'autorisation** : pas de connexion, pas de 2FA.
--
-- Deux garde-fous qui comptent :
--   • la fonction n'est exécutable que par `service_role` — donc uniquement depuis
--     notre serverless, qui tient le jeton du lien. Un compte connecté qui
--     l'appellerait se fait refuser ;
--   • le marqueur `app.hs_jeton` qu'elle pose ne donne rien à lui seul : un tiers
--     qui le poserait à la main reste bloqué par la RLS de la table.
--
-- ⚠️ Un lien qui déciderait directement en GET serait déclenché tout seul par les
-- filtres anti-phishing d'Outlook et Gmail, qui visitent les liens des messages
-- entrants. D'où la page de confirmation : le GET ne fait que lire.
drop function if exists public.iade_hs_decider_par_jeton(uuid, text, text);
create function public.iade_hs_decider_par_jeton(p_jeton uuid, p_statut text, p_motif text default null)
returns table (id uuid, user_id uuid, jour date, heures integer, statut text, motif_reponse text)
language plpgsql
security definer
set search_path = public
as $$
declare v public.iade_heures_sup;
begin
  if p_statut not in ('validee','refusee') then
    raise exception 'Décision inconnue.';
  end if;

  select * into v from public.iade_heures_sup h where h.jeton = p_jeton;
  if not found then
    raise exception 'Lien inconnu.';
  end if;
  if v.mar_id is null then
    raise exception 'Cette déclaration n''a pas de MAR désigné.';
  end if;
  if v.statut <> 'en_attente' and current_date > public.iade_hs_fin_fenetre(v.jour) then
    raise exception 'Le délai pour revenir sur cette décision est passé (il courait jusqu''au %).',
      to_char(public.iade_hs_fin_fenetre(v.jour), 'DD/MM/YYYY');
  end if;

  perform set_config('app.hs_jeton', p_jeton::text, true);

  update public.iade_heures_sup h
     set statut        = p_statut,
         motif_reponse = case when p_statut = 'refusee'
                              then nullif(btrim(coalesce(p_motif, '')), '')
                              else null end
   where h.id = v.id;

  return query
    select h.id, h.user_id, h.jour, h.heures, h.statut, h.motif_reponse
    from public.iade_heures_sup h where h.id = v.id;
end;
$$;

revoke all    on function public.iade_hs_decider_par_jeton(uuid, text, text) from public, anon, authenticated;
grant execute on function public.iade_hs_decider_par_jeton(uuid, text, text) to service_role;

-- ============================================================
-- ORDRE D'EXÉCUTION :
--   schema.sql → planning*.sql → iade_conges.sql → securite_aal2.sql
--   → connexion_google.sql → iade_heures_sup.sql (ce fichier, en dernier)
--
-- Ce fichier ne touche à AUCUNE politique existante : il n'ajoute que sa table,
-- ses politiques et deux RPC. Le relancer ne peut donc pas affaiblir le reste.
-- ============================================================
