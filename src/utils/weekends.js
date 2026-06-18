// ============================================================
// weekends.js — modèle + logique de calage des week-ends (PLANNING.md §12 étape 1).
// 1 associé par week-end (astreinte samedi + garde dimanche). Persistance dans
// weekendsApi.js. Un week-end est identifié par son numéro de semaine ISO.
//
// data = { v, affectations: { <numSemaineISO>: <initiales> }, verrous: [<numSemaineISO>] }
// `verrous` = week-ends FORCÉS à la main par le faiseur : « Proposer automatiquement » les préserve.
// ============================================================
import { ASSOCIES } from '../data/associes'

export const VERSION_WE = 1

// Espacement minimal souhaité entre deux week-ends d'un même associé (semaines).
export const ESPACEMENT_MIN = 4

export function weekendsVide() {
  return { v: VERSION_WE, affectations: {}, verrous: [] }
}

export function normaliserWeekends(data) {
  const aff = data?.affectations && typeof data.affectations === 'object' ? data.affectations : {}
  // Clés normalisées en nombres → initiales (on ignore les valeurs vides).
  const affectations = {}
  for (const [num, ini] of Object.entries(aff)) {
    if (ini) affectations[Number(num)] = ini
  }
  // Verrous : uniquement des semaines réellement affectées.
  const verrous = (Array.isArray(data?.verrous) ? data.verrous : [])
    .map(Number).filter(n => affectations[n])
  return { v: VERSION_WE, affectations, verrous }
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
//   souhaitVacancesCollee : ini a SOUHAITÉ des vacances la semaine du week-end (S) ou la suivante (S+1) —
//                   anticipation souple (le week-end de garde collerait un souhait de vacances). Distinct
//                   de vacancesCollee (vacances DÉJÀ placées, règle dure) : ici simple alerte/préférence.
export function analyserAffectation(num, ini, affectations, indispoParAssocie, vacancesParSemaine = {}, joursOffWeekendParAssocie = {}, colonnesSouhaiteesParAssocie = {}, vacancesSouhaiteesParAssocie = {}) {
  if (!ini) return { indispo: false, tropProche: null, vacancesCollee: false, jourOffWE: false, souhaitColonne: null, souhaitVacancesCollee: false }
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
  // Souhait de vacances accolé (S ou S+1), seulement s'il ne s'agit pas déjà de vacances placées (dur).
  const souhaitVacancesCollee = !vacancesCollee && !!(vacancesSouhaiteesParAssocie?.[ini]?.has(num) || vacancesSouhaiteesParAssocie?.[ini]?.has(num + 1))
  return { indispo, tropProche, vacancesCollee, jourOffWE, souhaitColonne: Number.isInteger(col) ? col : null, souhaitVacancesCollee }
}

// Impact d'un week-end W sur les jours off (en semaine) d'un associé, via la trame principale :
// X assuré sur la colonne « avant-WE » en S(W) et « après-WE » en S(W+1), repos fixés par ces colonnes.
// - joursOffDetailParAssocie : { ini: { semaine: Set('lun'..'ven') } } (jours off en semaine)
// - avantReposJours / apresReposJours : Set('lun'..'ven') des repos de la colonne (null = non désignée)
// Renvoie { bloque, satisfait } : bloque = un jour off demandé non couvert par le repos de la colonne ;
// satisfait = un jour off demandé couvert (synergie, levier §7). Un set null → on ne juge pas ce côté.
export function impactJourOffWE(num, ini, joursOffDetailParAssocie = {}, avantReposJours = null, apresReposJours = null) {
  let bloque = false, satisfait = false
  const examiner = (reqSet, reposSet) => {
    if (!reqSet || reposSet == null) return
    for (const j of reqSet) {
      if (reposSet.has(j)) satisfait = true
      else bloque = true
    }
  }
  examiner(joursOffDetailParAssocie?.[ini]?.[num], avantReposJours)       // semaine W (avant-WE)
  examiner(joursOffDetailParAssocie?.[ini]?.[num + 1], apresReposJours)   // semaine W+1 (après-WE)
  return { bloque, satisfait }
}

// Proposition automatique (glouton déterministe, par numéro de semaine croissant).
// - weekendsPlage : [{ num, ... }] de la période à caler (ordre croissant attendu)
// - indispoParAssocie : { ini: Set(nums) }
// - objectifParAssocie : { ini: number|undefined } (objectif « G week-end »)
// - affectationsHorsPlage : affectations des autres périodes (pour l'espacement aux bords)
// - vacancesParSemaine : { num: [inis] } pour éviter une garde collée à des vacances (S ou S+1)
// - joursOffWeekendParAssocie : { ini: Set(nums) } jours off posés le sam/dim (= indispo de fait)
// - colonnesSouhaiteesParAssocie : { ini: { num: colIndex } } (souhait de colonne)
// - joursOffDetailParAssocie + avantReposJours/apresReposJours : pour éviter de bloquer un jour off
//   en semaine via la colonne avant/après-WE (et privilégier un week-end qui le satisfait).
// - dejaFait : { ini: number } week-ends DÉJÀ réalisés (Compteurs de référence, parties faites dans Excel) ;
//   quand fourni, sert de SOCLE du compteur de charge → plafond DUR « objectif annuel » respecté sans écart.
// - demandeParAssocie : { ini: number } volume de desiderata (scoreDemande) → arbitrage d'équité : un
//   week-end rapproché inévitable est chargé sur le PLUS demandeur (le moins-demandeur est protégé).
// - vacancesSouhaiteesParAssocie : { ini: Set(nums) } semaines de vacances SOUHAITÉES (desiderata) →
//   anticipation SOUPLE : on évite de coller un week-end de garde à un souhait de vacances (S ou S+1) dès
//   la 1ʳᵉ passe, SANS jamais bloquer (≠ vacances placées, dures). Si inévitable, charge le plus demandeur.
// Renvoie un objet { num: ini } limité aux week-ends de la plage.
export function proposerWeekends(weekendsPlage, indispoParAssocie, objectifParAssocie = {}, affectationsHorsPlage = {}, vacancesParSemaine = {}, joursOffWeekendParAssocie = {}, colonnesSouhaiteesParAssocie = {}, joursOffDetailParAssocie = {}, avantReposJours = null, apresReposJours = null, dejaFait = {}, demandeParAssocie = {}, vacancesSouhaiteesParAssocie = {}) {
  const resultat = {}
  // Compteur courant (hors-plage + ce qu'on attribue) : sert UNIQUEMENT à l'espacement.
  const courant = { ...affectationsHorsPlage }
  // Compteur de charge (équilibrage + plafond) : socle = référence si fournie (elle inclut déjà été/Noël →
  // pas de double-comptage), sinon repli sur le décompte hors-plage en base (comportement antérieur).
  const compte = {}
  for (const ini of ASSOCIES) compte[ini] = dejaFait[ini] != null ? dejaFait[ini] : semainesDe(ini, courant).length

  // Plafond DUR : un associé ayant atteint son objectif annuel n'est plus candidat (sans objectif → illimité).
  const sousPlafond = (ini) => objectifParAssocie[ini] == null || compte[ini] < objectifParAssocie[ini]

  const nums = weekendsPlage.map(w => w.num).sort((a, b) => a - b)
  for (const num of nums) {
    const espacementOk = (ini) =>
      semainesDe(ini, courant).every(n => Math.abs(n - num) >= ESPACEMENT_MIN)
    // Dispo = ni indisponible déclaré, ni jour off posé le sam/dim de ce week-end.
    const dispo = (ini) => !indispoParAssocie?.[ini]?.has(num) && !joursOffWeekendParAssocie?.[ini]?.has(num)
    const vacancesCollee = (ini) => vacancesParSemaine?.[num]?.includes(ini) || vacancesParSemaine?.[num + 1]?.includes(ini)
    const veutColonne = (ini) => Number.isInteger(colonnesSouhaiteesParAssocie?.[ini]?.[num])
    const bloque = (ini) => impactJourOffWE(num, ini, joursOffDetailParAssocie, avantReposJours, apresReposJours).bloque
    const satisfait = (ini) => impactJourOffWE(num, ini, joursOffDetailParAssocie, avantReposJours, apresReposJours).satisfait

    const demande = (ini) => demandeParAssocie[ini] ?? 0
    const creeRapproche = (ini) => !espacementOk(ini) // week-end déjà attribué à < ESPACEMENT_MIN
    // Souhait de vacances de l'associé accolé à ce week-end (S = même semaine, ou S+1 = week-end juste
    // avant le souhait) → à éviter (souple), pour ne pas se coincer sur une future semaine de congé.
    const souhaiteVacCollee = (ini) =>
      !!(vacancesSouhaiteesParAssocie?.[ini]?.has(num) || vacancesSouhaiteesParAssocie?.[ini]?.has(num + 1))

    // Le plafond DUR (sousPlafond) ET la garde collée à des vacances (!vacancesCollee) sont appliqués à
    // CHAQUE niveau : on relâche les contraintes souples (espacement, blocage) mais JAMAIS l'objectif
    // annuel ni le collage vacances. Si seuls restent des candidats collés-vacances → pool vide → vide.
    let candidats = ASSOCIES.filter(ini => sousPlafond(ini) && dispo(ini) && !vacancesCollee(ini) && espacementOk(ini) && !bloque(ini))
    if (candidats.length === 0) candidats = ASSOCIES.filter(ini => sousPlafond(ini) && dispo(ini) && !vacancesCollee(ini) && !bloque(ini)) // relâche l'espacement
    if (candidats.length === 0) candidats = ASSOCIES.filter(ini => sousPlafond(ini) && dispo(ini) && !vacancesCollee(ini)) // relâche le non-blocage
    if (candidats.length === 0) continue // personne sous plafond/dispo/non-collé → laissé vide, le faiseur tranche

    // Équilibrage d'abord ; éviter un week-end rapproché, sinon le charger sur le plus demandeur (équité) ;
    // synergie (le week-end satisfait un jour off) ; pénalité souhait de colonne ; déficit vs objectif ; ordre figé.
    candidats.sort((a, b) => {
      if (compte[a] !== compte[b]) return compte[a] - compte[b]
      // Anticiper les souhaits de vacances : éviter de coller le week-end à un souhait (souple) ; si les
      // deux collent, charger le plus demandeur (équité, le moins-demandeur protégé).
      const svA = souhaiteVacCollee(a) ? 1 : 0
      const svB = souhaiteVacCollee(b) ? 1 : 0
      if (svA !== svB) return svA - svB
      if (svA && svB && demande(a) !== demande(b)) return demande(b) - demande(a)
      const rapA = creeRapproche(a) ? 1 : 0
      const rapB = creeRapproche(b) ? 1 : 0
      if (rapA !== rapB) return rapA - rapB
      if (rapA && rapB && demande(a) !== demande(b)) return demande(b) - demande(a)
      const synA = satisfait(a) ? 0 : 1
      const synB = satisfait(b) ? 0 : 1
      if (synA !== synB) return synA - synB
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
