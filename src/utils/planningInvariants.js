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
