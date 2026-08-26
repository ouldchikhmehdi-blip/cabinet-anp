// ============================================================
// iadeRemplaApi.js — accès Supabase des remplaçants IADE.
//
// Qui peut quoi est décidé par la RLS (supabase/iade_remplacements.sql) :
// tout le monde lit, seule la gestion IADE écrit. `cree_par` / `maj_par` sont
// posés par un trigger — le client n'a pas à être cru là-dessus.
//
// Aucune suppression en cascade, aucun mouvement irréversible : cette partie
// bouge sans arrêt (un remplaçant se décommande, un congé est annulé), tout doit
// pouvoir se défaire d'un clic.
// ============================================================
import { supabase } from '../lib/supabase'

const CHAMPS = 'id, jour, rang, nom, statut, note, maj_le'

export async function chargerRemplacements(annee) {
  const { data, error } = await supabase
    .from('iade_remplacements')
    .select(CHAMPS)
    .gte('jour', `${annee}-01-01`)
    .lte('jour', `${annee}-12-31`)
    .order('jour')
    .order('rang')
  if (error) throw error
  return data ?? []
}

// Les remplaçants réellement trouvés sur une période — ce que le planning affiche.
export async function chargerRemplacantsPourvus(debut, fin) {
  const { data, error } = await supabase
    .from('iade_remplacements')
    .select('jour, rang, nom')
    .eq('statut', 'pourvu')
    .gte('jour', debut)
    .lte('jour', fin)
    .order('jour')
    .order('rang')
  if (error) throw error
  return data ?? []
}

// Ouvre des besoins : une ligne par (jour, rang). Un jour déjà servi au même rang
// est ignoré plutôt que de faire échouer tout le lot (index unique côté base).
export async function ouvrirBesoins(lignes) {
  if (lignes.length === 0) return []
  const { data, error } = await supabase
    .from('iade_remplacements')
    .upsert(lignes.map(l => ({ jour: l.jour, rang: l.rang })), {
      onConflict: 'jour,rang', ignoreDuplicates: true,
    })
    .select(CHAMPS)
  if (error) throw error
  return data ?? []
}

// Nom, note, statut : tout se corrige, dans les deux sens.
export async function majBesoin(id, champs) {
  const { data, error } = await supabase
    .from('iade_remplacements')
    .update(champs)
    .eq('id', id)
    .select(CHAMPS)
    .single()
  if (error) throw error
  return data
}

// Dévalider conserve le nom : la même personne revient souvent, la retaper à
// chaque hésitation serait une punition (cf. le SQL).
export function devaliderBesoin(id) {
  return majBesoin(id, { statut: 'recherche' })
}

export function validerBesoin(id, nom) {
  return majBesoin(id, { statut: 'pourvu', nom: nom.trim() })
}

export async function supprimerBesoins(ids) {
  if (ids.length === 0) return
  const { error } = await supabase.from('iade_remplacements').delete().in('id', ids)
  if (error) throw error
}
