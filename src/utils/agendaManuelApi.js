// ============================================================
// agendaManuelApi.js — import MANUEL d'agenda de l'associé courant (table planning_agenda_manuel,
// RLS « sa propre ligne »). Alimente le flux iCal `/api/agenda?token=…` quand planning_agenda.source
// = 'manuel'. `data` = [{ d, fin, titre }] (événements journée entière, fin = DTEND exclusif).
// ============================================================
import { supabase } from '../lib/supabase'

// Récupère l'import manuel de l'associé courant → { data:[{d,fin,titre}], updated_at } ou null.
export async function obtenirImportManuel(userId) {
  const { data, error } = await supabase
    .from('planning_agenda_manuel')
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

// Remplace TOUT l'import manuel de l'associé (upsert sur user_id). Les jours retirés disparaissent
// de l'agenda abonné au prochain rafraîchissement (UID absents → purgés côté client iCal).
export async function sauverImportManuel(userId, events) {
  const { error } = await supabase
    .from('planning_agenda_manuel')
    .upsert({ user_id: userId, data: events }, { onConflict: 'user_id' })
  if (error) throw error
}
