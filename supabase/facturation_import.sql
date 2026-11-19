-- ============================================================
-- SARM — Facturation : import d'un mois depuis le site (2026-11-19)
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS facturation.sql et
-- role_compta.sql (is_compta()). Idempotent.
--
-- POURQUOI
-- Le bouton « Importer » de l'onglet Facturé → Facturé / réglé lit les
-- justificatifs FAC / RED d'un mois DANS LE NAVIGATEUR (ils portent des noms de
-- patients et n'en sortent pas) et n'envoie ici que les agrégats : une ligne par
-- associé × établissement, la même que celle qu'écrit compta/facturation.js.
--
-- SÉCURITÉ
-- Les policies d'écriture de facturation_mensuelle restent is_admin() seule.
-- Le rôle Compta n'écrit QUE par cette fonction (security definer), qui vérifie
-- elle-même is_admin() or is_compta() — les deux exigent la 2FA (AAL2).
-- facturation_chirurgiens et facturation_actes ne sont pas touchées : le facturé
-- par chirurgien reste calculé sur le mini PC (exports d'actes + CPA).
--
-- SÉMANTIQUE (décision drmoc du 2026-11-19 : un mois rejoué est remplacé, après
-- confirmation à l'écran)
--   • chaque associé × établissement importé est inséré, ou remplacé s'il existe ;
--   • la moitié FAC ne remplace que les colonnes « facturé », la moitié RED que les
--     colonnes « réglé » : un RED arrivé seul ne remet pas le facturé à zéro ;
--   • les associés × établissements du mois ABSENTS de l'import sont laissés tels
--     quels (un fichier ajouté plus tard n'efface pas les autres).
-- ============================================================

create or replace function public.facturation_importer_mois(p_lignes jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not (public.is_admin() or public.is_compta()) then
    raise exception 'Import réservé aux admins et au rôle Compta (2FA requise)' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lignes) is distinct from 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Aucune ligne à importer';
  end if;
  if (select count(distinct ((x->>'annee'), (x->>'mois'))) from jsonb_array_elements(p_lignes) x) <> 1 then
    raise exception 'Un import = un seul mois';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lignes) x
    where coalesce(x->>'associe', '') !~ '^[A-Z]{4}[0-9]{3}$'
       or coalesce(x->>'etablissement', '') !~ '^[A-Z]{3}$'
       or coalesce(x->>'fichier_fac', '') = '' and coalesce(x->>'fichier_red', '') = ''
  ) then
    raise exception 'Ligne invalide (associé, établissement ou fichier manquant)';
  end if;

  insert into public.facturation_mensuelle as f (
    annee, mois, associe, etablissement,
    facture_total, facture_dh, facture_amo, facture_amc, facture_pat,
    regle_total, regle_conv, regle_dh, redevance_ttc,
    nb_lignes_fac, nb_lignes_red, fichier_fac, fichier_red, importe_le
  )
  select
    r.annee, r.mois, r.associe, r.etablissement,
    coalesce(r.facture_total, 0), coalesce(r.facture_dh, 0), coalesce(r.facture_amo, 0), coalesce(r.facture_amc, 0), coalesce(r.facture_pat, 0),
    coalesce(r.regle_total, 0), coalesce(r.regle_conv, 0), coalesce(r.regle_dh, 0), coalesce(r.redevance_ttc, 0),
    coalesce(r.nb_lignes_fac, 0), coalesce(r.nb_lignes_red, 0), coalesce(r.fichier_fac, ''), coalesce(r.fichier_red, ''), now()
  from jsonb_to_recordset(p_lignes) as r(
    annee integer, mois integer, associe text, etablissement text,
    facture_total numeric, facture_dh numeric, facture_amo numeric, facture_amc numeric, facture_pat numeric,
    regle_total numeric, regle_conv numeric, regle_dh numeric, redevance_ttc numeric,
    nb_lignes_fac integer, nb_lignes_red integer, fichier_fac text, fichier_red text
  )
  on conflict (annee, mois, associe, etablissement) do update set
    facture_total = case when excluded.fichier_fac <> '' then excluded.facture_total else f.facture_total end,
    facture_dh    = case when excluded.fichier_fac <> '' then excluded.facture_dh    else f.facture_dh    end,
    facture_amo   = case when excluded.fichier_fac <> '' then excluded.facture_amo   else f.facture_amo   end,
    facture_amc   = case when excluded.fichier_fac <> '' then excluded.facture_amc   else f.facture_amc   end,
    facture_pat   = case when excluded.fichier_fac <> '' then excluded.facture_pat   else f.facture_pat   end,
    nb_lignes_fac = case when excluded.fichier_fac <> '' then excluded.nb_lignes_fac else f.nb_lignes_fac end,
    fichier_fac   = case when excluded.fichier_fac <> '' then excluded.fichier_fac   else f.fichier_fac   end,
    regle_total   = case when excluded.fichier_red <> '' then excluded.regle_total   else f.regle_total   end,
    regle_conv    = case when excluded.fichier_red <> '' then excluded.regle_conv    else f.regle_conv    end,
    regle_dh      = case when excluded.fichier_red <> '' then excluded.regle_dh      else f.regle_dh      end,
    redevance_ttc = case when excluded.fichier_red <> '' then excluded.redevance_ttc else f.redevance_ttc end,
    nb_lignes_red = case when excluded.fichier_red <> '' then excluded.nb_lignes_red else f.nb_lignes_red end,
    fichier_red   = case when excluded.fichier_red <> '' then excluded.fichier_red   else f.fichier_red   end,
    importe_le    = now();

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all    on function public.facturation_importer_mois(jsonb) from public, anon, authenticated;
grant execute on function public.facturation_importer_mois(jsonb) to authenticated;
