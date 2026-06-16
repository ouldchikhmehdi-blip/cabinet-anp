// ============================================================
// semaines.js — étape « En semaine » (PLANNING.md §12.3).
// 1) Quelle TRAME du catalogue est appliquée à chaque semaine (trameParSemaine).
// 2) Remplissage des COLONNES : quel associé occupe chaque colonne libre de la trame, chaque
//    semaine. Attribuer une colonne attribue d'emblée sa garde/astreinte ET son repos.
//    Les colonnes spéciales (rea/vacances/avantWE/apresWE) sont DÉRIVÉES des étapes précédentes
//    (non stockées). Les colonnes remplaçant sont externes (jamais un des 8 associés).
//
// data = { v, trameParSemaine:{<num>:trameId}, affectations:{<num>:{<colIndex>:ini}}, verrous:{<num>:[colIndex]} }
//   - affectations : colonnes LIBRES uniquement (les spéciales se dérivent).
//   - verrous      : colonnes (libres) forcées à la main, préservées par « Proposer ».
//
// Garde de SEMAINE = jour où l'associé est sur la colonne de service ET typeDuJour==='G' :
//   mardi (toujours) + jeudi (si base calendrier = G). Lundi/mercredi = astreinte (non comptés).
//   Vendredi = à part (suivi Objectifs). Pénibilité : ≥ 1 semaine entre deux gardes (cf. §12).
// ============================================================
import { ASSOCIES } from '../data/associes'
import { JOURS, colonnesSelectionnables, capaciteVacances } from './trames'
import { typeDuJour, lundiDeSemaineISO } from './calendrier'

export const VERSION_SEMAINES = 2

const JOUR_MS = 24 * 60 * 60 * 1000
// Espacement souhaité entre deux gardes d'un même associé (pénibilité). En dessous : alerte.
export const ESPACEMENT_GARDE_JOURS = 7
// Offsets des jours de GARDE possibles en semaine : mardi (1, toujours G) et jeudi (3, si G).
const OFFSETS_GARDE_SEMAINE = [1, 3]

export function semainesVide() {
  return { v: VERSION_SEMAINES, trameParSemaine: {}, affectations: {}, verrous: {} }
}

// Normalise un data stocké. Tolère l'ancien format v1 (sans affectations/verrous).
export function normaliserSemaines(data) {
  const srcT = data?.trameParSemaine && typeof data.trameParSemaine === 'object' ? data.trameParSemaine : {}
  const trameParSemaine = {}
  for (const [num, id] of Object.entries(srcT)) {
    if (Number.isInteger(id)) trameParSemaine[Number(num)] = id
  }
  const srcA = data?.affectations && typeof data.affectations === 'object' ? data.affectations : {}
  const affectations = {}
  for (const [num, cols] of Object.entries(srcA)) {
    if (!cols || typeof cols !== 'object') continue
    const m = {}
    for (const [col, ini] of Object.entries(cols)) {
      if (Number.isInteger(Number(col)) && Number(col) >= 0 && ini) m[Number(col)] = ini
    }
    if (Object.keys(m).length) affectations[Number(num)] = m
  }
  const srcV = data?.verrous && typeof data.verrous === 'object' ? data.verrous : {}
  const verrous = {}
  for (const [num, cols] of Object.entries(srcV)) {
    const liste = (Array.isArray(cols) ? cols : []).map(Number).filter(c => affectations[Number(num)]?.[c] != null)
    if (liste.length) verrous[Number(num)] = liste
  }
  return { v: VERSION_SEMAINES, trameParSemaine, affectations, verrous }
}

// Trame effective d'une semaine, avec REPLI AUTOMATIQUE selon le nombre de vacanciers :
//   - choix explicite (trameParSemaine) → prioritaire (même s'il est « insuffisant ») ;
//   - sinon la principale si sa capacité vacances suffit ;
//   - sinon la plus PETITE trame dont la capacité vacances ≥ nbVacanciers (tie-break : id) ;
//   - sinon (aucune suffisante) la principale, sinon la trame de plus grande capacité.
// Renvoie { trame, estPrincipale, repli } (trame:null si le catalogue est vide).
//   estPrincipale → pilote les souhaits de colonne ; repli → l'outil a dévié de la principale.
export function resoudreTrame({ trames = [], tramesById = {}, principaleId = null, choisiId = null, nbVacanciers = 0 }) {
  if (choisiId != null) {
    const trame = tramesById[choisiId] ?? null
    return { trame, estPrincipale: choisiId === principaleId, repli: false }
  }
  const principale = principaleId != null ? (tramesById[principaleId] ?? null) : null
  if (principale && capaciteVacances(principale) >= nbVacanciers) {
    return { trame: principale, estPrincipale: true, repli: false }
  }
  const suffisantes = trames.filter(t => capaciteVacances(t) >= nbVacanciers)
  if (suffisantes.length) {
    const trame = [...suffisantes].sort((a, b) => (capaciteVacances(a) - capaciteVacances(b)) || (a.id - b.id))[0]
    return { trame, estPrincipale: trame.id === principaleId, repli: trame.id !== principaleId }
  }
  if (principale) return { trame: principale, estPrincipale: true, repli: false }
  const trame = [...trames].sort((a, b) => (capaciteVacances(b) - capaciteVacances(a)) || (a.id - b.id))[0] ?? null
  return { trame, estPrincipale: trame != null && trame.id === principaleId, repli: trame != null }
}

// Jours de repos d'une colonne (cellules vides) → Set('lun'..'ven').
export function reposJours(col) {
  return new Set(JOURS.filter(j => !(col?.[j] ?? '').trim()))
}

// Colonnes spéciales RÉSOLUES (dérivées des étapes précédentes) → { <colIndex>: ini }.
//   rea→rea[num] ; vacances→un vacancier par colonne vacances ; avantWE→week-end de la semaine ;
//   apresWE→week-end précédent.
export function colonnesSpeciales(trame, num, { rea = {}, vacances = {}, weekendAff = {} } = {}) {
  const map = {}
  // La VACANCE est prioritaire : un associé en congé cette semaine n'occupe QUE sa colonne vacances,
  // jamais une colonne de travail (réa / avant-WE / après-WE) même si une étape amont l'y a désigné
  // (ex. week-end attribué à un vacancier). On ignore alors l'occupant dérivé → la colonne sera pourvue
  // par le moteur (colonnesAPourvoir) et l'incohérence amont est signalée par une alerte.
  const enVacances = new Set(vacances[num] ?? [])
  const placerTravail = (col, ini) => { if (col != null && ini && !enVacances.has(ini)) map[col] = ini }
  placerTravail(trame?.rea, rea[num])
  // Pairage vacancier ↔ colonne vacances : le i-ᵉ congé de la semaine va sur la i-ᵉ colonne vacances.
  if (Array.isArray(trame?.vacances) && vacances[num]?.length) {
    trame.vacances.forEach((col, i) => { if (vacances[num][i] != null) map[col] = vacances[num][i] })
  }
  placerTravail(trame?.avantWE, weekendAff[num])
  placerTravail(trame?.apresWE, weekendAff[num - 1])
  return map
}

// Affectation COMPLÈTE résolue d'une semaine (spéciales dérivées + libres stockées) → { col: ini }.
// Les colonnes remplaçant restent vides (personnes externes).
export function affectationResolue(trame, num, contexteAmont, affectationsLibres = {}) {
  return { ...colonnesSpeciales(trame, num, contexteAmont), ...(affectationsLibres[num] ?? {}) }
}

// Colonnes que le moteur doit POURVOIR avec un associé cette semaine : les colonnes libres
// (colonnesSelectionnables) PLUS les colonnes de travail spéciales (rea/avantWE/apresWE) restées SANS
// occupant dérivé (absentes de `spec`, ex. après-WE en 1ʳᵉ semaine ou étape Week-ends/Réa non faite).
// Exclut les colonnes vacances (repos) et remplaçant (personne externe). Évite qu'une colonne de travail
// reste vide pendant qu'un associé est « non placé ».
export function colonnesAPourvoir(trame, spec = {}) {
  const cols = [...colonnesSelectionnables(trame)]
  for (const col of [trame?.rea, trame?.avantWE, trame?.apresWE]) {
    if (col != null && spec[col] == null && !cols.includes(col)) cols.push(col)
  }
  return cols.sort((a, b) => a - b)
}

// Dates des gardes de SEMAINE qu'une colonne génère cette semaine-là (0, 1 ou 2 dates).
export function datesGardeSemaine(trame, colIndex, annee, num, calendrier) {
  const col = trame?.colonnes?.[colIndex]
  if (!col) return []
  const lundi = lundiDeSemaineISO(annee, num)
  const dates = []
  for (const offset of OFFSETS_GARDE_SEMAINE) {
    const jour = JOURS[offset] // mardi / jeudi
    if (col.service?.[jour] && typeDuJour(calendrier, num, offset) === 'G') {
      dates.push(new Date(lundi.getTime() + offset * JOUR_MS))
    }
  }
  return dates
}

// Date de la garde de week-end (dimanche) d'une semaine.
export function dateGardeWeekend(annee, num) {
  return new Date(lundiDeSemaineISO(annee, num).getTime() + 6 * JOUR_MS)
}

// Écart minimal (en jours) entre des dates candidates et les gardes déjà connues d'un associé.
function ecartMinJours(datesCandidates, gardesConnues) {
  let m = Infinity
  for (const d of datesCandidates) {
    for (const g of gardesConnues) {
      const e = Math.abs(d.getTime() - g.getTime()) / JOUR_MS
      if (e < m) m = e
    }
  }
  return m
}

// Gardes de week-end (dimanche) par associé, sur les semaines fournies → { ini: [Date] }.
export function gardesWeekendParAssocie(weeks, annee, weekendAff = {}) {
  const m = {}
  for (const ini of ASSOCIES) m[ini] = []
  for (const num of weeks) {
    const ini = weekendAff[num]
    if (ini && m[ini]) m[ini].push(dateGardeWeekend(annee, num))
  }
  return m
}

// Gardes de SEMAINE (dates + comptes) sur les semaines fournies, d'après les affectations résolues
// (spéciales + libres stockées). Sert à initialiser l'équilibre annuel (semaines hors-plage).
//   trameDe(num) → trame résolue | null.
export function gardesSemaineParAssocie(weeks, annee, calendrier, trameDe, contexteAmont, affectationsLibres = {}) {
  const dates = {}; const comptes = {}
  for (const ini of ASSOCIES) { dates[ini] = []; comptes[ini] = 0 }
  for (const num of weeks) {
    const trame = trameDe(num)
    if (!trame) continue
    const aff = affectationResolue(trame, num, contexteAmont, affectationsLibres)
    for (const [col, ini] of Object.entries(aff)) {
      if (!ASSOCIES.includes(ini)) continue
      const ds = datesGardeSemaine(trame, Number(col), annee, num, calendrier)
      if (ds.length) { dates[ini].push(...ds); comptes[ini] += ds.length }
    }
  }
  return { dates, comptes }
}

// ── Remplissage automatique des colonnes libres, semaine par semaine (glouton déterministe) ──
// Renvoie { <num>: { <colIndex>: ini } } pour les colonnes LIBRES de la plage.
//   trameInfo(num) → { trame, estPrincipale } | null
//   contexteAmont  → { rea, vacances, weekendAff }
//   desiderata     → { colonnesSouhaiteesParAssocie:{ini:{num:col}}, joursOffDetailParAssocie:{ini:{num:Set}} }
//   gardesInitiales→ { ini:[Date] } (week-ends année + gardes semaine hors-plage) pour l'espacement
//   compteAnneeInitial → { ini:n } (gardes de semaine hors-plage) pour l'équilibre annuel
//   fixes          → { num:{col:ini} } colonnes verrouillées de la plage (préservées)
export function proposerSemaines({
  semainesPlage, annee, calendrier, trameInfo, contexteAmont, desiderata,
  gardesInitiales = {}, compteAnneeInitial = {}, fixes = {},
}) {
  const { vacances = {} } = contexteAmont
  const { colonnesSouhaiteesParAssocie = {}, joursOffDetailParAssocie = {} } = desiderata

  const gardes = {}; const compteAnnee = {}; const comptePeriode = {}
  for (const ini of ASSOCIES) {
    gardes[ini] = [...(gardesInitiales[ini] ?? [])]
    compteAnnee[ini] = compteAnneeInitial[ini] ?? 0
    comptePeriode[ini] = 0
  }

  const out = {}
  const nums = semainesPlage.map(s => s.num).sort((a, b) => a - b)

  for (const num of nums) {
    const info = trameInfo(num)
    if (!info?.trame) continue
    const { trame, estPrincipale } = info
    out[num] = {}

    const spec = colonnesSpeciales(trame, num, contexteAmont)
    const verrou = fixes[num] ?? {}

    // Comptabilise les gardes générées par une colonne pour un associé.
    const placer = (col, ini) => {
      const ds = datesGardeSemaine(trame, col, annee, num, calendrier)
      if (ds.length) { gardes[ini].push(...ds); compteAnnee[ini] += ds.length; comptePeriode[ini] += ds.length }
    }

    // Associés indisponibles cette semaine (spéciales + tous les vacanciers).
    const pris = new Set()
    for (const ini of Object.values(spec)) pris.add(ini)
    for (const ini of (vacances[num] ?? [])) pris.add(ini)
    for (const [col, ini] of Object.entries(spec)) placer(Number(col), ini)

    // Colonnes à pourvoir (libres + colonnes de travail spéciales restées vides) ; les verrouillées
    // sont posées d'emblée.
    const colLibres = []
    for (const c of colonnesAPourvoir(trame, spec)) {
      if (verrou[c] != null) { out[num][c] = verrou[c]; pris.add(verrou[c]); placer(c, verrou[c]) }
      else colLibres.push(c)
    }
    let assocLibres = ASSOCIES.filter(a => !pris.has(a))

    const reposCouvre = (col, ini) => {
      const off = joursOffDetailParAssocie?.[ini]?.[num]
      if (!off || off.size === 0) return 0
      const r = reposJours(trame.colonnes[col])
      let n = 0
      for (const j of off) if (r.has(j)) n++
      return n
    }
    const ecart = (col, ini) => ecartMinJours(datesGardeSemaine(trame, col, annee, num, calendrier), gardes[ini])
    const attribuer = (col, ini) => { out[num][col] = ini; placer(col, ini); assocLibres = assocLibres.filter(a => a !== ini) }

    // Phase A — souhaits de colonne (seulement si la semaine utilise la trame PRINCIPALE).
    if (estPrincipale) {
      const parCol = {}
      for (const ini of assocLibres) {
        const c = colonnesSouhaiteesParAssocie?.[ini]?.[num]
        if (Number.isInteger(c) && colLibres.includes(c) && out[num][c] == null) (parCol[c] ??= []).push(ini)
      }
      for (const c of Object.keys(parCol).map(Number).sort((a, b) => a - b)) {
        if (out[num][c] != null) continue
        const cands = parCol[c].filter(a => assocLibres.includes(a))
        if (!cands.length) continue
        // Collision (deux associés veulent la même colonne) : un seul l'obtient (le moins chargé).
        cands.sort((a, b) => (compteAnnee[a] - compteAnnee[b]) || (comptePeriode[a] - comptePeriode[b]) || (ASSOCIES.indexOf(a) - ASSOCIES.indexOf(b)))
        attribuer(c, cands[0])
      }
    }

    let restantes = colLibres.filter(c => out[num][c] == null)

    // Phase B — repos-levier : placer un associé ayant un jour off sur une colonne dont le repos le couvre.
    for (const ini of [...assocLibres]) {
      const off = joursOffDetailParAssocie?.[ini]?.[num]
      if (!off || off.size === 0) continue
      let best = null, bestN = 0
      for (const c of restantes) {
        const n = reposCouvre(c, ini)
        if (n > bestN) { bestN = n; best = c }
      }
      if (best != null && bestN > 0) { attribuer(best, ini); restantes = restantes.filter(c => c !== best) }
    }

    // Phase C — équilibre des gardes : on attribue D'ABORD les colonnes qui génèrent une garde, aux
    // associés les MOINS chargés (sinon les colonnes sans garde, prises en premier par les moins
    // chargés, laissent toujours la garde aux plus chargés → déséquilibre auto-entretenu). Égalité
    // d'abord ; l'écart entre gardes reste un tie-break (déjà dans le tri des candidats).
    const nbGardesCol = (c) => datesGardeSemaine(trame, c, annee, num, calendrier).length
    const restantesTriees = [...restantes].sort((a, b) => (nbGardesCol(b) - nbGardesCol(a)) || (a - b))
    for (const c of restantesTriees) {
      if (out[num][c] != null || !assocLibres.length) continue
      const cands = [...assocLibres]
      cands.sort((a, b) =>
        (compteAnnee[a] - compteAnnee[b]) ||
        (comptePeriode[a] - comptePeriode[b]) ||
        ((reposCouvre(c, b) ? 1 : 0) - (reposCouvre(c, a) ? 1 : 0)) ||
        (ecart(c, b) - ecart(c, a)) ||                       // plus grand écart d'abord (moins pénible)
        (ASSOCIES.indexOf(a) - ASSOCIES.indexOf(b)))
      attribuer(c, cands[0])
    }
  }
  return out
}

// Analyse d'une semaine pour les alertes (calque analyserAffectation).
//   affResolue            → { col: ini } (spéciales + libres)
//   gardesParAssocie      → { ini: [Date] } (toutes gardes connues, pour la proximité)
//   souhaitsParAssocie    → { ini: { num: col } }
// Renvoie { tropProche:{ini:ecartJours}, souhaitNonSatisfait:[ini], nonPlaces:[ini], colonnesVides:[col], multiVacances:bool }
export function analyserSemaineColonnes(trame, num, annee, calendrier, affResolue, gardesParAssocie, {
  souhaitsParAssocie = {}, vacanciers = [], estPrincipale = true,
} = {}) {
  const tropProche = {}
  // Pour chaque associé placé qui génère une garde cette semaine, écart à ses AUTRES gardes.
  for (const [col, ini] of Object.entries(affResolue)) {
    if (!ASSOCIES.includes(ini)) continue
    const ds = datesGardeSemaine(trame, Number(col), annee, num, calendrier)
    if (!ds.length) continue
    const autres = (gardesParAssocie[ini] ?? []).filter(g => !ds.some(d => d.getTime() === g.getTime()))
    const e = ecartMinJours(ds, autres)
    if (e < ESPACEMENT_GARDE_JOURS) tropProche[ini] = Math.round(e)
  }

  const places = new Set(Object.values(affResolue).filter(i => ASSOCIES.includes(i)))
  const indispo = new Set([...vacanciers]) // les vacanciers ne travaillent pas
  for (const i of places) indispo.add(i)
  const nonPlaces = ASSOCIES.filter(a => !indispo.has(a))

  // Colonnes de travail vides = colonnes libres + colonnes spéciales rea/avantWE/apresWE (une colonne
  // avec occupant dérivé n'est pas vide dans affResolue) ; les vacances/remplaçant sont exclues.
  const colonnesTravail = [...colonnesSelectionnables(trame), trame?.rea, trame?.avantWE, trame?.apresWE]
    .filter(c => c != null)
  const colonnesVides = [...new Set(colonnesTravail)].sort((a, b) => a - b).filter(c => affResolue[c] == null)

  const souhaitNonSatisfait = []
  const souhaitsIgnoresTrame = []
  for (const ini of ASSOCIES) {
    const c = souhaitsParAssocie?.[ini]?.[num]
    if (!Number.isInteger(c)) continue
    if (estPrincipale) {
      // Souhait exprimé sur la principale, semaine en principale : satisfait ou non.
      if (affResolue[c] !== ini) souhaitNonSatisfait.push(ini)
    } else {
      // Semaine en trame spécifique : le souhait (indexé sur la principale) n'est pas applicable.
      souhaitsIgnoresTrame.push(ini)
    }
  }

  return { tropProche, souhaitNonSatisfait, souhaitsIgnoresTrame, nonPlaces, colonnesVides, multiVacances: (vacanciers?.length ?? 0) > 1 }
}
