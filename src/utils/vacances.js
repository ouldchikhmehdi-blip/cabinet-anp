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

// Vide le remplissage automatique en CONSERVANT les congés verrouillés par le faiseur.
// Les capacités voulues (`places`) sont aussi conservées (décision du faiseur). Repart d'une
// donnée normalisée ; normaliserVacances garantit déjà l'invariant verrous ⊆ vacances.
export function viderSaufVerrous(data) {
  const d = normaliserVacances(data)
  const vacances = {}
  for (const [num, inis] of Object.entries(d.verrous)) {
    if (inis.length) vacances[Number(num)] = [...inis]
  }
  return normaliserVacances({ v: VERSION_VAC, vacances, places: d.places, verrous: d.verrous })
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
//   souhaitNonRealise : associés qui avaient SOUHAITÉ un congé cette semaine mais n'y sont pas placés
//                       (capacité atteinte, verrous…) — souhait non réalisé.
export function analyserSemaine(num, inis, refusParAssocie, estScolaire, weekendAff = {}, colonnesSouhaiteesParAssocie = {}, semainesVacancesParAssocie = {}, souhaitParAssocie = {}) {
  const liste = inis ?? []
  return {
    sansVacance: liste.length === 0,
    refus: liste.filter(i => refusParAssocie?.[i]?.has(num)),
    sousScolaire: !!estScolaire && liste.length < 2,
    gardeCollee: liste.filter(i => weekendAff?.[num] === i || weekendAff?.[num - 1] === i),
    souhaitColonne: liste.filter(i => Number.isInteger(colonnesSouhaiteesParAssocie?.[i]?.[num])),
    rapprochees: liste.filter(i => (semainesVacancesParAssocie?.[i] ?? []).some(w => w !== num && Math.abs(w - num) < ESPACEMENT_VAC_MIN)),
    souhaitNonRealise: ASSOCIES.filter(i => souhaitParAssocie?.[i]?.has(num) && !liste.includes(i)),
  }
}

// Proposition automatique (déterministe, aucun Math.random/Date.now).
// - semainesPlage : [{ num, ... }] de la période
// - souhaitParAssocie / refusParAssocie : { ini: Set(nums) }
// - scolairesSet : Set(nums) des semaines de vacances scolaires (couverture min = 2)
// - vacancesHorsPlage : { num: [inis] } des autres périodes (pour l'équilibrage)
// - weekendAff : { num: ini } affectations week-end (pour éviter une garde collée)
// - placesParSemaine : { num: N } postes ouverts par le faiseur (sinon défaut 1, 2 en scolaire, 3 Toussaint)
// - verrousParSemaine : { num: [inis] } associés FORCÉS (verrouillés) → préservés, posés en premier
// - toussaintSet : Set(nums) des semaines de vacances de la Toussaint (couverture par défaut = 3)
// - demandeParAssocie : { ini: number } volume de desiderata (scoreDemande) → arbitrage d'équité : un congé
//   rapproché inévitable est chargé sur le PLUS demandeur (le moins-demandeur est protégé).
// RÈGLE DURE : jamais de congé collé à un week-end de garde du même associé (S ou S-1) en automatique — ni
// en couverture, ni même sur un souhait ; le faiseur reste libre de forcer (verrou) ou de déplacer le WE.
// Renvoie { num: [inis] } pour la plage.
export function proposerVacances(semainesPlage, souhaitParAssocie, refusParAssocie, scolairesSet, vacancesHorsPlage = {}, weekendAff = {}, colonnesSouhaiteesParAssocie = {}, placesParSemaine = {}, verrousParSemaine = {}, toussaintSet = new Set(), demandeParAssocie = {}) {
  const resultat = {}
  const demande = (ini) => demandeParAssocie[ini] ?? 0
  // Congé collé à un week-end de garde du même associé : la semaine du WE (S) ou celle d'après (S-1).
  const gardeColleeWE = (num, ini) => weekendAff?.[num] === ini || weekendAff?.[num - 1] === ini
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

  // 1) Souhaits ensuite (hors refus, sans doublon) — DANS LA LIMITE DE LA CAPACITÉ de la semaine.
  //    On ne crée jamais de poste au-delà de la capacité (postes ouverts) : si elle est déjà atteinte
  //    (ex. verrous), le souhait reste non réalisé (signalé dans l'UI). À postes insuffisants, on sert
  //    les moins chargés d'abord (déterministe).
  for (const num of nums) {
    const cap = placesParSemaine?.[num] ?? (toussaintSet?.has(num) ? 3 : scolairesSet?.has(num) ? 2 : 1)
    // Règle dure : un souhait collé à un week-end de garde n'est PAS placé automatiquement (il devient
    // « souhait non réalisé », signalé ; le faiseur peut le forcer via un verrou).
    const souhaits = ASSOCIES
      .filter(ini => souhaitParAssocie?.[ini]?.has(num) && !refusParAssocie?.[ini]?.has(num) && !resultat[num].includes(ini) && !gardeColleeWE(num, ini))
      .sort((a, b) => (compte[a] - compte[b]) || (ASSOCIES.indexOf(a) - ASSOCIES.indexOf(b)))
    for (const ini of souhaits) {
      if (resultat[num].length >= cap) break // capacité atteinte : souhait non réalisé
      resultat[num].push(ini); compte[ini]++; semParAssocie[ini].push(num)
    }
  }

  // 2) Couverture minimale (1, ou 2 en semaine scolaire) avec les moins chargés, hors refus.
  for (const num of nums) {
    // Cible = postes ouverts par le faiseur, sinon couverture minimale (3 Toussaint, 2 scolaire, 1 sinon).
    const min = placesParSemaine?.[num] ?? (toussaintSet?.has(num) ? 3 : scolairesSet?.has(num) ? 2 : 1)
    const gardeCollee = (ini) => gardeColleeWE(num, ini)
    const veutColonne = (ini) => Number.isInteger(colonnesSouhaiteesParAssocie?.[ini]?.[num])
    // Règle molle : éviter deux congés du même associé à moins de ESPACEMENT_VAC_MIN.
    const rapproche = (ini) => semParAssocie[ini].some(w => Math.abs(w - num) < ESPACEMENT_VAC_MIN)
    while (resultat[num].length < min) {
      const base = ASSOCIES.filter(ini => !resultat[num].includes(ini) && !refusParAssocie?.[ini]?.has(num))
      // RÈGLE DURE : jamais de congé collé à un week-end de garde → on ne relâche QUE l'espacement, jamais
      // la garde collée. S'il ne reste que des candidats collés → on n'attribue pas (le faiseur tranche).
      let candidats = base.filter(ini => !gardeCollee(ini) && !rapproche(ini))
      if (candidats.length === 0) candidats = base.filter(ini => !gardeCollee(ini)) // relâche l'espacement seulement
      if (candidats.length === 0) break
      // Moins chargé d'abord ; éviter un congé rapproché, sinon le charger sur le plus demandeur (équité) ;
      // on déprioritise un souhait de colonne (le congé le contredirait).
      candidats.sort((a, b) =>
        (compte[a] - compte[b]) ||
        ((rapproche(a) ? 1 : 0) - (rapproche(b) ? 1 : 0)) ||
        (rapproche(a) && rapproche(b) ? (demande(b) - demande(a)) : 0) ||
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

// Optimisation par RECHERCHE LOCALE (hill-climbing déterministe) de l'affectation des congés sur la
// plage : part de l'état COURANT et tente des remplacements / échanges / ajouts (jamais sur un verrou,
// jamais une suppression) pour réduire un score LEXICOGRAPHIQUE. Priorités, du + au - important :
//   1) souhaits de congé non réalisés   2) déséquilibre entre associés   3) congés rapprochés.
// Règles DURES préservées : jamais un refus, jamais collé à un week-end de garde, capacité respectée,
// couverture jamais diminuée (aucune suppression). Déterministe (aucun Math.random/Date.now) et
// IDEMPOTENTE : sur un optimum local elle renvoie l'état inchangé.
// Mêmes entrées que proposerVacances + `affectationPlage` = { num: [inis] } actuel (borné à la plage).
// Renvoie { num: [inis] } pour la plage.
export function optimiserVacances(semainesPlage, affectationPlage = {}, souhaitParAssocie = {}, refusParAssocie = {}, scolairesSet = new Set(), vacancesHorsPlage = {}, weekendAff = {}, placesParSemaine = {}, verrousParSemaine = {}, toussaintSet = new Set()) {
  const nums = semainesPlage.map(s => s.num).sort((a, b) => a - b)
  const cap = (num) => placesParSemaine?.[num] ?? (toussaintSet?.has(num) ? 3 : scolairesSet?.has(num) ? 2 : 1)
  const refus = (num, ini) => !!refusParAssocie?.[ini]?.has(num)
  const gardeCollee = (num, ini) => weekendAff?.[num] === ini || weekendAff?.[num - 1] === ini
  const eligible = (num, ini) => !refus(num, ini) && !gardeCollee(num, ini)
  const verrou = (num, ini) => (verrousParSemaine?.[num] ?? []).includes(ini)

  // État de travail, borné à la plage (les congés hors-plage sont fixes).
  const etat = {}
  for (const num of nums) etat[num] = [...(affectationPlage?.[num] ?? [])].filter(Boolean)

  // Contributions hors-plage (constantes) au comptage (équilibre) et aux semaines (espacement).
  const horsCount = {}; const horsWeeks = {}
  for (const ini of ASSOCIES) { horsCount[ini] = 0; horsWeeks[ini] = [] }
  for (const [num, inis] of Object.entries(vacancesHorsPlage)) {
    for (const ini of (inis ?? [])) if (horsCount[ini] != null) { horsCount[ini]++; horsWeeks[ini].push(Number(num)) }
  }

  // Score lexicographique (poids décroissants : souhaits ≫ équilibre ≫ rapprochés).
  const score = () => {
    const count = {}; const weeksPlage = {}
    for (const ini of ASSOCIES) { count[ini] = horsCount[ini]; weeksPlage[ini] = [] }
    for (const num of nums) for (const ini of etat[num]) { count[ini]++; weeksPlage[ini].push(num) }
    // 1) souhaits non réalisés mais RÉALISABLES (éligibles) sur la plage.
    let souhNon = 0
    for (const num of nums) for (const ini of ASSOCIES) {
      if (souhaitParAssocie?.[ini]?.has(num) && !etat[num].includes(ini) && eligible(num, ini)) souhNon++
    }
    // 2) déséquilibre = variance des compteurs par associé.
    let total = 0; for (const ini of ASSOCIES) total += count[ini]
    const moy = total / ASSOCIES.length
    let varc = 0; for (const ini of ASSOCIES) { const d = count[ini] - moy; varc += d * d }
    // 3) congés rapprochés (autre congé du même associé à < ESPACEMENT_VAC_MIN, hors-plage compris).
    let rappr = 0
    for (const num of nums) for (const ini of etat[num]) {
      const proche = horsWeeks[ini].some(w => Math.abs(w - num) < ESPACEMENT_VAC_MIN)
        || weeksPlage[ini].some(w => w !== num && Math.abs(w - num) < ESPACEMENT_VAC_MIN)
      if (proche) rappr++
    }
    return souhNon * 1e6 + varc * 1e3 + rappr
  }

  const enleve = (num, ini) => { const a = etat[num]; const i = a.indexOf(ini); if (i >= 0) a.splice(i, 1) }
  const ajoute = (num, ini) => { etat[num].push(ini) }

  const MAX_IT = 500 // garde-fou : le score décroît STRICTEMENT à chaque pas, donc on converge avant.
  for (let it = 0; it < MAX_IT; it++) {
    let meilleurScore = score()
    let meilleurMove = null
    const evalueEtMemo = (move) => { const s = score(); if (s < meilleurScore - 1e-9) { meilleurScore = s; meilleurMove = move } }

    // A) REMPLACER A (non verrouillé) par B éligible (coverage inchangée).
    for (const num of nums) for (const A of [...etat[num]]) {
      if (verrou(num, A)) continue
      for (const B of ASSOCIES) {
        if (B === A || etat[num].includes(B) || !eligible(num, B)) continue
        enleve(num, A); ajoute(num, B)
        evalueEtMemo({ type: 'rep', num, A, B })
        enleve(num, B); ajoute(num, A)
      }
    }
    // B) ÉCHANGER A@n1 ↔ B@n2 (deux non verrouillés ; coverage inchangée).
    for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) {
      const n1 = nums[i], n2 = nums[j]
      for (const A of [...etat[n1]]) {
        if (verrou(n1, A)) continue
        for (const B of [...etat[n2]]) {
          if (verrou(n2, B) || B === A || etat[n2].includes(A) || etat[n1].includes(B)) continue
          if (!eligible(n2, A) || !eligible(n1, B)) continue
          enleve(n1, A); ajoute(n1, B); enleve(n2, B); ajoute(n2, A)
          evalueEtMemo({ type: 'swap', n1, n2, A, B })
          enleve(n1, B); ajoute(n1, A); enleve(n2, A); ajoute(n2, B)
        }
      }
    }
    // C) AJOUTER B dans un poste libre (jamais au-delà de la capacité ouverte → ne crée pas de poste).
    for (const num of nums) {
      if (etat[num].length >= cap(num)) continue
      for (const B of ASSOCIES) {
        if (etat[num].includes(B) || !eligible(num, B)) continue
        ajoute(num, B)
        evalueEtMemo({ type: 'add', num, B })
        enleve(num, B)
      }
    }

    if (!meilleurMove) break // optimum local atteint
    const m = meilleurMove
    if (m.type === 'rep') { enleve(m.num, m.A); ajoute(m.num, m.B) }
    else if (m.type === 'swap') { enleve(m.n1, m.A); ajoute(m.n1, m.B); enleve(m.n2, m.B); ajoute(m.n2, m.A) }
    else ajoute(m.num, m.B)
  }

  for (const num of nums) etat[num].sort((a, b) => ASSOCIES.indexOf(a) - ASSOCIES.indexOf(b))
  return etat
}

// Convertit les PRÉFÉRENCES de vacances scolaires en semaines ISO concrètes à injecter dans
// `souhaitParAssocie` (sinon le souhait scolaire n'est jamais positionné — cf. PLANNING.md §8).
//   blocs : { fevrier:[], paques:[], toussaint:[] } triés croissant (cf. blocsVacancesScolaires).
//   prefParAssocie : { ini: { periode:'fevrier'|'paques'|null, sem:'s1'|'s2'|'indifferent'|null,
//                             tousSouhaitee:bool, tousSem:'s1'|'s2'|'indifferent'|null } }
//   « s1 » → 1ʳᵉ semaine du bloc ; « s2 » → 2ᵉ (repli sur la 1ʳᵉ si le bloc n'a qu'une semaine) ;
//   « indifferent » → UNE seule semaine, répartie pour ÉQUILIBRER la couverture entre 1ʳᵉ et 2ᵉ
//   (déterministe : ordre de ASSOCIES, égalité → 1ʳᵉ ; aucun Math.random/Date.now).
// → { ini: number[] } (un associé peut cumuler une période scolaire ET la Toussaint).
export function semainesSouhaitScolaire(blocs, prefParAssocie = {}) {
  const out = {}
  const ajouter = (ini, sem) => { if (sem != null) (out[ini] ??= []).push(sem) }

  // Place tous les associés d'une période ; `choixDe` renvoie 's1'|'s2'|'indifferent'|null.
  const placerPeriode = (bloc, choixDe) => {
    if (!Array.isArray(bloc) || bloc.length === 0) return
    const b0 = bloc[0]
    const b1 = bloc[1] ?? bloc[0]
    let cnt0 = 0, cnt1 = 0
    const indiff = []
    for (const ini of ASSOCIES) {
      const sem = choixDe(prefParAssocie[ini])
      if (sem === 's1') { ajouter(ini, b0); cnt0++ }
      else if (sem === 's2') { ajouter(ini, b1); if (b1 === b0) cnt0++; else cnt1++ }
      else if (sem === 'indifferent') indiff.push(ini)
    }
    // « peu importe » : on équilibre 1ʳᵉ/2ᵉ semaine (la moins chargée d'abord).
    for (const ini of indiff) {
      if (cnt0 <= cnt1) { ajouter(ini, b0); cnt0++ }
      else { ajouter(ini, b1); cnt1++ }
    }
  }

  placerPeriode(blocs?.fevrier, p => (p?.periode === 'fevrier' ? p.sem : null))
  placerPeriode(blocs?.paques, p => (p?.periode === 'paques' ? p.sem : null))
  placerPeriode(blocs?.toussaint, p => (p?.tousSouhaitee === true ? (p.tousSem ?? 'indifferent') : null))

  for (const ini of Object.keys(out)) out[ini] = [...new Set(out[ini])].sort((a, b) => a - b)
  return out
}
