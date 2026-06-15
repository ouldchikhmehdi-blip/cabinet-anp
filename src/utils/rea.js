// ============================================================
// rea.js — modèle + logique du placement des semaines de réanimation (PLANNING.md §6, §16).
// Un associé en réa par semaine, réparti équitablement. Persistance dans reaApi.js.
// Une semaine est identifiée par son numéro de semaine ISO.
//
// data = { v, rea: { <numSemaineISO>: <initiales> } }
// ============================================================
import { ASSOCIES } from '../data/associes'

export const VERSION_REA = 1

export function reaVide() {
  return { v: VERSION_REA, rea: {} }
}

export function normaliserRea(data) {
  const src = data?.rea && typeof data.rea === 'object' ? data.rea : {}
  const rea = {}
  for (const [num, ini] of Object.entries(src)) {
    if (ini) rea[Number(num)] = ini
  }
  return { v: VERSION_REA, rea }
}

// Analyse l'affectation réa (ini sur la semaine num) → conflits.
//   jourOff    : ini a demandé un jour off pendant cette semaine (desiderata)
//   gardeApres : ini est de garde le week-end de cette semaine (réa juste avant un
//                week-end de garde → interdit sauf exception validée par le faiseur)
export function analyserRea(num, ini, joursOffParAssocie, weekendAff = {}) {
  if (!ini) return { jourOff: false, gardeApres: false }
  return {
    jourOff: !!joursOffParAssocie?.[ini]?.has(num),
    gardeApres: weekendAff?.[num] === ini,
  }
}

// Proposition automatique (déterministe, aucun Math.random/Date.now).
// - semainesPlage : [{ num, ... }] de la période
// - joursOffParAssocie : { ini: Set(numsSemaine) } (semaines contenant un jour off demandé)
// - weekendAff : { num: ini } affectations week-end (réa interdite avant un WE de garde)
// - objectifRea : { ini: number } objectif « Réa » (étape 2), si renseigné
// - reaHorsPlage : { num: ini } des autres périodes (pour l'équilibrage global)
// Renvoie { num: ini } pour la plage.
export function proposerRea(semainesPlage, joursOffParAssocie, weekendAff = {}, objectifRea = {}, reaHorsPlage = {}) {
  const resultat = {}
  const compte = {}
  for (const ini of ASSOCIES) compte[ini] = 0
  for (const ini of Object.values(reaHorsPlage)) if (compte[ini] != null) compte[ini]++

  const nums = semainesPlage.map(s => s.num).sort((a, b) => a - b)
  for (const num of nums) {
    const sansJourOff = (ini) => !joursOffParAssocie?.[ini]?.has(num)
    const sansGarde = (ini) => weekendAff?.[num] !== ini

    let candidats = ASSOCIES.filter(ini => sansJourOff(ini) && sansGarde(ini))
    if (candidats.length === 0) candidats = ASSOCIES.filter(sansJourOff) // relâche la garde collée
    if (candidats.length === 0) candidats = [...ASSOCIES]                 // relâche tout
    // Équilibrage : moins de réa d'abord ; départage par déficit vs objectif ; puis ordre figé.
    candidats.sort((a, b) => {
      if (compte[a] !== compte[b]) return compte[a] - compte[b]
      const defA = (objectifRea[a] ?? 0) - compte[a]
      const defB = (objectifRea[b] ?? 0) - compte[b]
      if (defA !== defB) return defB - defA
      return ASSOCIES.indexOf(a) - ASSOCIES.indexOf(b)
    })
    const choisi = candidats[0]
    resultat[num] = choisi
    compte[choisi] += 1
  }
  return resultat
}
