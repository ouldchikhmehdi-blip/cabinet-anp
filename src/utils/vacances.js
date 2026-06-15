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

// Analyse une semaine : conflits de couverture / refus / week-end de garde collé.
//   sansVacance : aucun associé en congé
//   refus       : associés affectés qui ont refusé cette semaine (desiderata)
//   sousScolaire: semaine de vacances scolaires avec moins de 2 associés en congé
//   gardeCollee : associés en congé qui sont de garde le week-end de la semaine (S)
//                 ou du week-end précédent (S-1) — règle : jamais de vacances accolées
//                 à un week-end de garde (avant comme après).
export function analyserSemaine(num, inis, refusParAssocie, estScolaire, weekendAff = {}) {
  const liste = inis ?? []
  return {
    sansVacance: liste.length === 0,
    refus: liste.filter(i => refusParAssocie?.[i]?.has(num)),
    sousScolaire: !!estScolaire && liste.length < 2,
    gardeCollee: liste.filter(i => weekendAff?.[num] === i || weekendAff?.[num - 1] === i),
  }
}

// Proposition automatique (déterministe, aucun Math.random/Date.now).
// - semainesPlage : [{ num, ... }] de la période
// - souhaitParAssocie / refusParAssocie : { ini: Set(nums) }
// - scolairesSet : Set(nums) des semaines de vacances scolaires (couverture min = 2)
// - vacancesHorsPlage : { num: [inis] } des autres périodes (pour l'équilibrage)
// - weekendAff : { num: ini } affectations week-end (pour éviter une garde collée)
// Renvoie { num: [inis] } pour la plage.
export function proposerVacances(semainesPlage, souhaitParAssocie, refusParAssocie, scolairesSet, vacancesHorsPlage = {}, weekendAff = {}) {
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
    const gardeCollee = (ini) => weekendAff?.[num] === ini || weekendAff?.[num - 1] === ini
    while (resultat[num].length < min) {
      const base = ASSOCIES.filter(ini => !resultat[num].includes(ini) && !refusParAssocie?.[ini]?.has(num))
      // Éviter une garde collée ; à défaut (sinon couverture impossible), on relâche.
      let candidats = base.filter(ini => !gardeCollee(ini))
      if (candidats.length === 0) candidats = base
      if (candidats.length === 0) break
      candidats.sort((a, b) => (compte[a] - compte[b]) || (ASSOCIES.indexOf(a) - ASSOCIES.indexOf(b)))
      const choisi = candidats[0]
      resultat[num].push(choisi)
      compte[choisi]++
    }
  }
  return resultat
}
