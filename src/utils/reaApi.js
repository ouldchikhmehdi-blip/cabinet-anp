// ============================================================
// reaApi.js — semaines de réanimation (un associé par semaine) par année, accès Supabase.
// Lecture pour tout authenticated ; écriture réservée au faiseur (RLS).
// (cf. supabase/planning_rea.sql)
// ============================================================
import { supabase } from '../lib/supabase'
import { normaliserRea } from './rea'

export async function chargerRea(annee) {
  const { data, error } = await supabase
    .from('planning_rea')
    .select('data')
    .eq('annee', annee)
    .maybeSingle()
  if (error) throw error
  return normaliserRea(data?.data)
}

export async function sauverRea(annee, data, userId) {
  const { error } = await supabase
    .from('planning_rea')
    .upsert({ annee, data, created_by: userId }, { onConflict: 'annee' })
  if (error) throw error
}
