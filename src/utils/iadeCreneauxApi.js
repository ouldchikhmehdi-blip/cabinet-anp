// ============================================================
// iadeCreneauxApi.js — accès Supabase des créneaux en moins.
//
// Qui peut quoi est décidé par la RLS (supabase/iade_creneaux_fermes.sql) :
// tout le monde lit — l'information figure dans le planning que l'équipe
// consulte —, seule la gestion IADE écrit. `cree_par` / `maj_par` et le nettoyage
// des espaces sont posés par un trigger.
// ============================================================
import { supabase } from '../lib/supabase'

const CHAMPS = 'id, jour, moment, salle, absent, note, maj_le'

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
    .select('jour, moment, salle, absent')
    .gte('jour', debut)
    .lte('jour', fin)
    .order('jour')
  if (error) throw error
  return data ?? []
}

// Un opérateur annonce ses absences d'un bloc : on pose tous ses jours en un
// seul aller-retour, même salle, même moment, même nom. Insertion atomique —
// si une ligne passe mal, aucune n'est écrite et la liste reste lisible.
export async function ajouterCreneaux(jours, { moment, salle, absent, note }) {
  const lignes = jours.map(jour => ({
    jour, moment, salle, absent: absent || null, note: note || null,
  }))
  const { data, error } = await supabase
    .from('iade_creneaux_fermes')
    .insert(lignes)
    .select(CHAMPS)
  if (error) throw error
  return data ?? []
}

// Tout se corrige : la salle, le moment, le jour, qui manque.
export async function modifierCreneau(id, champs) {
  const { data, error } = await supabase
    .from('iade_creneaux_fermes')
    .update(champs)
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
