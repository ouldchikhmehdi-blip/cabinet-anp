// ============================================================
// rea.js — modèle + logique du placement des semaines de réanimation (PLANNING.md §6, §16).
// Un associé en réa par semaine, réparti équitablement. Persistance dans reaApi.js.
// Une semaine est identifiée par son numéro de semaine ISO.
//
// data = { v, rea: { <numSemaineISO>: <initiales> }, verrous: [<numSemaineISO>] }
// `verrous` = semaines de réa FORCÉES à la main : « Proposer automatiquement » les préserve.
// ============================================================
import { ASSOCIES } from '../data/associes'
import { optimiserAssignation } from './optimiserAssignation'

export const VERSION_REA = 1

export function reaVide() {
  return { v: VERSION_REA, rea: {}, verrous: [] }
}

export function normaliserRea(data) {
  const src = data?.rea && typeof data.rea === 'object' ? data.rea : {}
  const rea = {}
  for (const [num, ini] of Object.entries(src)) {
    if (ini) rea[Number(num)] = ini
  }
  const verrous = (Array.isArray(data?.verrous) ? data.verrous : [])
    .map(Number).filter(n => rea[n])
  return { v: VERSION_REA, rea, verrous }
}

// Vide le remplissage automatique en CONSERVANT les semaines de réa verrouillées par le faiseur.
// Repart d'une donnée normalisée, ne garde que les affectations des semaines verrouillées.
export function viderSaufVerrous(data) {
  const d = normaliserRea(data)
  const ver = (d.verrous ?? []).filter(num => d.rea[num] != null)
  const rea = {}
  for (const num of ver) rea[num] = d.rea[num]
  return normaliserRea({ v: VERSION_REA, rea, verrous: ver })
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
// - dejaFait : { ini: number } semaines de réa DÉJÀ réalisées (Compteurs de référence) ; quand fourni, sert de
//   SOCLE du compteur → plafond DUR « objectif annuel » respecté sans écart.
// Renvoie { num: ini } pour la plage.
export function proposerRea(semainesPlage, joursOffParAssocie, weekendAff = {}, objectifRea = {}, reaHorsPlage = {}, vacancesParSemaine = {}, colonnesSouhaiteesParAssocie = {}, dejaFait = {}) {
  const resultat = {}
  // Décompte hors-plage (autres périodes en base) — repli quand aucune référence n'est fournie.
  const horsCompte = {}
  for (const ini of ASSOCIES) horsCompte[ini] = 0
  for (const ini of Object.values(reaHorsPlage)) if (horsCompte[ini] != null) horsCompte[ini]++
  // Socle = référence si fournie (inclut déjà été/Noël → pas de double-comptage), sinon décompte hors-plage.
  const compte = {}
  for (const ini of ASSOCIES) compte[ini] = dejaFait[ini] != null ? dejaFait[ini] : horsCompte[ini]

  // Plafond DUR : un associé ayant atteint son objectif annuel n'est plus candidat (sans objectif → illimité).
  const sousPlafond = (ini) => objectifRea[ini] == null || compte[ini] < objectifRea[ini]

  const nums = semainesPlage.map(s => s.num).sort((a, b) => a - b)
  for (const num of nums) {
    const sansJourOff = (ini) => !joursOffParAssocie?.[ini]?.has(num)
    const sansGarde = (ini) => weekendAff?.[num] !== ini && weekendAff?.[num - 1] !== ini
    const veutColonne = (ini) => Number.isInteger(colonnesSouhaiteesParAssocie?.[ini]?.[num])
    // RÈGLE DURE : jamais deux semaines de réa d'affilée pour le même associé. On exclut donc l'associé
    // de la semaine précédente (résultat de la plage, ou socle hors-plage au bord gauche) et de la
    // semaine suivante hors-plage (au bord droit ; en plage, num+1 est attribué plus tard et vérifiera num).
    const precedent = resultat[num - 1] ?? reaHorsPlage[num - 1]
    const suivantHors = reaHorsPlage[num + 1]
    const sansConsecutif = (ini) => ini !== precedent && ini !== suivantHors

    // Vacances = poste exclusif → on n'attribue JAMAIS la réa à un associé en congé.
    // Plafond DUR + non-consécutif appliqués à chaque niveau (jamais relâchés) ; pool vide → semaine vide.
    const base = ASSOCIES.filter(ini => sousPlafond(ini) && sansConsecutif(ini) && !vacancesParSemaine?.[num]?.includes(ini))
    let candidats = base.filter(ini => sansJourOff(ini) && sansGarde(ini))
    if (candidats.length === 0) candidats = base.filter(sansGarde)   // relâche le jour off (garde le repos)
    if (candidats.length === 0) candidats = base                     // relâche aussi le repos (exception)
    if (candidats.length === 0) continue                             // tous au plafond / en vacances → vide
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

// ── OPTIMISEUR réa (recherche locale, score lexicographique desiderata ≫ équilibre ≫ espacement) ──
// Part de l'état courant `reaPlage` ({ num: ini } de la plage) et l'améliore par réassignations/échanges,
// en respectant les RÈGLES DURES (pas de vacancier, pas deux semaines d'affilée, plafond objectif) et les
// verrous. Score : 1) desiderata = jours off + souhaits de colonne contredits ; 2) équilibre = écart
// max−min des semaines de réa ; 3) espacement = réa accolée à une garde de week-end (S ou S-1).
// Renvoie { rea, desiderata:{avant,apres}, equilibre:{...}, espacement:{...} }.
export function optimiserRea(semainesPlage, reaPlage, {
  joursOffParAssocie = {}, weekendAff = {}, objectifRea = {}, reaHorsPlage = {},
  vacancesParSemaine = {}, colonnesSouhaiteesParAssocie = {}, dejaFait = {}, fixes = new Set(),
} = {}) {
  const nums = semainesPlage.map(s => s.num).sort((a, b) => a - b)
  const horsCompte = {}; for (const ini of ASSOCIES) horsCompte[ini] = 0
  for (const ini of Object.values(reaHorsPlage)) if (horsCompte[ini] != null) horsCompte[ini]++
  const socle = {}; for (const ini of ASSOCIES) socle[ini] = dejaFait[ini] != null ? dejaFait[ini] : horsCompte[ini]

  const countDe = (etat, ini) => { let n = socle[ini]; for (const num of nums) if (etat[num] === ini) n++; return n }
  const eligible = (num, ini, etat) => {
    if (vacancesParSemaine?.[num]?.includes(ini)) return false
    if (objectifRea[ini] != null && countDe(etat, ini) > objectifRea[ini]) return false
    const av = etat[num - 1] ?? reaHorsPlage[num - 1]
    const ap = etat[num + 1] ?? reaHorsPlage[num + 1]
    return ini !== av && ini !== ap // jamais deux semaines de réa d'affilée
  }
  const score = (etat) => {
    let des = 0, esp = 0
    const count = {}; for (const ini of ASSOCIES) count[ini] = socle[ini]
    for (const num of nums) {
      const ini = etat[num]; if (!ASSOCIES.includes(ini)) continue
      count[ini]++
      if (joursOffParAssocie?.[ini]?.has(num)) des++
      if (Number.isInteger(colonnesSouhaiteesParAssocie?.[ini]?.[num])) des++
      if (weekendAff?.[num] === ini || weekendAff?.[num - 1] === ini) esp++
    }
    let mn = Infinity, mx = -Infinity
    for (const ini of ASSOCIES) { if (count[ini] < mn) mn = count[ini]; if (count[ini] > mx) mx = count[ini] }
    return [des, mx - mn, esp]
  }
  const { etat, avant, apres } = optimiserAssignation({ nums, etat0: reaPlage, fixes, eligible, score })
  return { rea: etat, desiderata: { avant: avant[0], apres: apres[0] }, equilibre: { avant: avant[1], apres: apres[1] }, espacement: { avant: avant[2], apres: apres[2] } }
}
