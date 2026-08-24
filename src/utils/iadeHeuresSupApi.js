// ============================================================
// iadeHeuresSupApi.js — accès Supabase des heures supplémentaires IADE.
//
// Une ligne = un jour, un nombre d'heures entier (cf. iadeHeuresSup.js et
// supabase/iade_heures_sup.sql).
//
// Qui peut quoi est décidé par la RLS, pas par ce fichier :
//   • l'agent déclare SES heures et désigne le MAR ; il peut corriger ou retirer
//     tant que personne n'a décidé ;
//   • le MAR désigné valide ou refuse — et rien d'autre (le trigger l'empêche de
//     réécrire le nombre d'heures) ;
//   • la gestion IADE lit tout, ajoute des heures déjà validées, et peut trancher
//     en secours si le MAR désigné ne répond pas ;
//   • un associé qui n'est pas gestionnaire ne peut pas lire les profils des
//     agents : il passe par la RPC iade_hs_pour_mar(), qui joint les noms des
//     seules lignes qui lui sont adressées.
// ============================================================
import { supabase } from '../lib/supabase'

const CHAMPS = 'id, user_id, jour, heures, origine, mar_id, commentaire, statut, motif_reponse, decide_par, decide_le, created_at'

// ── Côté agent ───────────────────────────────────────────────────────────────

export async function chargerMesHeuresSup(userId) {
  const { data, error } = await supabase
    .from('iade_heures_sup')
    .select(CHAMPS)
    .eq('user_id', userId)
    .order('jour', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Liste des MAR (id + nom) où l'agent désigne qui lui a demandé les heures.
// RPC : profiles_select n'autorise pas un IADE à lire les comptes des associés.
export async function chargerMars() {
  const { data, error } = await supabase.rpc('iade_mars')
  if (error) throw error
  return data ?? []
}

// Déclare des heures. `statut` et l'horodatage sont posés par la base.
export async function declarerHeures({ userId, jour, heures, marId, commentaire }) {
  const { data, error } = await supabase
    .from('iade_heures_sup')
    .insert({
      user_id:     userId,
      jour,
      heures:      Number(heures),
      origine:     'iade',
      mar_id:      marId,
      commentaire: commentaire?.trim() || null,
    })
    .select(CHAMPS)
    .single()
  if (error) throw error
  return data
}

// Corrige une déclaration encore en attente (RLS : l'agent, et seulement lui).
export async function modifierDeclaration(id, { jour, heures, marId, commentaire }) {
  const { data, error } = await supabase
    .from('iade_heures_sup')
    .update({
      jour,
      heures:      Number(heures),
      mar_id:      marId,
      commentaire: commentaire?.trim() || null,
    })
    .eq('id', id)
    .select(CHAMPS)
    .single()
  if (error) throw error
  return data
}

export async function supprimerDeclaration(id) {
  const { error } = await supabase.from('iade_heures_sup').delete().eq('id', id)
  if (error) throw error
}

// ── Côté MAR désigné ─────────────────────────────────────────────────────────

// Ce qu'un MAR doit valider, et son historique de l'année (avec le nom de l'agent).
export async function chargerHeuresSupPourMar(annee) {
  const { data, error } = await supabase.rpc('iade_hs_pour_mar', { p_annee: annee })
  if (error) throw error
  return data ?? []
}

// ── Côté gestion (gestionnaire IADE · faiseur de planning · admin) ───────────

export async function chargerHeuresSupAnnee(annee) {
  const { data, error } = await supabase
    .from('iade_heures_sup')
    .select(CHAMPS)
    .gte('jour', `${annee}-01-01`)
    .lte('jour', `${annee}-12-31`)
    .order('jour', { ascending: false })
  if (error) throw error
  return data ?? []
}

// La gestion ajoute des heures à un agent : la base les crée DÉJÀ VALIDÉES
// (l'agent est informé, il n'a rien à approuver).
export async function ajouterHeuresGestion({ userId, jour, heures, commentaire }) {
  const { data, error } = await supabase
    .from('iade_heures_sup')
    .insert({
      user_id:     userId,
      jour,
      heures:      Number(heures),
      origine:     'gestion',
      commentaire: commentaire?.trim() || null,
    })
    .select(CHAMPS)
    .single()
  if (error) throw error
  return data
}

// ── Décision (MAR désigné ou gestion en secours) ─────────────────────────────

// decide_par / decide_le sont posés par la base, jamais par le client.
// Une validation efface le motif d'un éventuel refus précédent.
export async function deciderHeures(ids, statut, motif) {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('iade_heures_sup')
    .update({ statut, motif_reponse: statut === 'refusee' ? (motif?.trim() || null) : null })
    .in('id', ids)
    .select(CHAMPS)
  if (error) throw error
  return data ?? []
}

// ── Notifications e-mail (best-effort) ───────────────────────────────────────
// Ne bloque JAMAIS l'action : toute erreur est avalée (cf. api/iade-hs-notify.js).
//   type 'declaration' → { ids } : prévient le MAR désigné
//   type 'decision'    → { ids } : prévient l'agent
//   type 'ajout'       → { ids } : prévient l'agent des heures ajoutées par la gestion
export async function notifierHeuresSup({ type, ids }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const jwt = session?.access_token
    if (!jwt) return
    await fetch('/api/iade-hs-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
      body: JSON.stringify({ type, ids }),
    })
  } catch (err) {
    console.error('Notification heures sup (non bloquante):', err)
  }
}
