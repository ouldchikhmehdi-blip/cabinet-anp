// ============================================================
// iadeBlocB.js — LA TRAME DU BLOC B : qui opère, quel jour, quelle demi-journée,
// dans quelle salle d'endoscopie.
//
// À quoi elle sert : quand la gestion annonce l'absence d'un opérateur un jour
// donné, le moment (matin / après-midi) est DÉJÀ rempli, et le nombre de salles
// qui sautent est juste. On ne demande plus ce que la trame sait.
//
// ⚠️ LE MOMENT N'APPARTIENT PAS À L'OPÉRATEUR, MAIS AU COUPLE (opérateur, jour
// de la semaine). Espérance opère le lundi et le mardi MATIN, mais le jeudi
// APRÈS-MIDI ; Suma l'après-midi en début de semaine et le vendredi matin. Neuf
// des quatorze opérateurs changent ainsi de demi-journée selon le jour. Retenir
// « Espérance = matin » se tromperait un jeudi sur deux, et se tromperait EN
// SILENCE — personne ne relit un champ déjà rempli.
//
// ⚠️ UN OPÉRATEUR PEUT TENIR DEUX SALLES EN MÊME TEMPS. Fedkovic est en salle 2
// ET en salle 4 le mercredi matin. Son absence ce matin-là fait donc sauter
// DEUX salles, pas une. Le compte du planning en tient compte (cf. `bilanBlocB`).
//
// Source : la trame « sept-26 » transmise par Mehdi le 2026-09-03, relue avec lui.
// Le « Fibro Bronchique » (8h-9h30, salle 4) n'y figure pas : il ne mobilise pas
// de salle d'endoscopie au sens du planning IADE — décision de Mehdi.
//
// POUR LA MODIFIER : ce fichier, et lui seul. La trame change rarement (elle a
// duré toute l'année 2026) ; une table en base et l'écran pour la tenir coûteraient
// plus cher que la valeur qu'ils apportent. Une modification se relit en diff.
// ============================================================
import { numeroSemaineISO } from './calendrier'

// Alternance une semaine sur deux, sur la même salle : Hanslik les semaines
// IMPAIRES, Ayral les paires (numéro de semaine ISO).
const alterne = (impaire, paire) => ({ impaire, paire })

/**
 * TRAME — jour de la semaine (1 = lundi … 5 = vendredi) → salle → demi-journée.
 * `null` = la salle ne tourne pas à cette demi-journée.
 */
export const TRAME_BLOC_B = {
  1: { // lundi
    'Endo 1': { matin: 'Louvety',  apres_midi: 'Charpy' },
    'Endo 2': { matin: 'Espérance', apres_midi: 'Suma' },
    'Endo 3': { matin: 'Blanc',    apres_midi: 'Garcia' },
    'Endo 4': { matin: null,       apres_midi: 'Ayral' },
  },
  2: { // mardi
    'Endo 1': { matin: 'Rudler',    apres_midi: 'Garcia' },
    'Endo 2': { matin: 'Espérance', apres_midi: 'Lhote' },
    'Endo 3': { matin: 'Fedkovic',  apres_midi: 'Suma' },
    'Endo 4': { matin: 'Blanc',     apres_midi: 'Rollin' },
  },
  3: { // mercredi
    'Endo 1': { matin: 'Louvety',  apres_midi: 'Vercambre' },
    'Endo 2': { matin: 'Fedkovic', apres_midi: 'Valats' },
    'Endo 3': { matin: 'Lhote',    apres_midi: alterne('Hanslik', 'Ayral') },
    // Fedkovic tient CETTE salle en plus de l'Endo 2, le même matin.
    'Endo 4': { matin: 'Fedkovic', apres_midi: 'Rollin' },
  },
  4: { // jeudi
    'Endo 1': { matin: 'Hanslik',   apres_midi: 'Espérance' },
    'Endo 2': { matin: 'Lhote',     apres_midi: 'Garcia' },
    'Endo 3': { matin: 'Vercambre', apres_midi: 'Blanc' },
    'Endo 4': { matin: 'Charpy',    apres_midi: 'Ayral' },
  },
  5: { // vendredi
    'Endo 1': { matin: 'Hanslik',  apres_midi: 'Rudler' },
    'Endo 2': { matin: 'Suma',     apres_midi: 'Valats' },
    'Endo 3': { matin: 'Fedkovic', apres_midi: 'Vercambre' },
    'Endo 4': { matin: null,       apres_midi: 'Charpy' },
  },
}

const DEMIS = ['matin', 'apres_midi']

// Comparaison des noms : la gestion tape « esperance », « Dr Espérance »,
// « ESPERANCE ». Accents, casse, civilité et espaces ne doivent pas séparer
// deux fois la même personne.
export function normNom(nom) {
  return String(nom ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(dr|docteur|pr|professeur)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function jourSemaine(iso) {
  const [a, m, j] = String(iso).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j)).getUTCDay()
}

// Qui tient une case, en résolvant l'alternance semaine paire / impaire.
function titulaire(case_, iso) {
  if (!case_ || typeof case_ === 'string') return case_ ?? null
  const [a, m, j] = String(iso).split('-').map(Number)
  const semaine = numeroSemaineISO(new Date(Date.UTC(a, m - 1, j)))
  return semaine % 2 === 1 ? case_.impaire : case_.paire
}

/**
 * Les salles qu'un opérateur tient un jour donné, par demi-journée.
 * → { matin: ['Endo 2', 'Endo 4'], apres_midi: [] }
 */
export function sallesTenues(operateur, jourIso) {
  const cible = normNom(operateur)
  const out = { matin: [], apres_midi: [] }
  if (!cible || !jourIso) return out
  const jour = TRAME_BLOC_B[jourSemaine(jourIso)]
  if (!jour) return out
  for (const [salle, demis] of Object.entries(jour)) {
    for (const demi of DEMIS) {
      if (normNom(titulaire(demis[demi], jourIso)) === cible) out[demi].push(salle)
    }
  }
  return out
}

/**
 * Le moment d'une absence, d'après la trame.
 * → { moment, salles, source: 'trame' } ou null si la trame ne le connaît pas
 *   ce jour-là (il n'opère pas, ou son nom lui est inconnu).
 *
 * Présent matin ET après-midi → 'journee' : son absence fait sauter les deux.
 */
export function momentSelonTrame(operateur, jourIso) {
  const { matin, apres_midi: aprem } = sallesTenues(operateur, jourIso)
  if (matin.length && aprem.length) {
    return { moment: 'journee', salles: [...matin, ...aprem], source: 'trame' }
  }
  if (matin.length) return { moment: 'matin', salles: matin, source: 'trame' }
  if (aprem.length) return { moment: 'apres_midi', salles: aprem, source: 'trame' }
  return null
}

/** Vrai si la trame connaît cet opérateur, un jour ou l'autre de la semaine. */
export function connuDeTrame(operateur) {
  const cible = normNom(operateur)
  return !!cible && operateursTrame().some(n => normNom(n) === cible)
}

/**
 * Combien de salles saute l'absence d'un opérateur, sur une demi-journée donnée.
 *
 * Deux régimes, et la distinction compte :
 *   • opérateur CONNU de la trame → le compte exact, **zéro compris**. Fedkovic
 *     absent le mercredi fait sauter 2 salles le matin (Endo 2 + Endo 4) et
 *     AUCUNE l'après-midi, où il n'opère pas. Noter son absence « journée » ne
 *     doit pas inventer une salle perdue l'après-midi.
 *   • opérateur INCONNU → 1, la règle « un opérateur = une salle ». On ne sait
 *     pas, on garde le comportement d'avant plutôt que de compter zéro et de
 *     faire disparaître la ligne du planning.
 */
export function sallesPerdues(operateur, jourIso, moment) {
  const t = sallesTenues(operateur, jourIso)
  const plancher = connuDeTrame(operateur) ? 0 : 1
  const compte = (liste) => Math.max(plancher, liste.length)
  if (moment === 'matin') return compte(t.matin)
  if (moment === 'apres_midi') return compte(t.apres_midi)
  return { matin: compte(t.matin), apres_midi: compte(t.apres_midi) }
}

/** Tous les opérateurs de la trame, une seule orthographe chacun, triés. */
export function operateursTrame() {
  const vus = new Map()
  for (const jour of Object.values(TRAME_BLOC_B)) {
    for (const demis of Object.values(jour)) {
      for (const demi of DEMIS) {
        const c = demis[demi]
        for (const nom of (c && typeof c === 'object') ? [c.impaire, c.paire] : [c]) {
          if (nom) vus.set(normNom(nom), nom)
        }
      }
    }
  }
  return [...vus.values()].sort((a, b) => a.localeCompare(b, 'fr'))
}

const NOMS_JOURS = { 1: 'lundi', 2: 'mardi', 3: 'mercredi', 4: 'jeudi', 5: 'vendredi' }

/**
 * La semaine type d'un opérateur, en clair, pour l'afficher à la saisie :
 * → [{ jourSemaine, label, moment, salles, alterne }]
 */
export function semaineType(operateur) {
  const cible = normNom(operateur)
  if (!cible) return []
  const out = []
  for (const js of [1, 2, 3, 4, 5]) {
    const matin = []
    const aprem = []
    let alternee = false
    for (const [salle, demis] of Object.entries(TRAME_BLOC_B[js])) {
      for (const demi of DEMIS) {
        const c = demis[demi]
        const noms = (c && typeof c === 'object') ? [c.impaire, c.paire] : [c]
        if (noms.some(n => normNom(n) === cible)) {
          ;(demi === 'matin' ? matin : aprem).push(salle)
          if (c && typeof c === 'object') alternee = true
        }
      }
    }
    if (!matin.length && !aprem.length) continue
    const moment = matin.length && aprem.length ? 'journee' : matin.length ? 'matin' : 'apres_midi'
    out.push({ jourSemaine: js, label: NOMS_JOURS[js], moment, salles: [...matin, ...aprem], alterne: alternee })
  }
  return out
}
