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
//   indispo       : ini a marqué ce week-end indisponible (desiderata)
//   tropProche    : numéro du week-end le plus proche (< ESPACEMENT_MIN) déjà attribué à ini, sinon null
//   vacancesCollee: ini est en vacances la semaine du week-end (S) ou la semaine suivante (S+1)
//                   — règle : jamais de week-end de garde accolé à une semaine de vacances.
//   jourOffWE     : ini a demandé un jour off le samedi ou le dimanche de ce week-end (desiderata)
//   souhaitColonne: ini a souhaité une colonne (travailler) en semaine num ; lui donner ce week-end
//                   le placerait sur la colonne « avant week-end » → contredit son souhait (index/null).
export function analyserAffectation(num, ini, affectations, indispoParAssocie, vacancesParSemaine = {}, joursOffWeekendParAssocie = {}, colonnesSouhaiteesParAssocie = {}) {
  if (!ini) return { indispo: false, tropProche: null, vacancesCollee: false, jourOffWE: false, souhaitColonne: null }
  const indispo = !!indispoParAssocie?.[ini]?.has(num)
  let tropProche = null
  let meilleurEcart = ESPACEMENT_MIN
  for (const autre of semainesDe(ini, affectations, num)) {
    const ecart = Math.abs(autre - num)
    if (ecart < meilleurEcart) { meilleurEcart = ecart; tropProche = autre }
  }
  const enVacances = !!vacancesParSemaine?.[num]?.includes(ini)
  const vacancesCollee = !!(enVacances || vacancesParSemaine?.[num + 1]?.includes(ini))
  // Un jour off le sam/dim d'une semaine de vacances est déjà satisfait (cas couvert par vacancesCollee).
  const jourOffWE = !enVacances && !!joursOffWeekendParAssocie?.[ini]?.has(num)
  const col = colonnesSouhaiteesParAssocie?.[ini]?.[num]
  return { indispo, tropProche, vacancesCollee, jourOffWE, souhaitColonne: Number.isInteger(col) ? col : null }
}

// Proposition automatique (glouton déterministe, par numéro de semaine croissant).
// - weekendsPlage : [{ num, ... }] de la période à caler (ordre croissant attendu)
// - indispoParAssocie : { ini: Set(nums) }
// - objectifParAssocie : { ini: number|undefined } (objectif « G week-end »)
// - affectationsHorsPlage : affectations des autres périodes (pour l'espacement aux bords)
// - vacancesParSemaine : { num: [inis] } pour éviter une garde collée à des vacances (S ou S+1)
// Renvoie un objet { num: ini } limité aux week-ends de la plage.
export function proposerWeekends(weekendsPlage, indispoParAssocie, objectifParAssocie = {}, affectationsHorsPlage = {}, vacancesParSemaine = {}, joursOffWeekendParAssocie = {}, colonnesSouhaiteesParAssocie = {}) {
  const resultat = {}
  // Compteur courant (hors-plage + ce qu'on attribue), pour l'équilibrage et l'espacement.
  const courant = { ...affectationsHorsPlage }
  const compte = {}
  for (const ini of ASSOCIES) compte[ini] = semainesDe(ini, courant).length

  const nums = weekendsPlage.map(w => w.num).sort((a, b) => a - b)
  for (const num of nums) {
    const espacementOk = (ini) =>
      semainesDe(ini, courant).every(n => Math.abs(n - num) >= ESPACEMENT_MIN)
    // Dispo = ni indisponible déclaré, ni jour off posé le sam/dim de ce week-end.
    const dispo = (ini) => !indispoParAssocie?.[ini]?.has(num) && !joursOffWeekendParAssocie?.[ini]?.has(num)
    const vacancesCollee = (ini) => vacancesParSemaine?.[num]?.includes(ini) || vacancesParSemaine?.[num + 1]?.includes(ini)
    const veutColonne = (ini) => Number.isInteger(colonnesSouhaiteesParAssocie?.[ini]?.[num])

    let candidats = ASSOCIES.filter(ini => dispo(ini) && espacementOk(ini) && !vacancesCollee(ini))
    if (candidats.length === 0) candidats = ASSOCIES.filter(ini => dispo(ini) && !vacancesCollee(ini)) // relâche l'espacement
    if (candidats.length === 0) candidats = ASSOCIES.filter(dispo) // relâche aussi la garde collée
    if (candidats.length === 0) continue // personne de dispo → laissé vide, le faiseur tranche

    // Moins de week-ends d'abord ; on pénalise un souhait de colonne ; départage par déficit vs objectif ; puis ordre figé.
    candidats.sort((a, b) => {
      if (compte[a] !== compte[b]) return compte[a] - compte[b]
      const colA = veutColonne(a) ? 1 : 0
      const colB = veutColonne(b) ? 1 : 0
      if (colA !== colB) return colA - colB
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
