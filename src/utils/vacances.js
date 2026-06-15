// ============================================================
// vacances.js — modèle + logique de positionnement des vacances (PLANNING.md §8, §12).
// Plusieurs associés possibles par semaine (au moins 1 visé). Persistance dans
// vacancesApi.js. Une semaine est identifiée par son numéro de semaine ISO.
//
// data = { v, vacances: { <numSemaineISO>: [<initiales>, …] } }
// ============================================================
import { ASSOCIES } from '../data/associes'

export const VERSION_VAC = 1

export function vacancesVide() {
  return { v: VERSION_VAC, vacances: {} }
}

export function normaliserVacances(data) {
  const src = data?.vacances && typeof data.vacances === 'object' ? data.vacances : {}
  const vacances = {}
  for (const [num, inis] of Object.entries(src)) {
    if (Array.isArray(inis) && inis.length) vacances[Number(num)] = inis.filter(Boolean)
  }
  return { v: VERSION_VAC, vacances }
}

// Analyse une semaine : conflits de couverture / refus.
//   sansVacance : aucun associé en congé
//   refus       : associés affectés qui ont refusé cette semaine (desiderata)
//   sousScolaire: semaine de vacances scolaires avec moins de 2 associés en congé
export function analyserSemaine(num, inis, refusParAssocie, estScolaire) {
  const liste = inis ?? []
  return {
    sansVacance: liste.length === 0,
    refus: liste.filter(i => refusParAssocie?.[i]?.has(num)),
    sousScolaire: !!estScolaire && liste.length < 2,
  }
}

// Proposition automatique (déterministe, aucun Math.random/Date.now).
// - semainesPlage : [{ num, ... }] de la période
// - souhaitParAssocie / refusParAssocie : { ini: Set(nums) }
// - scolairesSet : Set(nums) des semaines de vacances scolaires (couverture min = 2)
// - vacancesHorsPlage : { num: [inis] } des autres périodes (pour l'équilibrage)
// Renvoie { num: [inis] } pour la plage.
export function proposerVacances(semainesPlage, souhaitParAssocie, refusParAssocie, scolairesSet, vacancesHorsPlage = {}) {
  const resultat = {}
  // Compteur de semaines par associé (hors-plage + ce qu'on attribue) pour l'équilibrage.
  const compte = {}
  for (const ini of ASSOCIES) compte[ini] = 0
  for (const inis of Object.values(vacancesHorsPlage)) {
    for (const ini of inis) if (compte[ini] != null) compte[ini]++
  }

  const nums = semainesPlage.map(s => s.num).sort((a, b) => a - b)

  // 1) Souhaits d'abord (hors refus, par cohérence).
  for (const num of nums) {
    const souhaits = ASSOCIES.filter(ini => souhaitParAssocie?.[ini]?.has(num) && !refusParAssocie?.[ini]?.has(num))
    resultat[num] = [...souhaits]
    for (const ini of souhaits) compte[ini]++
  }

  // 2) Couverture minimale (1, ou 2 en semaine scolaire) avec les moins chargés, hors refus.
  for (const num of nums) {
    const min = scolairesSet?.has(num) ? 2 : 1
    while (resultat[num].length < min) {
      const candidats = ASSOCIES.filter(ini => !resultat[num].includes(ini) && !refusParAssocie?.[ini]?.has(num))
      if (candidats.length === 0) break
      candidats.sort((a, b) => (compte[a] - compte[b]) || (ASSOCIES.indexOf(a) - ASSOCIES.indexOf(b)))
      const choisi = candidats[0]
      resultat[num].push(choisi)
      compte[choisi]++
    }
  }
  return resultat
}
