// ============================================================
// iadeCongesApi.js — accès Supabase des congés IADE.
//
// Qui peut quoi est décidé par la RLS (supabase/iade_conges.sql), pas par ce fichier :
//   • l'IADE lit/écrit ses propres demandes tant qu'elles sont « en attente » ;
//   • la gestion IADE, le faiseur de planning et l'admin lisent tout et décident ;
//   • le calendrier d'équipe passe par la RPC iade_calendrier() — elle n'expose
//     ni commentaire ni motif de refus, et masque les demandes refusées.
// ============================================================
import { supabase } from '../lib/supabase'

const CHAMPS = 'id, user_id, date_debut, date_fin, type_conge, commentaire, statut, motif_reponse, decide_par, decide_le, created_at'

// ── Côté IADE ────────────────────────────────────────────────────────────────

// Demandes d'un agent, la plus récente en premier.
export async function chargerMesConges(userId) {
  const { data, error } = await supabase
    .from('iade_conges')
    .select(CHAMPS)
    .eq('user_id', userId)
    .order('date_debut', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Dépose une demande. `statut` n'est forcé qu'à la saisie directe par la gestion
// (l'agent, lui, ne peut créer qu'une demande « en attente » — trigger + RLS).
export async function creerDemande({ userId, dateDebut, dateFin, type, commentaire, statut = 'en_attente' }) {
  const { data, error } = await supabase
    .from('iade_conges')
    .insert({
      user_id:     userId,
      date_debut:  dateDebut,
      date_fin:    dateFin,
      type_conge:  type,
      commentaire: commentaire?.trim() || null,
      statut,
    })
    .select(CHAMPS)
    .single()
  if (error) throw error
  return data
}

// Retire une demande (l'agent : uniquement tant qu'elle est en attente).
export async function supprimerDemande(id) {
  const { error } = await supabase.from('iade_conges').delete().eq('id', id)
  if (error) throw error
}

// ── Côté gestion (gestionnaire IADE · faiseur de planning · admin) ───────────

// Toutes les demandes de l'année, la plus proche en premier.
export async function chargerDemandes(annee) {
  const { data, error } = await supabase
    .from('iade_conges')
    .select(CHAMPS)
    .lte('date_debut', `${annee}-12-31`)
    .gte('date_fin',   `${annee}-01-01`)
    .order('date_debut', { ascending: true })
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

// Valide ou refuse une demande. decide_par / decide_le sont posés par la base.
export async function deciderDemande(id, statut, motif) {
  const { data, error } = await supabase
    .from('iade_conges')
    .update({ statut, motif_reponse: motif?.trim() || null })
    .eq('id', id)
    .select(CHAMPS)
    .single()
  if (error) throw error
  return data
}

// ── Calendrier d'équipe (IADE et gestion) ────────────────────────────────────

// Absences demandées ou validées recouvrant [debut, fin] (ISO 'YYYY-MM-DD').
export async function chargerCalendrierIade(debut, fin) {
  const { data, error } = await supabase.rpc('iade_calendrier', { p_debut: debut, p_fin: fin })
  if (error) throw error
  return data ?? []
}
