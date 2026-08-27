// ============================================================
// iadeCongesApi.js — accès Supabase des congés IADE.
//
// Une ligne = un jour posé (cf. iadeConges.js et supabase/iade_conges.sql).
//
// Qui peut quoi est décidé par la RLS, pas par ce fichier :
//   • l'IADE lit/écrit ses propres jours tant qu'ils sont « en attente » ;
//   • la gestion IADE, le faiseur de planning et l'admin lisent tout et décident ;
//   • le calendrier d'équipe passe par la RPC iade_calendrier() — elle n'expose
//     pas les motifs de refus et masque les jours refusés.
// ============================================================
import { supabase } from '../lib/supabase'

const CHAMPS = 'id, user_id, jour, type_conge, ferie, lot, statut, motif_reponse, decide_par, decide_le, created_at'

// ── Côté IADE ────────────────────────────────────────────────────────────────

// Tous les jours posés par un agent, du plus ancien au plus récent.
export async function chargerMesConges(userId) {
  const { data, error } = await supabase
    .from('iade_conges')
    .select(CHAMPS)
    .eq('user_id', userId)
    .order('jour', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Dépose une sélection de jours. `jours` = [{ jour, type, ferie }].
// Les jours envoyés ensemble partagent un `lot` : la gestion peut ainsi répondre
// à « la demande » d'un seul clic, sans perdre la décision jour par jour.
// `statut` n'est forcé qu'à la saisie directe par la gestion (l'agent, lui, ne
// peut créer que des jours « en attente » — trigger + RLS).
//
// `ferie` = le jour férié récupéré, obligatoire sur une récup et interdit
// ailleurs. La base le fait respecter (contraintes iade_conges_ferie_sur_recup
// et iade_conges_recup_precise) : un client bricolé ne peut pas glisser une
// récup anonyme dans la paie.
export async function poserJours({ userId, jours, statut = 'en_attente' }) {
  const lot = crypto.randomUUID()
  const lignes = jours.map(({ jour, type, ferie }) => ({
    user_id:    userId,
    jour,
    type_conge: type,
    ferie:      type === 'recup_ferie' ? (ferie ?? null) : null,
    lot,
    statut,
  }))

  const { data, error } = await supabase
    .from('iade_conges')
    .insert(lignes)
    .select(CHAMPS)
  if (error) throw error
  return data ?? []
}

// Retire des jours (l'agent : uniquement tant qu'ils sont en attente).
export async function supprimerJours(ids) {
  if (ids.length === 0) return
  const { error } = await supabase.from('iade_conges').delete().in('id', ids)
  if (error) throw error
}

// ── Côté gestion (gestionnaire IADE · faiseur de planning · admin) ───────────

// Tous les jours posés sur l'année, du plus ancien au plus récent.
export async function chargerDemandes(annee) {
  const { data, error } = await supabase
    .from('iade_conges')
    .select(CHAMPS)
    .gte('jour', `${annee}-01-01`)
    .lte('jour', `${annee}-12-31`)
    .order('jour', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Comptes IADE (nom affiché + statut du compte).
export async function chargerAgentsIade() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, nom_complet, status')
    .eq('is_iade', true)
    .order('nom_complet', { nullsFirst: false })
  if (error) throw error
  return (data ?? []).map(p => ({
    id:     p.id,
    nom:    p.nom_complet?.trim() || p.email.split('@')[0],
    email:  p.email,
    actif:  p.status === 'active',
  }))
}

// Valide ou refuse des jours. decide_par / decide_le sont posés par la base.
// Une validation efface le motif d'un éventuel refus précédent.
export async function deciderJours(ids, statut, motif) {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('iade_conges')
    .update({ statut, motif_reponse: statut === 'refusee' ? (motif?.trim() || null) : null })
    .in('id', ids)
    .select(CHAMPS)
  if (error) throw error
  return data ?? []
}

// ── Calendrier d'équipe (IADE et gestion) ────────────────────────────────────

// Jours demandés ou validés entre `debut` et `fin` (ISO 'YYYY-MM-DD').
export async function chargerCalendrierIade(debut, fin) {
  const { data, error } = await supabase.rpc('iade_calendrier', { p_debut: debut, p_fin: fin })
  if (error) throw error
  return data ?? []
}

// ── Notifications e-mail (best-effort) ───────────────────────────────────────
// Prévient par e-mail autour d'un mouvement de congé (cf. api/iade-notify.js
// et IADE.md § Notifications). Ne bloque JAMAIS l'action : toute erreur est avalée.
//   type 'pose'     → { lot } : prévient le(s) gestionnaire(s)
//   type 'retrait'  → { ids } : prévient le(s) gestionnaire(s) — À APPELER AVANT la suppression
//   type 'decision' → { ids } : prévient l'agent concerné
export async function notifierConges({ type, lot, ids }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const jwt = session?.access_token
    if (!jwt) return
    await fetch('/api/iade-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
      body: JSON.stringify({ type, lot, ids }),
    })
  } catch (err) {
    console.error('Notification congés (non bloquante):', err)
  }
}
