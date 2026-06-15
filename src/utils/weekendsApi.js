// ============================================================
// weekendsApi.js — affectations week-end par année, accès Supabase.
// Lecture pour tout authenticated ; écriture réservée au faiseur (RLS).
// (cf. supabase/planning_weekends.sql)
// ============================================================
import { supabase } from '../lib/supabase'
import { normaliserWeekends } from './weekends'

export async function chargerWeekends(annee) {
  const { data, error } = await supabase
    .from('planning_weekends')
    .select('data')
    .eq('annee', annee)
    .maybeSingle()
  if (error) throw error
  return normaliserWeekends(data?.data)
}

export async function sauverWeekends(annee, data, userId) {
  const { error } = await supabase
    .from('planning_weekends')
    .upsert({ annee, data, created_by: userId }, { onConflict: 'annee' })
  if (error) throw error
}
