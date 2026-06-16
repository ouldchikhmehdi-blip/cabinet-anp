-- ============================================================
-- SARM — Planning : archives Excel (plannings validés) + verrou base des desiderata
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS planning.sql.
-- Réutilise public.is_faiseur() et public.touch_updated_at(). Idempotent.
--
-- Quand le faiseur « valide définitivement » un planning, le fichier .xlsx est
-- déposé dans le bucket privé `planning-archives` et indexé ici. Les associés
-- peuvent consulter (télécharger) les anciens plannings ; seul le faiseur écrit.
-- ============================================================

-- ---- 1. Bucket de stockage (privé) ----
insert into storage.buckets (id, name, public)
values ('planning-archives', 'planning-archives', false)
on conflict (id) do nothing;

-- ---- 2. Policies sur storage.objects (bucket planning-archives) ----
-- Lecture : tous les associés authentifiés (consultation des anciens plannings).
drop policy if exists planning_archives_obj_select on storage.objects;
create policy planning_archives_obj_select
  on storage.objects for select to authenticated
  using ( bucket_id = 'planning-archives' );

-- Écriture / remplacement / suppression : faiseur uniquement.
drop policy if exists planning_archives_obj_insert on storage.objects;
create policy planning_archives_obj_insert
  on storage.objects for insert to authenticated
  with check ( bucket_id = 'planning-archives' and public.is_faiseur() );

drop policy if exists planning_archives_obj_update on storage.objects;
create policy planning_archives_obj_update
  on storage.objects for update to authenticated
  using  ( bucket_id = 'planning-archives' and public.is_faiseur() )
  with check ( bucket_id = 'planning-archives' and public.is_faiseur() );

drop policy if exists planning_archives_obj_delete on storage.objects;
create policy planning_archives_obj_delete
  on storage.objects for delete to authenticated
  using ( bucket_id = 'planning-archives' and public.is_faiseur() );

-- ---- 3. Table d'index des archives ----
create table if not exists public.planning_archives (
  id            uuid primary key default gen_random_uuid(),
  annee         int  not null,
  recueil_id    uuid references public.planning_recueils(id) on delete set null,
  nom           text not null,
  semaine_debut int,
  semaine_fin   int,
  chemin        text not null,          -- chemin dans le bucket planning-archives
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists planning_archives_annee_idx
  on public.planning_archives (annee);

alter table public.planning_archives enable row level security;

-- SELECT : tous les associés ; INSERT / DELETE : faiseur uniquement.
drop policy if exists planning_archives_select on public.planning_archives;
create policy planning_archives_select
  on public.planning_archives for select to authenticated
  using ( true );

drop policy if exists planning_archives_insert_faiseur on public.planning_archives;
create policy planning_archives_insert_faiseur
  on public.planning_archives for insert to authenticated
  with check ( public.is_faiseur() );

drop policy if exists planning_archives_delete_faiseur on public.planning_archives;
create policy planning_archives_delete_faiseur
  on public.planning_archives for delete to authenticated
  using ( public.is_faiseur() );

-- ---- 4. Verrou des desiderata côté BASE (défense en profondeur) ----
-- Un associé ne peut plus écrire ses desiderata si le recueil est « fermé ».
-- Le faiseur reste libre (réinitialisation, corrections).
create or replace function public.desiderata_recueil_ouvert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select statut from public.planning_recueils where id = new.recueil_id) = 'ferme'
     and not public.is_faiseur() then
    raise exception 'Recueil fermé : modification des desiderata impossible.';
  end if;
  return new;
end;
$$;

drop trigger if exists planning_desiderata_recueil_ouvert on public.planning_desiderata;
create trigger planning_desiderata_recueil_ouvert
  before insert or update on public.planning_desiderata
  for each row execute function public.desiderata_recueil_ouvert();

-- ---- 5. Permettre au faiseur de réinitialiser les desiderata d'un recueil ----
-- (DELETE était réservé à sa propre ligne ; on ajoute le faiseur.)
drop policy if exists planning_desiderata_delete_faiseur on public.planning_desiderata;
create policy planning_desiderata_delete_faiseur
  on public.planning_desiderata for delete to authenticated
  using ( public.is_faiseur() );
