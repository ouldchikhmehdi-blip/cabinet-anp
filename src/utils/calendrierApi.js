// ============================================================
// calendrierApi.js — base brute du calendrier (Étape 0), accès Supabase.
// Lecture pour tout authenticated ; écriture réservée au faiseur (RLS).
// ============================================================
import { supabase } from '../lib/supabase'
import { listerSemaines, semainesVacancesScolaires } from './calendrier'

const JOUR_MS = 24 * 60 * 60 * 1000

// Récupère les semaines de vacances scolaires (zone C) depuis l'API officielle
// data.education.gouv.fr (jeu de données fr-en-calendrier-scolaire), pour une
// année civile. Croise les deux années scolaires qui la chevauchent.
// → number[] de numéros de semaine ISO. Lève une erreur si l'API échoue.
export async function recupererVacancesScolairesZoneC(annee) {
  const where = `zones="Zone C" and annee_scolaire in ("${annee - 1}-${annee}","${annee}-${annee + 1}")`
  const url =
    'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records'
    + `?where=${encodeURIComponent(where)}&limit=100&select=description,start_date,end_date`

  const res = await fetch(url)
  if (!res.ok) throw new Error('API calendrier scolaire indisponible')
  const json = await res.json()

  // Garder uniquement les vraies vacances (exclut « Pont de l'Ascension », etc.)
  const periodes = (json.results ?? [])
    .filter(r => /^vacances/i.test(r.description ?? ''))
    .map(r => ({ debut: new Date(r.start_date).getTime(), fin: new Date(r.end_date).getTime() }))

  // Une semaine ISO est « vacances » si son jeudi tombe dans une période
  // (règle du jeudi : évite de marquer les semaines de bord école/retour).
  const weeks = []
  for (const s of listerSemaines(annee)) {
    const jeudi = s.lundi.getTime() + 3 * JOUR_MS
    if (periodes.some(p => jeudi >= p.debut && jeudi <= p.fin)) weeks.push(s.num)
  }
  return weeks
}

// Base par défaut calculée (non stockée tant que le faiseur n'enregistre pas).
// Défaut jeudi = Garde (on est plus souvent de garde le jeudi) ; samedi=A/dimanche=G (§3).
export function calendrierVide(annee) {
  const semaines = {}
  for (const s of listerSemaines(annee)) {
    semaines[s.num] = { jeu: 'G', ven: 'A', sam: 'A', dim: 'G' }
  }
  return { semaines, vacancesScolaires: semainesVacancesScolaires(annee) }
}

// Fusionne un data stocké (potentiellement partiel) avec la base par défaut.
// (Le statut des jours fériés n'est plus stocké : il découle du jour où ils tombent.)
export function normaliserCalendrier(annee, data) {
  const base = calendrierVide(annee)
  return {
    semaines: { ...base.semaines, ...(data?.semaines ?? {}) },
    vacancesScolaires: data?.vacancesScolaires ?? base.vacancesScolaires,
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
