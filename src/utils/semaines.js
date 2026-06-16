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
// La colonne RÉA n'est jamais « de service » : en réa, on n'est ni de garde ni d'astreinte.
export function datesGardeSemaine(trame, colIndex, annee, num, calendrier) {
  if (colIndex === trame?.rea) return []
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

// Rôle du vendredi d'une colonne SI elle est de service le vendredi → 'A' | 'G' | null.
// La colonne RÉA n'est jamais de service (ni garde ni astreinte) → null.
export function roleVendrediCol(trame, colIndex, num, calendrier) {
  if (colIndex === trame?.rea) return null
  const col = trame?.colonnes?.[colIndex]
  if (!col?.service?.ven) return null
  return typeDuJour(calendrier, num, 4) // 'A' (astreinte) ou 'G' (garde)
}

// Nb de récup « jour férié » qu'une colonne génère cette semaine : +1 par jour férié ouvré (offset 0–4) où la
// colonne TRAVAILLE (col[jour] non vide) SANS être de service (de service → garde/astreinte, pas de récup).
// La RÉA n'étant jamais de service, un férié travaillé en réa donne toujours droit à une récup.
export function recupColCount(trame, colIndex, feriesOffsets = []) {
  const col = trame?.colonnes?.[colIndex]
  if (!col || !feriesOffsets.length) return 0
  const estRea = colIndex === trame?.rea
  let n = 0
  for (const off of feriesOffsets) {
    if (off < 0 || off > 4) continue
    const jour = JOURS[off]
    if (!estRea && col.service?.[jour]) continue
    if ((col[jour] ?? '').trim()) n++
  }
  return n
}

// A/G vendredi + récup JF par associé sur les semaines fournies (d'après les affectations résolues).
// Sert à initialiser l'équilibre ANNUEL (semaines hors-plage). feriesOffsetsParSemaine = { num:[offset…] }.
export function bilanVendrediRecupParAssocie(weeks, calendrier, trameDe, contexteAmont, affectationsLibres = {}, feriesOffsetsParSemaine = {}) {
  const aVen = {}; const gVen = {}; const recup = {}
  for (const ini of ASSOCIES) { aVen[ini] = 0; gVen[ini] = 0; recup[ini] = 0 }
  for (const num of weeks) {
    const trame = trameDe(num)
    if (!trame) continue
    const aff = affectationResolue(trame, num, contexteAmont, affectationsLibres)
    const feriesOffsets = feriesOffsetsParSemaine[num] ?? []
    for (const [col, ini] of Object.entries(aff)) {
      if (!ASSOCIES.includes(ini)) continue
      const rv = roleVendrediCol(trame, Number(col), num, calendrier)
      if (rv === 'A') aVen[ini]++
      else if (rv === 'G') gVen[ini]++
      recup[ini] += recupColCount(trame, Number(col), feriesOffsets)
    }
  }
  return { aVen, gVen, recup }
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
  aVenInitial = {}, gVenInitial = {}, recupInitial = {}, feriesOffsetsParSemaine = {},
}) {
  const { vacances = {} } = contexteAmont
  const { colonnesSouhaiteesParAssocie = {}, joursOffDetailParAssocie = {}, demandeParAssocie = {} } = desiderata

  const gardes = {}; const compteAnnee = {}; const comptePeriode = {}
  // Équilibres annuels additionnels (priorité après les gardes de semaine) : A vendredi, G vendredi, récup JF.
  const cAV = {}; const cGV = {}; const cRJ = {}
  for (const ini of ASSOCIES) {
    gardes[ini] = [...(gardesInitiales[ini] ?? [])]
    compteAnnee[ini] = compteAnneeInitial[ini] ?? 0
    comptePeriode[ini] = 0
    cAV[ini] = aVenInitial[ini] ?? 0
    cGV[ini] = gVenInitial[ini] ?? 0
    cRJ[ini] = recupInitial[ini] ?? 0
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
    const feriesOffsets = feriesOffsetsParSemaine[num] ?? []
    // Règle DURE : pas de garde/astreinte le vendredi avant une semaine de vacances. L'occupant d'une colonne
    // de service le vendredi ne peut pas être en vacances la semaine SUIVANTE (num+1).
    const interditsVendredi = new Set(vacances[num + 1] ?? [])
    const colServiceVendredi = (c) => roleVendrediCol(trame, c, num, calendrier) !== null
    const filtrerVendredi = (c, liste) => {
      if (!colServiceVendredi(c)) return liste
      const ok = liste.filter(x => !interditsVendredi.has(x))
      return ok.length ? ok : liste // repli : ne pas laisser la colonne vide (incohérence signalée en alerte)
    }

    // Comptabilise ce qu'une colonne fait gagner à un associé : gardes de semaine + A/G vendredi + récup JF.
    const placer = (col, ini) => {
      const ds = datesGardeSemaine(trame, col, annee, num, calendrier)
      if (ds.length) { gardes[ini].push(...ds); compteAnnee[ini] += ds.length; comptePeriode[ini] += ds.length }
      const rv = roleVendrediCol(trame, col, num, calendrier)
      if (rv === 'A') cAV[ini] += 1; else if (rv === 'G') cGV[ini] += 1
      cRJ[ini] += recupColCount(trame, col, feriesOffsets)
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

    // Phase 0 — RÈGLE DURE (vendredi avant vacances) : on RÉSERVE d'abord les colonnes de service vendredi à
    // un associé NON interdit (pas en vacances la semaine suivante), AVANT toute autre attribution — sinon les
    // colonnes de garde consomment les candidats et il ne reste qu'un interdit. Prioritaire sur tout le reste.
    for (const c of colLibres.filter(colServiceVendredi).sort((a, b) => a - b)) {
      if (out[num][c] != null || !assocLibres.length) continue
      let cands = assocLibres.filter(x => !interditsVendredi.has(x))
      if (!cands.length) cands = [...assocLibres] // repli : aucun non-interdit dispo (cas signalé en alerte)
      const rvCol = roleVendrediCol(trame, c, num, calendrier)
      const recupCol = recupColCount(trame, c, feriesOffsets)
      const venRel = (x) => (rvCol === 'A' ? cAV[x] : rvCol === 'G' ? cGV[x] : 0)
      const rjRel = (x) => (recupCol > 0 ? cRJ[x] : 0)
      const gardeColP0 = datesGardeSemaine(trame, c, annee, num, calendrier).length > 0
      cands.sort((a, b) =>
        (gardeColP0 ? (compteAnnee[a] - compteAnnee[b]) : 0) || // si la colonne génère aussi une garde : gardes d'abord
        (venRel(a) - venRel(b)) ||                              // équilibre A/G vendredi
        (rjRel(a) - rjRel(b)) ||
        (compteAnnee[a] - compteAnnee[b]) ||
        (comptePeriode[a] - comptePeriode[b]) ||
        (ASSOCIES.indexOf(a) - ASSOCIES.indexOf(b)))
      attribuer(c, cands[0])
    }

    // Phase A — souhaits de colonne (seulement si la semaine utilise la trame PRINCIPALE).
    if (estPrincipale) {
      const parCol = {}
      for (const ini of assocLibres) {
        const c = colonnesSouhaiteesParAssocie?.[ini]?.[num]
        if (Number.isInteger(c) && colLibres.includes(c) && out[num][c] == null) (parCol[c] ??= []).push(ini)
      }
      for (const c of Object.keys(parCol).map(Number).sort((a, b) => a - b)) {
        if (out[num][c] != null) continue
        const cands = filtrerVendredi(c, parCol[c].filter(a => assocLibres.includes(a)))
        if (!cands.length) continue
        // Collision (deux associés veulent la même colonne) : un seul l'obtient (le moins chargé).
        const rvCol = roleVendrediCol(trame, c, num, calendrier)
        const recupCol = recupColCount(trame, c, feriesOffsets)
        const venRel = (x) => (rvCol === 'A' ? cAV[x] : rvCol === 'G' ? cGV[x] : 0)
        const rjRel = (x) => (recupCol > 0 ? cRJ[x] : 0)
        cands.sort((a, b) =>
          (compteAnnee[a] - compteAnnee[b]) ||
          (venRel(a) - venRel(b)) ||
          (rjRel(a) - rjRel(b)) ||
          (comptePeriode[a] - comptePeriode[b]) ||
          (ASSOCIES.indexOf(a) - ASSOCIES.indexOf(b)))
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
        if (colServiceVendredi(c) && interditsVendredi.has(ini)) continue // règle dure vendredi-avant-vacances
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
      // Équilibres additionnels propres à cette colonne (vendredi A/G, récup JF), après les gardes de semaine.
      const rvCol = roleVendrediCol(trame, c, num, calendrier)
      const recupCol = recupColCount(trame, c, feriesOffsets)
      const venRel = (x) => (rvCol === 'A' ? cAV[x] : rvCol === 'G' ? cGV[x] : 0)
      const rjRel = (x) => (recupCol > 0 ? cRJ[x] : 0)
      // Espacement : éviter une garde rapprochée pour tout le monde ; si inévitable (arbitrage), la charger
      // sur le PLUS demandeur (équité : qui a formulé le plus de souhaits absorbe les gardes rapprochées).
      const gardeCol = nbGardesCol(c) > 0
      const demande = (x) => demandeParAssocie[x] ?? 0
      const creeRapproche = (x) => (ecart(c, x) < ESPACEMENT_GARDE_JOURS ? 1 : 0)
      const cands = filtrerVendredi(c, [...assocLibres])
      cands.sort((a, b) =>
        (compteAnnee[a] - compteAnnee[b]) ||                 // gardes de semaine — priorité n°1
        (venRel(a) - venRel(b)) ||                           // A ou G vendredi (selon le type du vendredi)
        (rjRel(a) - rjRel(b)) ||                             // récup jour férié
        (comptePeriode[a] - comptePeriode[b]) ||
        ((reposCouvre(c, b) ? 1 : 0) - (reposCouvre(c, a) ? 1 : 0)) ||
        (gardeCol ? (creeRapproche(a) - creeRapproche(b)) : 0) ||  // ne pas créer de garde rapprochée
        (gardeCol ? (demande(b) - demande(a)) : 0) ||             // si rapprochée inévitable → au plus demandeur
        (ecart(c, b) - ecart(c, a)) ||                       // sinon plus grand écart d'abord (moins pénible)
        (ASSOCIES.indexOf(a) - ASSOCIES.indexOf(b)))
      attribuer(c, cands[0])
    }
  }
  return out
}

// ── Amélioration de l'ESPACEMENT des gardes (réduire les « gardes rapprochées ») ──
// Recherche locale DÉTERMINISTE par échanges, à partir d'une proposition existante. « Équilibre d'abord » :
// un échange n'est retenu que s'il réduit STRICTEMENT le nombre de gardes rapprochées SANS dégrader
// l'équilibre annuel des gardes de semaine, ni créer de souhait de colonne non satisfait.
//   Les colonnes spéciales (réa/vacances/avant-après-WE) et les colonnes VERROUILLÉES sont figées.
// Mêmes entrées que proposerSemaines, plus `affectations` (état de départ). Renvoie
//   { affectations:{<num>:{<col>:ini}}, avant:n, apres:n } (n = nb de couples (semaine, associé) rapprochés).
export function ameliorerEspacementSemaines({
  semainesPlage, annee, calendrier, trameInfo, contexteAmont, desiderata = {},
  gardesInitiales = {}, compteAnneeInitial = {}, fixes = {}, affectations = {},
  aVenInitial = {}, gVenInitial = {}, recupInitial = {}, feriesOffsetsParSemaine = {},
}) {
  const { vacances = {} } = contexteAmont
  const { colonnesSouhaiteesParAssocie = {}, joursOffDetailParAssocie = {} } = desiderata
  const nums = semainesPlage.map(s => s.num).sort((a, b) => a - b)

  // Copie mutable des affectations de la plage (colonnes libres + colonnes de travail pourvues).
  const aff = {}
  for (const num of nums) aff[num] = { ...(affectations[num] ?? {}) }

  // Parties FIXES (jamais modifiées) : socle hors-plage + colonnes spéciales + colonnes verrouillées.
  const weekInfo = {}
  const fixedDates = {}; const fixedEvents = {}; const countFixe = {}
  const avFixe = {}; const gvFixe = {}; const rjFixe = {}
  for (const ini of ASSOCIES) {
    fixedDates[ini] = [...(gardesInitiales[ini] ?? [])]
    fixedEvents[ini] = []
    countFixe[ini] = compteAnneeInitial[ini] ?? 0
    avFixe[ini] = aVenInitial[ini] ?? 0
    gvFixe[ini] = gVenInitial[ini] ?? 0
    rjFixe[ini] = recupInitial[ini] ?? 0
  }
  for (const num of nums) {
    const info = trameInfo(num)
    if (!info?.trame) { weekInfo[num] = null; continue }
    const spec = colonnesSpeciales(info.trame, num, contexteAmont)
    const verrou = fixes[num] ?? {}
    const feriesOffsets = feriesOffsetsParSemaine[num] ?? []
    weekInfo[num] = { trame: info.trame, estPrincipale: info.estPrincipale, spec, verrou, vacanciers: new Set(vacances[num] ?? []), interdits: new Set(vacances[num + 1] ?? []) }
    const ajoutFixe = (col, ini) => {
      if (!ASSOCIES.includes(ini)) return
      const ds = datesGardeSemaine(info.trame, Number(col), annee, num, calendrier)
      if (ds.length) { fixedDates[ini].push(...ds); fixedEvents[ini].push(ds); countFixe[ini] += ds.length }
      const rv = roleVendrediCol(info.trame, Number(col), num, calendrier)
      if (rv === 'A') avFixe[ini] += 1; else if (rv === 'G') gvFixe[ini] += 1
      rjFixe[ini] += recupColCount(info.trame, Number(col), feriesOffsets)
    }
    for (const [col, ini] of Object.entries(spec)) ajoutFixe(col, ini)
    for (const [col, ini] of Object.entries(verrou)) if (aff[num][col] != null) ajoutFixe(col, ini)
  }

  // Cellules ÉCHANGEABLES : colonnes de aff hors verrous. occ = occupant courant (mutable).
  // Chaque cellule porte ses contributions : gardes (dates/count), A/G vendredi (av/gv), récup JF (rj).
  const cells = []
  const cellsByAssoc = {}; for (const ini of ASSOCIES) cellsByAssoc[ini] = new Set()
  const compteAnnee = {}, compteAV = {}, compteGV = {}, compteRJ = {}
  for (const ini of ASSOCIES) { compteAnnee[ini] = countFixe[ini]; compteAV[ini] = avFixe[ini]; compteGV[ini] = gvFixe[ini]; compteRJ[ini] = rjFixe[ini] }
  for (const num of nums) {
    const wi = weekInfo[num]; if (!wi) continue
    const feriesOffsets = feriesOffsetsParSemaine[num] ?? []
    for (const [colStr, ini] of Object.entries(aff[num])) {
      const col = Number(colStr)
      if (wi.verrou[col] != null || !ASSOCIES.includes(ini)) continue
      const ds = datesGardeSemaine(wi.trame, col, annee, num, calendrier)
      const rv = roleVendrediCol(wi.trame, col, num, calendrier)
      const cell = { id: cells.length, num, col, dates: ds, count: ds.length, av: rv === 'A' ? 1 : 0, gv: rv === 'G' ? 1 : 0, rj: recupColCount(wi.trame, col, feriesOffsets), occ: ini }
      cells.push(cell); cellsByAssoc[ini].add(cell.id)
      compteAnnee[ini] += ds.length; compteAV[ini] += cell.av; compteGV[ini] += cell.gv; compteRJ[ini] += cell.rj
    }
  }

  // ── Métriques ──
  const allGardesDe = (ini) => {
    const arr = [...fixedDates[ini]]
    for (const id of cellsByAssoc[ini]) arr.push(...cells[id].dates)
    return arr
  }
  // Pénalité d'un associé = nb de ses semaines (de la plage) où une garde est à < 7 j d'une AUTRE garde.
  const penaltyAssoc = (ini) => {
    const all = allGardesDe(ini)
    let p = 0
    const evs = [...fixedEvents[ini]]
    for (const id of cellsByAssoc[ini]) if (cells[id].dates.length) evs.push(cells[id].dates)
    for (const ds of evs) {
      const autres = all.filter(g => !ds.some(d => d.getTime() === g.getTime()))
      if (ecartMinJours(ds, autres) < ESPACEMENT_GARDE_JOURS) p++
    }
    return p
  }
  const penaltyTotale = () => { let p = 0; for (const ini of ASSOCIES) p += penaltyAssoc(ini); return p }
  // Écart max−min d'un compteur (équilibre). Sert aux gardes de semaine ET aux A/G vendredi / récup JF.
  const ecartDe = (m) => {
    let mn = Infinity, mx = -Infinity
    for (const ini of ASSOCIES) { const v = m[ini]; if (v < mn) mn = v; if (v > mx) mx = v }
    return mx - mn
  }
  // Souhaits de colonne non satisfaits référençant une cellule (semaine principale uniquement).
  const souhaitsCell = {}
  for (const num of nums) {
    const wi = weekInfo[num]; if (!wi || !wi.estPrincipale) continue
    for (const ini of ASSOCIES) {
      const c = colonnesSouhaiteesParAssocie?.[ini]?.[num]
      if (Number.isInteger(c)) (souhaitsCell[`${num}:${c}`] ??= []).push(ini)
    }
  }
  const souhaitInsatCell = (num, col, occ) => {
    const list = souhaitsCell[`${num}:${col}`]; if (!list) return 0
    let n = 0; for (const ini of list) if (ini !== occ) n++; return n
  }
  const reposCouvreCell = (num, col, occ) => {
    const off = joursOffDetailParAssocie?.[occ]?.[num]
    if (!off || off.size === 0) return 0
    const r = reposJours(weekInfo[num].trame.colonnes[col])
    let n = 0; for (const j of off) if (r.has(j)) n++; return n
  }

  // Échange (involution) des occupants de deux cellules + maj des compteurs.
  const echanger = (A, B) => {
    const X = A.occ, Y = B.occ
    cellsByAssoc[X].delete(A.id); cellsByAssoc[Y].delete(B.id)
    A.occ = Y; B.occ = X
    cellsByAssoc[Y].add(A.id); cellsByAssoc[X].add(B.id)
    compteAnnee[X] += (B.count - A.count); compteAnnee[Y] += (A.count - B.count)
    compteAV[X] += (B.av - A.av); compteAV[Y] += (A.av - B.av)
    compteGV[X] += (B.gv - A.gv); compteGV[Y] += (A.gv - B.gv)
    compteRJ[X] += (B.rj - A.rj); compteRJ[Y] += (A.rj - B.rj)
  }
  // Un associé occupe-t-il déjà une colonne de la semaine (hors la cellule `exceptId`) ?
  const occupeSemaine = (ini, num, exceptId) => {
    const wi = weekInfo[num]; if (!wi) return true
    if (wi.vacanciers.has(ini)) return true
    for (const v of Object.values(wi.spec)) if (v === ini) return true
    for (const v of Object.values(wi.verrou)) if (v === ini) return true
    for (const id of cellsByAssoc[ini]) if (cells[id].num === num && id !== exceptId) return true
    return false
  }

  const avant = penaltyTotale()
  const ecartVR = () => Math.max(ecartDe(compteAV), ecartDe(compteGV), ecartDe(compteRJ))
  const avantVR = ecartVR()

  // Règle DURE : un interdit (vacancier de la semaine suivante) ne peut pas occuper une colonne de service vendredi.
  const placementInterdit = (cell, occ) => (cell.av || cell.gv) && weekInfo[cell.num]?.interdits?.has(occ)

  // ── Recherche locale : objectifs = gardes rapprochées + équilibres A/G vendredi + récup JF. Amélioration de
  // Pareto (n'aggrave aucun objectif, en améliore ≥ 1), SANS dégrader l'équilibre des gardes de semaine ni les
  // souhaits, et en respectant la règle dure du vendredi-avant-vacances. Déterministe. ──
  const MAX_BALAYAGES = cells.length * 4 + 50
  for (let pass = 0; pass < MAX_BALAYAGES; pass++) {
    let meilleur = null // { A, B, gain, dRepos }
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const A = cells[i], B = cells[j]
        const X = A.occ, Y = B.occ
        if (X === Y) continue
        // Cellules inertes (aucune contribution) : un échange ne changerait aucun objectif.
        if (!A.count && !A.av && !A.gv && !A.rj && !B.count && !B.av && !B.gv && !B.rj) continue
        // Validité : pas de doublon d'un associé dans une semaine (sauf échange intra-semaine).
        if (A.num !== B.num && (occupeSemaine(X, B.num, B.id) || occupeSemaine(Y, A.num, A.id))) continue
        // Règle dure : l'échange ne doit pas créer un vendredi-avant-vacances interdit.
        if (placementInterdit(A, Y) || placementInterdit(B, X)) continue

        const pBefore = penaltyAssoc(X) + penaltyAssoc(Y)
        const eqB = ecartDe(compteAnnee), avB = ecartDe(compteAV), gvB = ecartDe(compteGV), rjB = ecartDe(compteRJ)
        const souhaitBefore = souhaitInsatCell(A.num, A.col, X) + souhaitInsatCell(B.num, B.col, Y)
        const reposBefore = reposCouvreCell(A.num, A.col, X) + reposCouvreCell(B.num, B.col, Y)
        echanger(A, B)
        const pAfter = penaltyAssoc(X) + penaltyAssoc(Y)
        const eqA = ecartDe(compteAnnee), avA = ecartDe(compteAV), gvA = ecartDe(compteGV), rjA = ecartDe(compteRJ)
        const souhaitAfter = souhaitInsatCell(A.num, A.col, A.occ) + souhaitInsatCell(B.num, B.col, B.occ)
        const reposAfter = reposCouvreCell(A.num, A.col, A.occ) + reposCouvreCell(B.num, B.col, B.occ)
        echanger(A, B) // revert

        // Contraintes dures : ne pas dégrader l'équilibre des gardes de semaine ni les souhaits.
        if ((eqA - eqB) > 0 || (souhaitAfter - souhaitBefore) > 0) continue
        // Objectifs (à ne jamais aggraver) : gardes rapprochées, écarts A vendredi / G vendredi / récup JF.
        const dP = pAfter - pBefore, dAV = avA - avB, dGV = gvA - gvB, dRJ = rjA - rjB
        if (dP > 0 || dAV > 0 || dGV > 0 || dRJ > 0) continue
        const gain = -(dP + dAV + dGV + dRJ) // amélioration totale (> 0 requis)
        if (gain <= 0) continue
        const dRepos = reposAfter - reposBefore
        if (!meilleur || gain > meilleur.gain || (gain === meilleur.gain && dRepos > meilleur.dRepos)) {
          meilleur = { A, B, gain, dRepos }
        }
      }
    }
    if (!meilleur) break
    echanger(meilleur.A, meilleur.B)
  }

  // Réécriture des occupants modifiés dans aff (colonnes spéciales/verrouillées inchangées).
  for (const cell of cells) aff[cell.num][cell.col] = cell.occ
  return { affectations: aff, avant, apres: penaltyTotale(), avantVR, apresVR: ecartVR() }
}

// Analyse d'une semaine pour les alertes (calque analyserAffectation).
//   affResolue            → { col: ini } (spéciales + libres)
//   gardesParAssocie      → { ini: [Date] } (toutes gardes connues, pour la proximité)
//   souhaitsParAssocie    → { ini: { num: col } }
// Renvoie { tropProche:{ini:ecartJours}, souhaitNonSatisfait:[ini], nonPlaces:[ini], colonnesVides:[col], multiVacances:bool }
export function analyserSemaineColonnes(trame, num, annee, calendrier, affResolue, gardesParAssocie, {
  souhaitsParAssocie = {}, vacanciers = [], estPrincipale = true, vacanciersSuivante = [],
} = {}) {
  const tropProche = {}
  // Règle dure : associés de service le vendredi alors qu'ils sont en vacances la semaine SUIVANTE.
  const vendrediAvantVacances = []
  const enVacancesSuivante = new Set(vacanciersSuivante)
  // Pour chaque associé placé qui génère une garde cette semaine, écart à ses AUTRES gardes.
  for (const [col, ini] of Object.entries(affResolue)) {
    if (!ASSOCIES.includes(ini)) continue
    if (roleVendrediCol(trame, Number(col), num, calendrier) && enVacancesSuivante.has(ini)) vendrediAvantVacances.push(ini)
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

  return { tropProche, souhaitNonSatisfait, souhaitsIgnoresTrame, nonPlaces, colonnesVides, vendrediAvantVacances, multiVacances: (vacanciers?.length ?? 0) > 1 }
}
