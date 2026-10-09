// ============================================================
// iadeCompteurCongesApi.js — accès Supabase au compteur de congés (bloc
// « CONGES » du bulletin de paie). Une ligne = UN AGENT, écrasée à chaque
// nouveau bulletin.
//
// Qui peut quoi est décidé par la RLS, pas par ce fichier :
//   • l'agent LIT sa propre ligne (est_actif()) ;
//   • la gestion, le faiseur, l'admin et l'agent IA lisent tout et écrivent
//     (peut_gerer_iade()).
//
// Logique pure  : iadeCompteurConges.js
// Schéma + RLS  : supabase/iade_compteur_conges.sql
// ============================================================
import { supabase } from '../lib/supabase'

const CHAMPS = 'user_id, mois_ref, encours_acquis, encours_pris, n_acquis, n_pris, n1_acquis, n1_pris, maj_par, maj_le'

// Le compteur d'un agent → la ligne, ou null si aucun bulletin n'a été recopié.
export async function chargerMonCompteurConges(userId) {
  if (!userId) return null
  const { data, error } = await supabase
    .from('iade_compteur_conges')
    .select(CHAMPS)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

// Tous les compteurs — la RLS ne rend que ce que le compte a le droit de voir.
export async function chargerCompteursConges() {
  const { data, error } = await supabase
    .from('iade_compteur_conges')
    .select(CHAMPS)
  if (error) throw error
  return data ?? []
}

// Enregistre les agents touchés. `lignes` : [{ user_id, mois_ref, encours_acquis… }]
// avec des nombres ou null — jamais de chaînes (cf. versColonnes()).
// `maj_par` / `maj_le` sont posés par le trigger : le client n'est pas cru là-dessus.
export async function enregistrerCompteursConges(lignes) {
  if (!lignes || lignes.length === 0) return []
  const { data, error } = await supabase
    .from('iade_compteur_conges')
    .upsert(lignes, { onConflict: 'user_id' })
    .select(CHAMPS)
  if (error) throw error
  return data ?? []
}

// Un compteur vidé à l'écran s'efface : la contrainte `non_vide` refuse une
// ligne de blancs, et c'est l'ABSENCE de ligne qui dit « aucun bulletin recopié ».
export async function supprimerCompteursConges(userIds) {
  if (!userIds || userIds.length === 0) return
  const { error } = await supabase
    .from('iade_compteur_conges')
    .delete()
    .in('user_id', userIds)
  if (error) throw error
}
