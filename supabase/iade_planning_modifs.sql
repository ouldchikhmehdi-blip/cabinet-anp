-- ============================================================
-- iade_planning_modifs — les cases du planning IADE modifiées DEPUIS LE DASHBOARD.
--
-- Décidé le 2026-09-16. Jusqu'ici, corriger une case (poste, horaires) supposait
-- d'ouvrir le fichier Excel source sur le mini PC. Ici, la gestion IADE modifie la
-- case dans l'onglet « Planning IADE » ; la chaîne de publication la reporte dans
-- le fichier Dropbox et l'agent concerné est prévenu par e-mail.
--
-- Une ligne = UNE case (jour × IADE) qui diffère du fichier source. Le miroir
-- `iade_planning` n'est PAS touché : il reste ce que le fichier dit, republié
-- chaque passage. L'affichage superpose cette table au miroir, comme il superpose
-- déjà les remplaçants et les créneaux — et la chaîne de publication (mini PC)
-- peint la case modifiée dans le fichier Excel, avec un commentaire qui dit d'où
-- elle vient. Une modification l'emporte TOUJOURS sur le fichier ; si la case source
-- change ensuite, le script le signale dans son journal plutôt que de trancher seul.
--
-- Cycle de vie :
--   'active'  — la case modifiée est celle qui s'affiche et se publie ;
--   'annulee' — « Revenir au fichier » : la case reprend la valeur du fichier
--               (`fichier`, conservée ici) dès maintenant à l'écran ; la chaîne
--               republie, puis purge la ligne (pousser_planning.py). Une ligne
--               n'est jamais supprimée depuis l'application : l'e-mail de retour
--               relit la ligne, et la purge ne se fait qu'une fois le fichier à jour.
--
-- Forme d'une case (`kind`, comme dans convertir_mois.py) :
--   full  → journée pleine, un seul texte (matin)      · cellules fusionnées dans l'Excel
--   split → journée coupée, deux textes                 · deux cellules
--   matin / aprem → une demi-journée seule              · une cellule sur deux
--   off   → OFF, aucun texte
-- Le texte d'une demi-journée est celui du fichier : « 8h-18h B », « CPRE »…
-- `poste` en est déduit (même détection que le fichier), pour la couleur.
-- ============================================================

create table if not exists public.iade_planning_modifs (
  id         uuid primary key default gen_random_uuid(),
  jour       date not null,
  iade       text not null,            -- en-tête de colonne, tel qu'en iade_planning.iade
  kind       text not null,
  matin      text,
  apres_midi text,
  poste      text,
  -- La case affichée juste avant CETTE modification (miroir ou modification
  -- précédente) : c'est ce que l'e-mail à l'agent rappelle (« avant : … »).
  avant      jsonb,
  -- La case du FICHIER au moment de la première modification. Posée une fois,
  -- conservée par le trigger : après republication, le miroir porte la case
  -- modifiée et plus rien d'autre ne sait ce que le fichier disait.
  fichier    jsonb,
  statut     text not null default 'active',
  lot        uuid not null,            -- un enregistrement = un lot = un e-mail par agent
  cree_par   uuid references auth.users(id) on delete set null,
  cree_le    timestamptz not null default now(),
  maj_par    uuid references auth.users(id) on delete set null,
  maj_le     timestamptz not null default now(),

  constraint iade_planning_modifs_kind_check
    check (kind in ('full', 'split', 'matin', 'aprem', 'off')),
  constraint iade_planning_modifs_poste_check
    check (poste is null or poste in ('A', 'B', 'CPRE', 'VISC', 'RENFORT', 'OFF')),
  constraint iade_planning_modifs_statut_check
    check (statut in ('active', 'annulee')),
  -- La forme et les textes vont ensemble : une journée pleine sans texte, ou un
  -- OFF avec des horaires, serait une case que ni l'écran ni l'Excel ne sauraient peindre.
  constraint iade_planning_modifs_forme check (
       (kind = 'off'   and coalesce(btrim(matin), '') = ''  and coalesce(btrim(apres_midi), '') = '')
    or (kind = 'split' and coalesce(btrim(matin), '') <> '' and coalesce(btrim(apres_midi), '') <> '')
    or (kind in ('full', 'matin')
                       and coalesce(btrim(matin), '') <> '' and coalesce(btrim(apres_midi), '') = '')
    or (kind = 'aprem' and coalesce(btrim(matin), '') = ''  and coalesce(btrim(apres_midi), '') <> '')
  ),

  unique (jour, iade)
);

create index if not exists iade_planning_modifs_jour_idx on public.iade_planning_modifs (jour);

-- Qui a écrit, et quand — posé par la base, le client n'a pas à être cru là-dessus.
-- `fichier` ne se pose qu'une fois : une modification de la modification garde ce
-- que le fichier disait à l'origine.
create or replace function public.iade_planning_modifs_trace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.cree_par := auth.uid();
    new.cree_le  := now();
  else
    new.cree_par := old.cree_par;
    new.cree_le  := old.cree_le;
    if old.fichier is not null then
      new.fichier := old.fichier;
    end if;
  end if;
  new.maj_par := auth.uid();
  new.maj_le  := now();
  return new;
end;
$$;

drop trigger if exists iade_planning_modifs_trace on public.iade_planning_modifs;
create trigger iade_planning_modifs_trace
  before insert or update on public.iade_planning_modifs
  for each row execute function public.iade_planning_modifs_trace();

revoke execute on function public.iade_planning_modifs_trace() from public, anon, authenticated;

alter table public.iade_planning_modifs enable row level security;

-- Lecture : tous ceux qui lisent le planning — les agents doivent voir la case
-- modifiée dès qu'elle l'est, pas au prochain passage de la chaîne.
drop policy if exists iade_planning_modifs_select on public.iade_planning_modifs;
create policy iade_planning_modifs_select
  on public.iade_planning_modifs for select to authenticated
  using ( public.is_iade() or public.acces_cabinet() );

-- Écriture : la gestion IADE seule (gestionnaire, faiseur de planning, admin).
-- Pas de politique DELETE : la purge est faite par la clé de service, après publication.
drop policy if exists iade_planning_modifs_insert on public.iade_planning_modifs;
create policy iade_planning_modifs_insert
  on public.iade_planning_modifs for insert to authenticated
  with check ( public.peut_gerer_iade() );

drop policy if exists iade_planning_modifs_update on public.iade_planning_modifs;
create policy iade_planning_modifs_update
  on public.iade_planning_modifs for update to authenticated
  using      ( public.peut_gerer_iade() )
  with check ( public.peut_gerer_iade() );

revoke all on public.iade_planning_modifs from public, anon;
grant select, insert, update on public.iade_planning_modifs to authenticated;

-- Ordre d'exécution : après iade_planning.sql (même lecteurs, même helpers).
