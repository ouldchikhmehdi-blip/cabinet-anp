// ============================================================
// iadeCreneauxApi.js — accès Supabase des créneaux en moins.
//
// Qui peut quoi est décidé par la RLS (supabase/iade_creneaux_fermes.sql) :
// tout le monde lit — l'information figure dans le planning que l'équipe
// consulte —, seule la gestion IADE écrit. `cree_par` / `maj_par` et le nettoyage
// des espaces sont posés par un trigger.
//
// La salle n'est pas nommée : `salle` ne porte que le libellé du bloc, et c'est
// l'opérateur (`absent`) qui identifie la ligne.
// ============================================================
import { supabase } from '../lib/supabase'
import { SALLE_PAR_SECTEUR } from './iadeCreneaux'

const CHAMPS = 'id, jour, moment, secteur, salle, absent, note, maj_le'

function normaliser({ secteur, moment, absent, note }) {
  return {
    secteur, moment,
    salle: SALLE_PAR_SECTEUR[secteur] ?? secteur,
    absent: absent || null,
    note: note || null,
  }
}

export async function chargerCreneaux(annee) {
  const { data, error } = await supabase
    .from('iade_creneaux_fermes')
    .select(CHAMPS)
    .gte('jour', `${annee}-01-01`)
    .lte('jour', `${annee}-12-31`)
    .order('jour')
  if (error) throw error
  return data ?? []
}

// Les créneaux d'une période — ce que la grille du planning affiche.
export async function chargerCreneauxPeriode(debut, fin) {
  const { data, error } = await supabase
    .from('iade_creneaux_fermes')
    .select('jour, moment, secteur, salle, absent')
    .gte('jour', debut)
    .lte('jour', fin)
    .order('jour')
  if (error) throw error
  return data ?? []
}

// Un opérateur annonce ses absences d'un bloc : on pose tous ses jours en un
// seul aller-retour, même bloc, même moment, même nom. Insertion atomique —
// si une ligne passe mal, aucune n'est écrite et la liste reste lisible.
export async function ajouterCreneaux(jours, saisie) {
  const commun = normaliser(saisie)
  const lignes = jours.map(jour => ({ jour, ...commun }))
  const { data, error } = await supabase
    .from('iade_creneaux_fermes')
    .insert(lignes)
    .select(CHAMPS)
  if (error) throw error
  return data ?? []
}

// Tout se corrige : le bloc, l'opérateur, le moment, le jour.
export async function modifierCreneau(id, { jour, ...reste }) {
  const { data, error } = await supabase
    .from('iade_creneaux_fermes')
    .update({ jour, ...normaliser(reste) })
    .eq('id', id)
    .select(CHAMPS)
    .single()
  if (error) throw error
  return data
}

export async function supprimerCreneau(id) {
  const { error } = await supabase.from('iade_creneaux_fermes').delete().eq('id', id)
  if (error) throw error
}
