// ============================================================
// iadePlanningApi.js — lecture du planning IADE publié depuis le mini PC.
//
// Tables `iade_planning`, `iade_planning_jour`, `iade_planning_maj`
// (cf. supabase/iade_planning.sql). Lecture seule pour tout le monde :
// aucune fonction d'écriture ici, et la RLS n'en autoriserait aucune.
// Qui peut lire est décidé par la RLS : agents IADE et associés (2FA).
// ============================================================
import { supabase } from '../lib/supabase'
import { bornesDuMois } from './iadePlanning'

const CHAMPS_CASE = 'jour, iade, rang, matin, apres_midi, poste, note'

// Le mois complet : une requête pour les cases, une pour les infos du jour.
export async function chargerMois(annee, mois) {
  const { debut, fin } = bornesDuMois(annee, mois)

  const [cases, jours] = await Promise.all([
    supabase.from('iade_planning').select(CHAMPS_CASE)
      .gte('jour', debut).lte('jour', fin)
      .order('jour', { ascending: true }).order('rang', { ascending: true }),
    supabase.from('iade_planning_jour').select('jour, vacances, remplacants')
      .gte('jour', debut).lte('jour', fin)
      .order('jour', { ascending: true }),
  ])
  if (cases.error) throw cases.error
  if (jours.error) throw jours.error
  return { cases: cases.data ?? [], jours: jours.data ?? [] }
}

// Les colonnes du planning publié, dans l'ordre du fichier — celles parmi
// lesquelles un agent reconnaît la sienne pour synchroniser son agenda.
// On lit UN mois plutôt que l'année : les colonnes y sont toutes, et c'est une
// requête sur trente lignes au lieu de plusieurs milliers.
export async function chargerColonnesPlanning(annee, mois) {
  const { debut, fin } = bornesDuMois(annee, mois)
  const { data, error } = await supabase
    .from('iade_planning')
    .select('iade, rang')
    .gte('jour', debut).lte('jour', fin)
  if (error) throw error

  const rangs = new Map()
  for (const c of data ?? []) {
    if (!rangs.has(c.iade) || c.rang < rangs.get(c.iade)) rangs.set(c.iade, c.rang)
  }
  return [...rangs.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'fr'))
    .map(([nom]) => nom)
}

// Date de la dernière publication : un planning figé par un cron en panne doit
// se voir à l'écran, pas se deviner.
export async function chargerDerniereMaj() {
  const { data, error } = await supabase
    .from('iade_planning_maj')
    .select('genere_le, annee')
    .maybeSingle()
  if (error) throw error
  return data ?? null
}
