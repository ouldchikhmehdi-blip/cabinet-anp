// ============================================================
// calendrierApi.js — base brute du calendrier (Étape 0), accès Supabase.
// Lecture pour tout authenticated ; écriture réservée au faiseur (RLS).
// ============================================================
import { supabase } from '../lib/supabase'
import { listerSemaines, joursFeriesFR, semainesVacancesScolaires } from './calendrier'

// Base par défaut calculée (non stockée tant que le faiseur n'enregistre pas).
export function calendrierVide(annee) {
  const semaines = {}
  for (const s of listerSemaines(annee)) {
    semaines[s.num] = { jeu: 'A', ven: 'A', sam: 'A', dim: 'G' } // défauts §3/§12
  }
  const feries = {}
  for (const f of joursFeriesFR(annee)) feries[f.iso] = 'A' // défaut astreinte
  return { semaines, vacancesScolaires: semainesVacancesScolaires(annee), feries }
}

// Fusionne un data stocké (potentiellement partiel) avec la base par défaut.
export function normaliserCalendrier(annee, data) {
  const base = calendrierVide(annee)
  return {
    semaines: { ...base.semaines, ...(data?.semaines ?? {}) },
    vacancesScolaires: data?.vacancesScolaires ?? base.vacancesScolaires,
    feries: { ...base.feries, ...(data?.feries ?? {}) },
  }
}

export async function chargerCalendrier(annee) {
  const { data, error } = await supabase
    .from('planning_calendrier')
    .select('data')
    .eq('annee', annee)
    .maybeSingle()
  if (error) throw error
  return normaliserCalendrier(annee, data?.data)
}

export async function sauverCalendrier(annee, data, userId) {
  const { error } = await supabase
    .from('planning_calendrier')
    .upsert({ annee, data, created_by: userId }, { onConflict: 'annee' })
  if (error) throw error
}
