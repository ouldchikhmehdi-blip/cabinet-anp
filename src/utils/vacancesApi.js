// ============================================================
// vacancesApi.js — vacances (associés en congé par semaine) par année, accès Supabase.
// Lecture pour tout authenticated ; écriture réservée au faiseur (RLS).
// (cf. supabase/planning_vacances.sql)
// ============================================================
import { supabase } from '../lib/supabase'
import { normaliserVacances } from './vacances'

export async function chargerVacances(annee) {
  const { data, error } = await supabase
    .from('planning_vacances')
    .select('data')
    .eq('annee', annee)
    .maybeSingle()
  if (error) throw error
  return normaliserVacances(data?.data)
}

export async function sauverVacances(annee, data, userId) {
  const { error } = await supabase
    .from('planning_vacances')
    .upsert({ annee, data, created_by: userId }, { onConflict: 'annee' })
  if (error) throw error
}
