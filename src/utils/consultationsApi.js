// ============================================================
// consultationsApi.js — persistance partagée des Consultations (table planning_consultations,
// ligne singleton id=1). Lecture pour tout authenticated ; écriture réservée au faiseur (RLS).
// Rend les données de consultation partagées entre machines (le localStorage n'était que local).
// (cf. supabase/planning_consultations.sql)
// ============================================================
import { supabase } from '../lib/supabase'

// Charge le store partagé → { data, regles } ou null si la ligne n'existe pas encore.
export async function chargerConsultations() {
  const { data, error } = await supabase
    .from('planning_consultations')
    .select('data, regles')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  return data
}

// Remplace le store partagé (upsert de la ligne unique). `data` = { global, teleconsultations,
// specialites } ; `regles` = règles d'import utilisateur.
export async function sauverConsultations(data, regles, userId) {
  const { error } = await supabase
    .from('planning_consultations')
    .upsert({ id: 1, data, regles, created_by: userId }, { onConflict: 'id' })
  if (error) throw error
}
