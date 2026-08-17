-- ============================================================
-- SARM — Nommer un compte dès l'invitation
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS iade_conges.sql. Idempotent.
--
-- POURQUOI : jusqu'ici, `nom_complet` était saisi par l'admin APRÈS coup, dans
-- l'onglet « Comptes ». Un compte fraîchement créé s'affichait donc sous la partie
-- gauche de son e-mail. Pour les IADE, savoir qui dépose une demande de congé est
-- essentiel : le nom est désormais porté par l'invitation elle-même et appliqué
-- au profil à la création du compte.
-- ============================================================

alter table public.invitations
  add column if not exists nom_complet text;

-- handle_new_user : reprend aussi le nom complet transmis par /api/accept.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_iade boolean;
  v_nom  text;
begin
  v_role := coalesce(
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    'user'
  );
  v_iade := coalesce((new.raw_user_meta_data ->> 'is_iade')::boolean, false);
  v_nom  := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'nom_complet', '')), '');

  -- Un IADE reste un compte restreint : jamais admin.
  if v_iade then v_role := 'user'; end if;

  insert into public.profiles (id, email, role, status, is_iade, nom_complet)
  values (new.id, new.email, v_role, 'active', v_iade, v_nom)
  on conflict (id) do nothing;

  return new;
end;
$$;
