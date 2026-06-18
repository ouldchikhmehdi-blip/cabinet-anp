// ============================================================
// planningParService.js — vue « Planning par service » (PLANNING.md).
// Transpose le planning saisi (par associé : trames + affectations de semaine) en un tableau
// PAR POSTE : lignes = jours, colonnes = postes canoniques, cellule = le(s) médecin(s) en NOM COMPLET.
// Source = données existantes (rien à recoller) ; on lit, pour chaque associé, sa colonne de trame
// résolue, puis le libellé de poste de chaque jour (colObj[jour]) qu'on NORMALISE vers un poste canonique.
// ============================================================
import { ASSOCIES } from '../data/associes'
import { JOURS } from './trames'
import { affectationResolue } from './semaines'
import { lundiDeSemaineISO, formatISO, formatDateLongueFR } from './calendrier'

const JOUR_MS = 24 * 60 * 60 * 1000

// Colonnes (postes) du tableau, dans l'ordre d'affichage.
export const POSTES_SERVICE = ['SARM 1', 'SARM 2', 'Bloc A viscéral', 'Bloc A NC', 'Bloc B', 'USC/Réa']

function nettoie(s) {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Libellé de poste (texte libre des trames) → poste canonique, ou null si vide / « VPA » seul / non reconnu.
// « VPA » (visite pré-anesthésique) est TOUJOURS retiré, quelle que soit la case.
export function normaliserPosteCanonique(libelle) {
  const t = nettoie(libelle).replace(/\bvpa\b/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (/\bsarm\s*1\b/.test(t)) return 'SARM 1'
  if (/\bsarm\s*2\b/.test(t)) return 'SARM 2'
  if (/visc/.test(t)) return 'Bloc A viscéral'              // viscéral, viscéral A, viscéral + CPE
  if (/\bnc\b/.test(t) || /neuro/.test(t)) return 'Bloc A NC' // NC, neuro, neurochirurgie
  if (/bloc\s*b/.test(t) || /endosc/.test(t)) return 'Bloc B' // bloc B, endoscopie
  if (/\brea\b/.test(t) || /reanim/.test(t) || /\busc\b/.test(t)) return 'USC/Réa' // réa, réanimation, USC
  return null
}

// Construit le tableau jours × postes pour une plage de semaines.
//   semainesPlage      : [{ num, ... }] (ordre chronologique)
//   annee              : année ISO
//   trameDe(num)       : trame résolue | null (cf. resoudreTrame)
//   contexteAmont      : { rea, vacances, weekendAff }
//   affectationsLibres : { num: { colIndex: ini } }
//   nomParIni          : { ini: 'Dr Nom' } (repli sur l'initiale si absent)
//   feriesIso          : Set d'ISO de jours fériés (pour griser comme les week-ends)
// Retour : { postes, lignes: [{ iso, dateLabel, estWeekend, estFerie, parPoste: { poste: 'txt' } }] }.
export function construireTableParService({
  semainesPlage = [], annee, trameDe, contexteAmont = {}, affectationsLibres = {}, nomParIni = {}, feriesIso = new Set(),
}) {
  // 1) Pour chaque semaine : cellules[jour][poste] = [noms].
  const parSemaine = {}
  for (const sem of semainesPlage) {
    const trame = trameDe?.(sem.num)
    if (!trame) continue
    const affR = affectationResolue(trame, sem.num, contexteAmont, affectationsLibres) // { col: ini }
    const cellules = {}
    const placer = (jour, poste, nom) => {
      if (!poste || !nom) return
      const parPoste = (cellules[jour] ??= {})
      const noms = (parPoste[poste] ??= [])
      if (!noms.includes(nom)) noms.push(nom)
    }
    // Associés (colonnes résolues : libres + spéciales).
    for (const [colStr, ini] of Object.entries(affR)) {
      if (!ASSOCIES.includes(ini)) continue
      const col = trame.colonnes?.[Number(colStr)]
      if (!col) continue
      const nom = nomParIni[ini] || ini
      for (const jour of JOURS) placer(jour, normaliserPosteCanonique(col[jour]), nom)
    }
    // Remplaçants externes (colonnes nommées par le faiseur).
    for (const r of (trame.remplacants ?? [])) {
      if (r.col == null) continue
      const col = trame.colonnes?.[r.col]
      const nom = (r.nom ?? '').trim()
      if (!col || !nom) continue
      for (const jour of JOURS) placer(jour, normaliserPosteCanonique(col[jour]), nom)
    }
    parSemaine[sem.num] = cellules
  }

  // 2) Lignes jour par jour (7 j/semaine, lun→dim). Postes uniquement en semaine (lun→ven).
  const lignes = []
  for (const sem of semainesPlage) {
    const lundi = lundiDeSemaineISO(annee, sem.num)
    for (let off = 0; off < 7; off++) {
      const date = new Date(lundi.getTime() + off * JOUR_MS)
      const iso = formatISO(date)
      const estWeekend = off >= 5
      const parPoste = {}
      if (!estWeekend) {
        const cell = parSemaine[sem.num]?.[JOURS[off]] ?? {}
        for (const poste of POSTES_SERVICE) {
          if (cell[poste]?.length) parPoste[poste] = cell[poste].join(' / ')
        }
      }
      lignes.push({ iso, dateLabel: formatDateLongueFR(date), estWeekend, estFerie: feriesIso.has(iso), parPoste })
    }
  }
  return { postes: POSTES_SERVICE, lignes }
}
