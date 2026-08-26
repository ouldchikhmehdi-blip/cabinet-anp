// ============================================================
// iadeAgendaApi.js — abonnement iCal de l'IADE courant (table iade_agenda, RLS « sa propre
// ligne »). Alimente le flux public /api/agenda-iade?token=…. Les événements sont CUMULÉS
// mois après mois : recoller un mois déjà présent le met à jour, les autres restent.
// ============================================================
import { supabase } from '../lib/supabase'

// Ligne d'abonnement de l'utilisateur courant → { token, actif, colonne, data }
// ou null (pas encore créée).
export async function chargerAbonnementIade(userId) {
  const { data, error } = await supabase
    .from('iade_agenda')
    .select('token, actif, colonne, data, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

// L'agent désigne SA colonne dans le planning publié : à partir de là, le flux
// iCal se recalcule depuis le planning à chaque appel (cf. api/agenda-iade.js).
// Plus rien à coller, et la republication nocturne se propage toute seule.
export async function definirColonneIade(userId, colonne) {
  const { data, error } = await supabase
    .from('iade_agenda')
    .upsert({ user_id: userId, colonne, actif: true }, { onConflict: 'user_id' })
    .select('token, actif, colonne, data')
    .single()
  if (error) throw error
  return data
}

// Revenir aux mois collés : la colonne est effacée, `data` redevient la source.
export async function oublierColonneIade(userId) {
  const { data, error } = await supabase
    .from('iade_agenda')
    .update({ colonne: null })
    .eq('user_id', userId)
    .select('token, actif, colonne, data')
    .single()
  if (error) throw error
  return data
}

// Active la synchro pour `userId` en fusionnant les événements du mois `moisPrefixe`
// (YYYYMM) : on retire les événements existants de ce mois, on ajoute les nouveaux, on
// (ré)active. Renvoie la ligne à jour (dont le token). L'insert crée le token (défaut SQL).
export async function activerSyncIade(userId, moisPrefixe, nouveauxEvenements) {
  const existant = await chargerAbonnementIade(userId)
  const ancien = Array.isArray(existant?.data) ? existant.data : []
  const conserves = moisPrefixe
    ? ancien.filter(e => !String(e?.d || '').startsWith(moisPrefixe))
    : ancien
  const fusion = [...conserves, ...nouveauxEvenements]
  const { data, error } = await supabase
    .from('iade_agenda')
    .upsert({ user_id: userId, data: fusion, actif: true }, { onConflict: 'user_id' })
    .select('token, actif, data')
    .single()
  if (error) throw error
  return data
}

// Désactive (agenda vidé au prochain rafraîchissement) sans perdre les données.
export async function desactiverSyncIade(userId) {
  const { error } = await supabase
    .from('iade_agenda')
    .update({ actif: false })
    .eq('user_id', userId)
  if (error) throw error
}

// Réactive la synchro (réaffiche les données déjà stockées).
export async function reactiverSyncIade(userId) {
  const { error } = await supabase
    .from('iade_agenda')
    .update({ actif: true })
    .eq('user_id', userId)
  if (error) throw error
}

// Vide complètement l'agenda (données + désactivation).
export async function viderSyncIade(userId) {
  const { error } = await supabase
    .from('iade_agenda')
    .update({ data: [], actif: false })
    .eq('user_id', userId)
  if (error) throw error
}
