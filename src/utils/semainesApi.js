// ============================================================
// semainesApi.js — trame appliquée à chaque semaine (étape « En semaine »), par année, Supabase.
// Lecture pour tout authenticated ; écriture réservée au faiseur (RLS).
// (cf. supabase/planning_semaines.sql)
// ============================================================
import { supabase } from '../lib/supabase'
import { normaliserSemaines } from './semaines'

export async function chargerSemaines(annee) {
  const { data, error } = await supabase
    .from('planning_semaines')
    .select('data')
    .eq('annee', annee)
    .maybeSingle()
  if (error) throw error
  return normaliserSemaines(data?.data)
}

export async function sauverSemaines(annee, data, userId) {
  const { error } = await supabase
    .from('planning_semaines')
    .upsert({ annee, data, created_by: userId }, { onConflict: 'annee' })
  if (error) throw error
}
