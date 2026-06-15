// ============================================================
// objectifsApi.js — objectifs annuels par associé, accès Supabase.
// Lecture pour tout authenticated ; écriture réservée au faiseur (RLS).
// (cf. supabase/planning_objectifs.sql)
// ============================================================
import { supabase } from '../lib/supabase'
import { normaliserObjectifs } from './objectifs'

export async function chargerObjectifs(annee) {
  const { data, error } = await supabase
    .from('planning_objectifs')
    .select('data')
    .eq('annee', annee)
    .maybeSingle()
  if (error) throw error
  return normaliserObjectifs(data?.data)
}

export async function sauverObjectifs(annee, data, userId) {
  const { error } = await supabase
    .from('planning_objectifs')
    .upsert({ annee, data, created_by: userId }, { onConflict: 'annee' })
  if (error) throw error
}
