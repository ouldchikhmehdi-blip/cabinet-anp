// ============================================================
// agendaEvenementsApi.js — événements d'agenda précalculés par tiers validé (table planning_agenda_evenements).
// Écriture réservée au faiseur (à la validation / dévalidation d'un recueil) ; lecture pour tout authenticated.
// (cf. supabase/planning_agenda_evenements.sql)
// ============================================================
import { supabase } from '../lib/supabase'

// Enregistre/écrase les événements d'un tiers (par associé) au moment de la validation.
export async function sauverEvenementsTiers(annee, recueilId, data, userId) {
  const { error } = await supabase
    .from('planning_agenda_evenements')
    .upsert({ annee, recueil_id: recueilId, data, created_by: userId }, { onConflict: 'annee,recueil_id' })
  if (error) throw error
}

// Supprime les événements d'un tiers (à la dévalidation : il ne doit plus être synchronisé).
export async function supprimerEvenementsTiers(annee, recueilId) {
  const { error } = await supabase
    .from('planning_agenda_evenements')
    .delete()
    .eq('annee', annee)
    .eq('recueil_id', recueilId)
  if (error) throw error
}

// Liste les tiers validés ayant des événements (pour la page « Mon agenda »).
export async function listerEvenementsTiers() {
  const { data, error } = await supabase
    .from('planning_agenda_evenements')
    .select('annee, recueil_id, data')
  if (error) throw error
  return data ?? []
}
