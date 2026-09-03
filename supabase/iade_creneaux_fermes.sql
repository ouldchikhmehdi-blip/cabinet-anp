-- ============================================================
-- iade_creneaux_fermes — les créneaux qui sautent : une salle qui ne tourne pas,
-- parce que l'opérateur est absent.
--
-- Une ligne = UNE salle, UN jour, UN moment (journée entière, matin ou
-- après-midi). Deux salles fermées le même matin = deux lignes. C'est
-- l'information dont la gestion a besoin pour savoir où elle a du monde en trop,
-- et elle apparaît dans l'onglet « Planning IADE » à côté des remplaçants.
--
-- ⚠️ C'est le SEUL endroit du module IADE qui descend à la DEMI-JOURNÉE. Congés
-- et heures sup comptent en journées, délibérément (cf. IADE.md). Ici la
-- demi-journée est le fait métier lui-même : une salle ferme souvent le matin
-- seulement, et l'IADE libéré travaille l'après-midi.
--
-- Comme les remplaçants, ces lignes appartiennent au dashboard : la
-- republication nocturne du planning (`iade_planning*`, miroir du fichier Excel)
-- ne les touche pas.
-- ============================================================

create table if not exists public.iade_creneaux_fermes (
  id       uuid primary key default gen_random_uuid(),
  jour     date not null,
  moment   text not null default 'journee',
  salle    text not null,
  absent   text,
  note     text,
  cree_par uuid references auth.users(id) on delete set null,
  cree_le  timestamptz not null default now(),
  maj_par  uuid references auth.users(id) on delete set null,
  maj_le   timestamptz not null default now(),

  constraint iade_creneaux_moment_check
    check (moment in ('journee', 'matin', 'apres_midi')),
  constraint iade_creneaux_salle_non_vide
    check (length(btrim(salle)) > 0),

  -- Une même salle ne ferme pas deux fois le même moment. Rien n'interdit en
  -- revanche « Bloc B le matin » ET « Endoscopie l'après-midi » le même jour.
  unique (jour, moment, salle)
);

create index if not exists iade_creneaux_fermes_jour_idx on public.iade_creneaux_fermes (jour);

-- Qui a écrit, et quand — posé par la base, jamais par le client.
create or replace function public.iade_creneaux_fermes_trace()
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
  new.salle   := btrim(new.salle);
  new.absent  := nullif(btrim(coalesce(new.absent, '')), '');
  new.note    := nullif(btrim(coalesce(new.note, '')), '');
  new.maj_par := auth.uid();
  new.maj_le  := now();
  return new;
end;
$$;

drop trigger if exists iade_creneaux_fermes_trace on public.iade_creneaux_fermes;
create trigger iade_creneaux_fermes_trace
  before insert or update on public.iade_creneaux_fermes
  for each row execute function public.iade_creneaux_fermes_trace();

-- Une fonction de trigger n'a rien à faire dans l'API REST.
revoke execute on function public.iade_creneaux_fermes_trace() from public, anon, authenticated;

alter table public.iade_creneaux_fermes enable row level security;

-- Lecture : tout le monde dans l'application. L'information figure dans le
-- planning que les agents et les associés consultent.
drop policy if exists iade_creneaux_fermes_select on public.iade_creneaux_fermes;
create policy iade_creneaux_fermes_select
  on public.iade_creneaux_fermes for select
  using ( public.is_iade() or public.acces_cabinet() );

-- Écriture : la gestion IADE seule.
drop policy if exists iade_creneaux_fermes_insert on public.iade_creneaux_fermes;
create policy iade_creneaux_fermes_insert
  on public.iade_creneaux_fermes for insert
  with check ( public.peut_gerer_iade() );

drop policy if exists iade_creneaux_fermes_update on public.iade_creneaux_fermes;
create policy iade_creneaux_fermes_update
  on public.iade_creneaux_fermes for update
  using      ( public.peut_gerer_iade() )
  with check ( public.peut_gerer_iade() );

drop policy if exists iade_creneaux_fermes_delete on public.iade_creneaux_fermes;
create policy iade_creneaux_fermes_delete
  on public.iade_creneaux_fermes for delete
  using ( public.peut_gerer_iade() );
