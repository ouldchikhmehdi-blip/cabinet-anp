// ============================================================
// vacances.js — modèle + logique de positionnement des vacances (PLANNING.md §8, §12).
// Plusieurs associés possibles par semaine (au moins 1 visé). Persistance dans
// vacancesApi.js. Une semaine est identifiée par son numéro de semaine ISO.
//
// data = { v, vacances: { <numSemaineISO>: [<initiales>, …] }, places: { <numSemaineISO>: N } }
// `places` = nombre de POSTES de vacances ouverts sur une semaine (capacité voulue par le faiseur),
// stocké uniquement quand il diffère du défaut (couverture minimale : 1, ou 2 en vacances scolaires).
// `verrous` = associés FORCÉS à la main sur une semaine : « Proposer automatiquement » les préserve.
// ============================================================
import { ASSOCIES } from '../data/associes'

export const VERSION_VAC = 1

// Espacement souhaité entre deux semaines de vacances d'un même associé (règle MOLLE) :
// on évite d'avoir deux congés à moins de 4 semaines d'écart (« deux sur quatre »).
export const ESPACEMENT_VAC_MIN = 4

export function vacancesVide() {
  return { v: VERSION_VAC, vacances: {}, places: {}, verrous: {} }
}

export function normaliserVacances(data) {
  const srcV = data?.vacances && typeof data.vacances === 'object' ? data.vacances : {}
  const vacances = {}
  for (const [num, inis] of Object.entries(srcV)) {
    if (Array.isArray(inis) && inis.length) vacances[Number(num)] = inis.filter(Boolean)
  }
  const srcP = data?.places && typeof data.places === 'object' ? data.places : {}
  const places = {}
  for (const [num, n] of Object.entries(srcP)) {
    // n peut valoir 0 : le faiseur a explicitement fermé tous les postes de cette semaine.
    if (Number.isInteger(n) && n >= 0) places[Number(num)] = n
  }
  // Verrous : uniquement des associés réellement placés cette semaine.
  const srcVer = data?.verrous && typeof data.verrous === 'object' ? data.verrous : {}
  const verrous = {}
  for (const [num, inis] of Object.entries(srcVer)) {
    const n = Number(num)
    const valides = (Array.isArray(inis) ? inis : []).filter(i => vacances[n]?.includes(i))
    if (valides.length) verrous[n] = valides
  }
  return { v: VERSION_VAC, vacances, places, verrous }
}

// Analyse une semaine : conflits de couverture / refus / week-end de garde collé.
//   sansVacance : aucun associé en congé
//   refus       : associés affectés qui ont refusé cette semaine (desiderata)
//   sousScolaire: semaine de vacances scolaires avec moins de 2 associés en congé
//   gardeCollee : associés en congé qui sont de garde le week-end de la semaine (S)
//                 ou du week-end précédent (S-1) — règle : jamais de vacances accolées
//                 à un week-end de garde (avant comme après).
//   souhaitColonne : associés mis en congé qui avaient souhaité une colonne (travailler) cette
//                    semaine — le congé contredit ce souhait.
//   rapprochees : associés ayant une AUTRE semaine de congé à moins de ESPACEMENT_VAC_MIN
//                 (règle molle : on évite deux congés trop rapprochés ; alerte seulement).
export function analyserSemaine(num, inis, refusParAssocie, estScolaire, weekendAff = {}, colonnesSouhaiteesParAssocie = {}, semainesVacancesParAssocie = {}) {
  const liste = inis ?? []
  return {
    sansVacance: liste.length === 0,
    refus: liste.filter(i => refusParAssocie?.[i]?.has(num)),
    sousScolaire: !!estScolaire && liste.length < 2,
    gardeCollee: liste.filter(i => weekendAff?.[num] === i || weekendAff?.[num - 1] === i),
    souhaitColonne: liste.filter(i => Number.isInteger(colonnesSouhaiteesParAssocie?.[i]?.[num])),
    rapprochees: liste.filter(i => (semainesVacancesParAssocie?.[i] ?? []).some(w => w !== num && Math.abs(w - num) < ESPACEMENT_VAC_MIN)),
  }
}

// Proposition automatique (déterministe, aucun Math.random/Date.now).
// - semainesPlage : [{ num, ... }] de la période
// - souhaitParAssocie / refusParAssocie : { ini: Set(nums) }
// - scolairesSet : Set(nums) des semaines de vacances scolaires (couverture min = 2)
// - vacancesHorsPlage : { num: [inis] } des autres périodes (pour l'équilibrage)
// - weekendAff : { num: ini } affectations week-end (pour éviter une garde collée)
// - placesParSemaine : { num: N } postes ouverts par le faiseur (sinon défaut 1, ou 2 en scolaire)
// - verrousParSemaine : { num: [inis] } associés FORCÉS (verrouillés) → préservés, posés en premier
// Renvoie { num: [inis] } pour la plage.
export function proposerVacances(semainesPlage, souhaitParAssocie, refusParAssocie, scolairesSet, vacancesHorsPlage = {}, weekendAff = {}, colonnesSouhaiteesParAssocie = {}, placesParSemaine = {}, verrousParSemaine = {}) {
  const resultat = {}
  // Compteur de semaines par associé (hors-plage + ce qu'on attribue) pour l'équilibrage.
  const compte = {}
  for (const ini of ASSOCIES) compte[ini] = 0
  for (const inis of Object.values(vacancesHorsPlage)) {
    for (const ini of inis) if (compte[ini] != null) compte[ini]++
  }

  const nums = semainesPlage.map(s => s.num).sort((a, b) => a - b)

  // Semaines de congé déjà connues par associé (hors-plage), pour l'espacement souple.
  const semParAssocie = {}
  for (const ini of ASSOCIES) semParAssocie[ini] = []
  for (const [num, inis] of Object.entries(vacancesHorsPlage)) {
    for (const ini of inis) if (semParAssocie[ini]) semParAssocie[ini].push(Number(num))
  }

  // 0) Verrous (forcés par le faiseur) : posés en premier, ils sont préservés et comptés.
  for (const num of nums) {
    const forces = (verrousParSemaine?.[num] ?? []).filter(Boolean)
    resultat[num] = [...forces]
    for (const ini of forces) { if (compte[ini] != null) compte[ini]++; semParAssocie[ini]?.push(num) }
  }

  // 1) Souhaits ensuite (hors refus, sans doublon) — on respecte le souhait même rapproché.
  for (const num of nums) {
    const souhaits = ASSOCIES.filter(ini => souhaitParAssocie?.[ini]?.has(num) && !refusParAssocie?.[ini]?.has(num) && !resultat[num].includes(ini))
    for (const ini of souhaits) { resultat[num].push(ini); compte[ini]++; semParAssocie[ini].push(num) }
  }

  // 2) Couverture minimale (1, ou 2 en semaine scolaire) avec les moins chargés, hors refus.
  for (const num of nums) {
    // Cible = postes ouverts par le faiseur, sinon couverture minimale (2 en scolaire, 1 sinon).
    const min = placesParSemaine?.[num] ?? (scolairesSet?.has(num) ? 2 : 1)
    const gardeCollee = (ini) => weekendAff?.[num] === ini || weekendAff?.[num - 1] === ini
    const veutColonne = (ini) => Number.isInteger(colonnesSouhaiteesParAssocie?.[ini]?.[num])
    // Règle molle : éviter deux congés du même associé à moins de ESPACEMENT_VAC_MIN.
    const rapproche = (ini) => semParAssocie[ini].some(w => Math.abs(w - num) < ESPACEMENT_VAC_MIN)
    while (resultat[num].length < min) {
      const base = ASSOCIES.filter(ini => !resultat[num].includes(ini) && !refusParAssocie?.[ini]?.has(num))
      // Éviter garde collée ET congés rapprochés ; on relâche progressivement si la couverture l'exige.
      let candidats = base.filter(ini => !gardeCollee(ini) && !rapproche(ini))
      if (candidats.length === 0) candidats = base.filter(ini => !gardeCollee(ini)) // relâche l'espacement
      if (candidats.length === 0) candidats = base                                  // relâche la garde collée
      if (candidats.length === 0) break
      // Moins chargé d'abord ; on déprioritise un souhait de colonne (le congé le contredirait).
      candidats.sort((a, b) =>
        (compte[a] - compte[b]) ||
        ((veutColonne(a) ? 1 : 0) - (veutColonne(b) ? 1 : 0)) ||
        (ASSOCIES.indexOf(a) - ASSOCIES.indexOf(b))
      )
      const choisi = candidats[0]
      resultat[num].push(choisi)
      compte[choisi]++
      semParAssocie[choisi].push(num)
    }
  }
  return resultat
}
