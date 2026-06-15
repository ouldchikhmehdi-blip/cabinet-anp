// ============================================================
// weekends.js — modèle + logique de calage des week-ends (PLANNING.md §12 étape 1).
// 1 associé par week-end (astreinte samedi + garde dimanche). Persistance dans
// weekendsApi.js. Un week-end est identifié par son numéro de semaine ISO.
//
// data = { v, affectations: { <numSemaineISO>: <initiales> } }
// ============================================================
import { ASSOCIES } from '../data/associes'

export const VERSION_WE = 1

// Espacement minimal souhaité entre deux week-ends d'un même associé (semaines).
export const ESPACEMENT_MIN = 4

export function weekendsVide() {
  return { v: VERSION_WE, affectations: {} }
}

export function normaliserWeekends(data) {
  const aff = data?.affectations && typeof data.affectations === 'object' ? data.affectations : {}
  // Clés normalisées en nombres → initiales (on ignore les valeurs vides).
  const affectations = {}
  for (const [num, ini] of Object.entries(aff)) {
    if (ini) affectations[Number(num)] = ini
  }
  return { v: VERSION_WE, affectations }
}

// Numéros de week-ends (semaines) déjà attribués à `ini`, hors `numExclu`.
function semainesDe(ini, affectations, numExclu = null) {
  const nums = []
  for (const [num, val] of Object.entries(affectations)) {
    const n = Number(num)
    if (val === ini && n !== numExclu) nums.push(n)
  }
  return nums
}

// Analyse une affectation candidate (ini sur le week-end num) → conflits.
//   indispo    : ini a marqué ce week-end indisponible (desiderata)
//   tropProche : numéro du week-end le plus proche (< ESPACEMENT_MIN) déjà attribué à ini, sinon null
export function analyserAffectation(num, ini, affectations, indispoParAssocie) {
  if (!ini) return { indispo: false, tropProche: null }
  const indispo = !!indispoParAssocie?.[ini]?.has(num)
  let tropProche = null
  let meilleurEcart = ESPACEMENT_MIN
  for (const autre of semainesDe(ini, affectations, num)) {
    const ecart = Math.abs(autre - num)
    if (ecart < meilleurEcart) { meilleurEcart = ecart; tropProche = autre }
  }
  return { indispo, tropProche }
}

// Proposition automatique (glouton déterministe, par numéro de semaine croissant).
// - weekendsPlage : [{ num, ... }] de la période à caler (ordre croissant attendu)
// - indispoParAssocie : { ini: Set(nums) }
// - objectifParAssocie : { ini: number|undefined } (objectif « G week-end »)
// - affectationsHorsPlage : affectations des autres périodes (pour l'espacement aux bords)
// Renvoie un objet { num: ini } limité aux week-ends de la plage.
export function proposerWeekends(weekendsPlage, indispoParAssocie, objectifParAssocie = {}, affectationsHorsPlage = {}) {
  const resultat = {}
  // Compteur courant (hors-plage + ce qu'on attribue), pour l'équilibrage et l'espacement.
  const courant = { ...affectationsHorsPlage }
  const compte = {}
  for (const ini of ASSOCIES) compte[ini] = semainesDe(ini, courant).length

  const nums = weekendsPlage.map(w => w.num).sort((a, b) => a - b)
  for (const num of nums) {
    const espacementOk = (ini) =>
      semainesDe(ini, courant).every(n => Math.abs(n - num) >= ESPACEMENT_MIN)
    const dispo = (ini) => !indispoParAssocie?.[ini]?.has(num)

    let candidats = ASSOCIES.filter(ini => dispo(ini) && espacementOk(ini))
    if (candidats.length === 0) candidats = ASSOCIES.filter(dispo) // relâche l'espacement
    if (candidats.length === 0) continue // personne de dispo → laissé vide, le faiseur tranche

    // Moins de week-ends d'abord ; départage : plus grand déficit vs objectif ; puis ordre figé.
    candidats.sort((a, b) => {
      if (compte[a] !== compte[b]) return compte[a] - compte[b]
      const defA = (objectifParAssocie[a] ?? 0) - compte[a]
      const defB = (objectifParAssocie[b] ?? 0) - compte[b]
      if (defA !== defB) return defB - defA
      return ASSOCIES.indexOf(a) - ASSOCIES.indexOf(b)
    })

    const choisi = candidats[0]
    resultat[num] = choisi
    courant[num] = choisi
    compte[choisi] += 1
  }
  return resultat
}
