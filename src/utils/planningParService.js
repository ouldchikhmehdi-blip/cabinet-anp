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
// Retour : { postes, lignes: [{ iso, dateLabel, estWeekend, estFerie,
//            parPoste: { poste: { texte, estRemplacant } } }] }. estRemplacant ⇒ affichage en rouge.
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
    const placer = (jour, poste, nom, estRemplacant = false) => {
      if (!poste || !nom) return
      const parPoste = (cellules[jour] ??= {})
      const items = (parPoste[poste] ??= [])
      if (!items.some(it => it.nom === nom)) items.push({ nom, estRemplacant })
    }
    // Associés (colonnes résolues : libres + spéciales).
    for (const [colStr, ini] of Object.entries(affR)) {
      if (!ASSOCIES.includes(ini)) continue
      const col = trame.colonnes?.[Number(colStr)]
      if (!col) continue
      const nom = nomParIni[ini] || ini
      for (const jour of JOURS) placer(jour, normaliserPosteCanonique(col[jour]), nom)
    }
    // Remplaçants externes : on n'affiche PAS leur nom, on inscrit le mot « Remplaçant » (en rouge,
    // côté UI/export) dans le poste couvert, quel que soit le remplaçant (1er, 2e…). On ne dépend donc
    // pas du nom saisi → comble les trous quand un remplaçant couvre un poste sans avoir été nommé.
    for (const r of (trame.remplacants ?? [])) {
      if (r.col == null) continue
      const col = trame.colonnes?.[r.col]
      if (!col) continue
      for (const jour of JOURS) placer(jour, normaliserPosteCanonique(col[jour]), 'Remplaçant', true)
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
          const items = cell[poste]
          if (items?.length) {
            parPoste[poste] = {
              texte: items.map(it => it.nom).join(' / '),
              // Cellule en rouge si elle ne contient QUE du remplaçant (poste couvert par un externe).
              estRemplacant: items.every(it => it.estRemplacant),
            }
          }
        }
      }
      lignes.push({ iso, dateLabel: formatDateLongueFR(date), estWeekend, estFerie: feriesIso.has(iso), parPoste })
    }
  }
  return { postes: POSTES_SERVICE, lignes }
}
