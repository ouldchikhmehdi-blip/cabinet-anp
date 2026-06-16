// ============================================================
// noelApi.js — période de Noël (grille des ~15 jours fournie telle quelle) par année, accès Supabase.
// Lecture pour tout authenticated ; écriture réservée au faiseur (RLS).
// (cf. supabase/planning_noel.sql)
// ============================================================
import { supabase } from '../lib/supabase'
import { normaliserNoel } from './noel'

export async function chargerNoel(annee) {
  const { data, error } = await supabase
    .from('planning_noel')
    .select('data')
    .eq('annee', annee)
    .maybeSingle()
  if (error) throw error
  return normaliserNoel(data?.data)
}

export async function sauverNoel(annee, data, userId) {
  const { error } = await supabase
    .from('planning_noel')
    .upsert({ annee, data, created_by: userId }, { onConflict: 'annee' })
  if (error) throw error
}
