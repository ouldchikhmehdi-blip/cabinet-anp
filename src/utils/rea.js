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
//   vacances : ini est en congé cette semaine (poste exclusif : jamais réa + vacances)
//   jourOff  : ini a demandé un jour off pendant cette semaine (desiderata)
//   garde    : ini est de garde le week-end de la semaine (S, réa juste avant) OU du
//              week-end précédent (S-1, réa juste après → repos du lendemain, §5).
//              À éviter, sauf exception validée par le faiseur.
//   souhaitColonne : l'associé a souhaité une colonne (travailler) cette semaine via ses
//                    desiderata ; la réa (poste plein) contredit ce souhait → index ou null.
export function analyserRea(num, ini, joursOffParAssocie, weekendAff = {}, vacancesParSemaine = {}, colonnesSouhaiteesParAssocie = {}) {
  if (!ini) return { vacances: false, jourOff: false, garde: false, souhaitColonne: null }
  const col = colonnesSouhaiteesParAssocie?.[ini]?.[num]
  const vacances = !!vacancesParSemaine?.[num]?.includes(ini)
  return {
    vacances,
    // Un jour off tombant dans une semaine de vacances est déjà satisfait (associé off).
    jourOff: !vacances && !!joursOffParAssocie?.[ini]?.has(num),
    garde: weekendAff?.[num] === ini || weekendAff?.[num - 1] === ini,
    souhaitColonne: Number.isInteger(col) ? col : null,
  }
}

// Proposition automatique (déterministe, aucun Math.random/Date.now).
// - semainesPlage : [{ num, ... }] de la période
// - joursOffParAssocie : { ini: Set(numsSemaine) } (semaines contenant un jour off demandé)
// - weekendAff : { num: ini } affectations week-end (réa interdite avant un WE de garde)
// - objectifRea : { ini: number } objectif « Réa » (étape 2), si renseigné
// - reaHorsPlage : { num: ini } des autres périodes (pour l'équilibrage global)
// - vacancesParSemaine : { num: [inis] } — un associé en vacances n'est jamais mis en réa
// Renvoie { num: ini } pour la plage.
export function proposerRea(semainesPlage, joursOffParAssocie, weekendAff = {}, objectifRea = {}, reaHorsPlage = {}, vacancesParSemaine = {}, colonnesSouhaiteesParAssocie = {}) {
  const resultat = {}
  const compte = {}
  for (const ini of ASSOCIES) compte[ini] = 0
  for (const ini of Object.values(reaHorsPlage)) if (compte[ini] != null) compte[ini]++

  const nums = semainesPlage.map(s => s.num).sort((a, b) => a - b)
  for (const num of nums) {
    const sansJourOff = (ini) => !joursOffParAssocie?.[ini]?.has(num)
    const sansGarde = (ini) => weekendAff?.[num] !== ini && weekendAff?.[num - 1] !== ini
    const veutColonne = (ini) => Number.isInteger(colonnesSouhaiteesParAssocie?.[ini]?.[num])

    // Vacances = poste exclusif → on n'attribue JAMAIS la réa à un associé en congé.
    const base = ASSOCIES.filter(ini => !vacancesParSemaine?.[num]?.includes(ini))
    let candidats = base.filter(ini => sansJourOff(ini) && sansGarde(ini))
    if (candidats.length === 0) candidats = base.filter(sansGarde)   // relâche le jour off (garde le repos)
    if (candidats.length === 0) candidats = base                     // relâche aussi le repos (exception)
    if (candidats.length === 0) continue                             // tout le monde en vacances → vide
    // Équilibrage : moins de réa d'abord ; on pénalise un souhait de colonne (le mettre en réa le
    // contredit) ; départage par déficit vs objectif ; puis ordre figé.
    candidats.sort((a, b) => {
      if (compte[a] !== compte[b]) return compte[a] - compte[b]
      const colA = veutColonne(a) ? 1 : 0
      const colB = veutColonne(b) ? 1 : 0
      if (colA !== colB) return colA - colB
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
