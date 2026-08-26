-- ============================================================
-- iade_remplacements — les remplaçants IADE : ceux qu'on cherche, puis ceux
-- qu'on a trouvés.
--
-- Une ligne = UN besoin de remplaçant sur UN jour. Deux lignes sur le même jour
-- quand il faut deux remplaçants (rang 1 et 2) — c'est la seule raison d'être du
-- `rang`, et la raison pour laquelle il est borné à 2.
--
-- Cycle de vie, volontairement réversible dans les deux sens :
--   'recherche' ──(on a trouvé, on saisit un nom et on valide)──► 'pourvu'
--   'pourvu'    ──(le remplaçant se décommande, on dévalide)────► 'recherche'
-- Dévalider CONSERVE le nom : dans la vraie vie, la même personne revient
-- souvent, et retaper son nom à chaque hésitation serait une punition.
--
-- Ces lignes ne sont PAS écrasées par la republication nocturne du planning :
-- `iade_planning*` est le miroir du fichier Excel, cette table appartient au
-- dashboard. L'affichage du planning fusionne les deux (cf. IadePlanning.jsx).
-- ============================================================

create table if not exists public.iade_remplacements (
  id       uuid primary key default gen_random_uuid(),
  jour     date not null,
  rang     smallint not null default 1,
  nom      text,
  statut   text not null default 'recherche',
  note     text,
  cree_par uuid references auth.users(id) on delete set null,
  cree_le  timestamptz not null default now(),
  maj_par  uuid references auth.users(id) on delete set null,
  maj_le   timestamptz not null default now(),

  constraint iade_remplacements_rang_check   check (rang between 1 and 2),
  constraint iade_remplacements_statut_check check (statut in ('recherche', 'pourvu')),
  -- Un remplaçant « pourvu » porte forcément un nom : sans ça, le planning
  -- afficherait une case vide en prétendant que le jour est couvert.
  constraint iade_remplacements_pourvu_nomme
    check (statut <> 'pourvu' or (nom is not null and length(btrim(nom)) > 0)),

  unique (jour, rang)
);

create index if not exists iade_remplacements_jour_idx on public.iade_remplacements (jour);

-- Qui a écrit, et quand. Posé par la base : le client n'a pas à être cru là-dessus.
create or replace function public.iade_remplacements_trace()
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
  end if;
  new.maj_par := auth.uid();
  new.maj_le  := now();
  return new;
end;
$$;

drop trigger if exists iade_remplacements_trace on public.iade_remplacements;
create trigger iade_remplacements_trace
  before insert or update on public.iade_remplacements
  for each row execute function public.iade_remplacements_trace();

-- Une fonction de trigger n'a rien à faire dans l'API REST : sans ce revoke, elle
-- s'y expose en /rest/v1/rpc/ (inoffensif — elle refuse hors trigger — mais c'est
-- une porte de plus, et l'audit Supabase la signale).
revoke execute on function public.iade_remplacements_trace() from public, anon, authenticated;

alter table public.iade_remplacements enable row level security;

-- Lecture : tout le monde dans l'application. Les remplaçants figurent déjà dans
-- le planning que les agents et les associés consultent — les cacher ici serait
-- une fausse pudeur.
drop policy if exists iade_remplacements_select on public.iade_remplacements;
create policy iade_remplacements_select
  on public.iade_remplacements for select
  using ( public.is_iade() or public.acces_cabinet() );

-- Écriture : la gestion IADE seule (gestionnaire, faiseur de planning, admin).
drop policy if exists iade_remplacements_insert on public.iade_remplacements;
create policy iade_remplacements_insert
  on public.iade_remplacements for insert
  with check ( public.peut_gerer_iade() );

drop policy if exists iade_remplacements_update on public.iade_remplacements;
create policy iade_remplacements_update
  on public.iade_remplacements for update
  using      ( public.peut_gerer_iade() )
  with check ( public.peut_gerer_iade() );

drop policy if exists iade_remplacements_delete on public.iade_remplacements;
create policy iade_remplacements_delete
  on public.iade_remplacements for delete
  using ( public.peut_gerer_iade() );
