// ============================================================
// tramesApi.js — catalogue annuel des semaines type, accès Supabase.
// Lecture pour tout authenticated ; écriture réservée au faiseur (RLS).
// (cf. supabase/planning_trames.sql)
// ============================================================
import { supabase } from '../lib/supabase'
import { normaliserTrames } from './trames'

export async function chargerTrames(annee) {
  const { data, error } = await supabase
    .from('planning_trames')
    .select('data')
    .eq('annee', annee)
    .maybeSingle()
  if (error) throw error
  return normaliserTrames(data?.data)
}

export async function sauverTrames(annee, data, userId) {
  const { error } = await supabase
    .from('planning_trames')
    .upsert({ annee, data, created_by: userId }, { onConflict: 'annee' })
  if (error) throw error
}
