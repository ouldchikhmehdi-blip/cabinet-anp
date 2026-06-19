// ============================================================
// planningInvariants.js — RÈGLES DURES (invariantes) de l'attribution d'une semaine.
// Fonctions PURES, sans calendrier ni I/O : un MÊME code sert (a) aux tests automatisés
// (figer le comportement, attraper les régressions) et (b) aux garde-fous LIVE de l'app
// (analyserSemaineColonnes → alertes dans PlanningSemaines). Une invariante violée = un bug
// à signaler, jamais à masquer.
// ============================================================
import { ASSOCIES } from '../data/associes'

// Associés présents sur DEUX colonnes ou plus dans une affectation résolue { col: ini }.
// Ne doit jamais arriver : un associé n'occupe qu'une colonne par semaine.
export function associesEnDouble(affResolue = {}) {
  const compte = {}
  for (const ini of Object.values(affResolue)) {
    if (!ASSOCIES.includes(ini)) continue
    compte[ini] = (compte[ini] ?? 0) + 1
  }
  return Object.keys(compte).filter(i => compte[i] > 1)
}

// Liste des violations d'invariantes pour une semaine. `affResolue` = { col: ini } (colonnes
// spéciales dérivées + libres). Renvoie [] si tout est conforme.
//   - enDouble          : un associé sur ≥ 2 colonnes
//   - vacancierEnTravail: un associé en congé placé sur une colonne de TRAVAIL (≠ colonne vacances)
//   - nonPlace          : un associé ni en congé ni placé sur une colonne
export function invariantsSemaine(trame, affResolue = {}, { vacanciers = [] } = {}) {
  const violations = []
  const enVac = new Set(vacanciers)
  const vacCols = new Set(trame?.vacances ?? [])
  const places = new Set()
  for (const [col, ini] of Object.entries(affResolue)) {
    if (!ASSOCIES.includes(ini)) continue
    places.add(ini)
    if (enVac.has(ini) && !vacCols.has(Number(col))) violations.push({ code: 'vacancierEnTravail', ini, col: Number(col) })
  }
  for (const ini of associesEnDouble(affResolue)) violations.push({ code: 'enDouble', ini })
  for (const ini of ASSOCIES) if (!places.has(ini) && !enVac.has(ini)) violations.push({ code: 'nonPlace', ini })
  return violations
}

// ── WEEK-ENDS (proposerWeekends → { num: ini }) ──
// Règles DURES : l'associé du week-end est disponible (ni indisponible déclaré, ni jour off posé le
// sam/dim) et n'est pas en vacances la semaine du week-end (S) ni la suivante (S+1) — jamais de garde
// de week-end collée à des vacances.
export function invariantsWeekends(affectations = {}, { indispoParAssocie = {}, joursOffWeekendParAssocie = {}, vacancesParSemaine = {} } = {}) {
  const violations = []
  for (const [numStr, ini] of Object.entries(affectations)) {
    if (!ASSOCIES.includes(ini)) continue
    const num = Number(numStr)
    if (indispoParAssocie?.[ini]?.has?.(num)) violations.push({ code: 'indispo', ini, num })
    if (joursOffWeekendParAssocie?.[ini]?.has?.(num)) violations.push({ code: 'jourOffWE', ini, num })
    if (vacancesParSemaine?.[num]?.includes?.(ini) || vacancesParSemaine?.[num + 1]?.includes?.(ini)) violations.push({ code: 'vacancesCollee', ini, num })
  }
  return violations
}

// ── RÉA (proposerRea → { num: ini }) ──
// Règle DURE : jamais la réa pour un associé en congé cette semaine (poste exclusif).
export function invariantsRea(reaParSemaine = {}, { vacancesParSemaine = {} } = {}) {
  const violations = []
  for (const [numStr, ini] of Object.entries(reaParSemaine)) {
    if (!ASSOCIES.includes(ini)) continue
    const num = Number(numStr)
    if (vacancesParSemaine?.[num]?.includes?.(ini)) violations.push({ code: 'reaEnVacances', ini, num })
  }
  return violations
}

// ── VACANCES (proposerVacances → { num: [inis] }) ──
// Règles DURES : jamais un congé collé à un week-end de garde du même associé (S ou S-1) ; jamais un
// associé ayant REFUSÉ cette semaine ; capacité (postes ouverts) respectée ; pas de doublon par semaine.
// `capacite(num)` = nombre de postes ouverts (optionnel ; ignoré si non fourni).
export function invariantsVacances(vacancesParSemaine = {}, { weekendAff = {}, refusParAssocie = {}, capacite = null } = {}) {
  const violations = []
  for (const [numStr, inis] of Object.entries(vacancesParSemaine)) {
    const num = Number(numStr)
    const liste = (inis ?? []).filter(i => ASSOCIES.includes(i))
    if (new Set(liste).size !== liste.length) violations.push({ code: 'doublon', num })
    if (typeof capacite === 'function' && liste.length > capacite(num)) violations.push({ code: 'capaciteDepassee', num, n: liste.length, cap: capacite(num) })
    for (const ini of liste) {
      if (weekendAff?.[num] === ini || weekendAff?.[num - 1] === ini) violations.push({ code: 'congeColleGarde', ini, num })
      if (refusParAssocie?.[ini]?.has?.(num)) violations.push({ code: 'refusPlace', ini, num })
    }
  }
  return violations
}
