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

// ── Cases modifiées depuis le dashboard ──────────────────────────────────────
// Table `iade_planning_modifs` (cf. supabase/iade_planning_modifs.sql) : tout le
// monde lit, la gestion IADE écrit. Le miroir `iade_planning`, lui, reste en
// lecture seule — ces lignes s'y superposent (`appliquerModifs`).

const CHAMPS_MODIF = 'id, jour, iade, kind, matin, apres_midi, poste, avant, fichier, statut, lot, maj_le'

export async function chargerModifsPeriode(debut, fin) {
  const { data, error } = await supabase
    .from('iade_planning_modifs')
    .select(CHAMPS_MODIF)
    .gte('jour', debut).lte('jour', fin)
    .order('jour', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Enregistre un lot de cases modifiées. `lignes` = [{ jour, iade, kind, matin,
// apres_midi, poste, avant, fichier }]. Une case déjà modifiée est remplacée
// (unicité jour × IADE) ; le trigger conserve alors son `fichier` d'origine.
// Le lot sert à l'e-mail : un enregistrement = un message par agent concerné.
export async function enregistrerModifs(lignes) {
  if (lignes.length === 0) return { lot: null, lignes: [] }
  const lot = crypto.randomUUID()
  const { data, error } = await supabase
    .from('iade_planning_modifs')
    .upsert(lignes.map(l => ({ ...l, lot, statut: 'active' })), { onConflict: 'jour,iade' })
    .select(CHAMPS_MODIF)
  if (error) throw error
  return { lot, lignes: data ?? [] }
}

// « Revenir au fichier » : la modification passe 'annulee'. Elle n'est pas
// supprimée d'ici — la chaîne du mini PC la purge une fois le fichier republié,
// et l'e-mail de retour a besoin de la relire.
export async function annulerModifs(ids) {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('iade_planning_modifs')
    .update({ statut: 'annulee' })
    .in('id', ids)
    .select(CHAMPS_MODIF)
  if (error) throw error
  return data ?? []
}

// Prévient par e-mail les agents dont une case a changé (cf. api/iade-notify.js,
// types 'planning_modif' et 'planning_retour'). Contrairement aux autres
// notifications du module, celle-ci RENVOIE ce qui s'est passé : la gestion doit
// savoir qui a été prévenu, et pour quelle colonne personne n'a pu l'être.
//   → { ok, prevenus: ['Cathy'], sansCompte: ['Rempla'], sansEnvoi: ['Nico'] }
export async function notifierPlanning({ type, lot, ids }) {
  const echec = { ok: false, prevenus: [], sansCompte: [], sansEnvoi: [] }
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const jwt = session?.access_token
    if (!jwt) return echec
    const r = await fetch('/api/iade-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
      body: JSON.stringify({ type, lot, ids }),
    })
    if (!r.ok) return echec
    const corps = await r.json()
    return {
      ok: corps.ok === true,
      prevenus: corps.prevenus ?? [],
      sansCompte: corps.sansCompte ?? [],
      sansEnvoi: corps.sansEnvoi ?? [],
    }
  } catch (err) {
    console.error('Notification planning (non bloquante):', err)
    return echec
  }
}
