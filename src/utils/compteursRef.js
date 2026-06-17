// ============================================================
// compteursRef.js — « Compteurs de référence (cumul à ce stade) ».
//
// Le faiseur fabrique la 1ʳᵉ partie + l'été (+ Noël) directement dans Excel et tient son tableau
// récapitulatif (compteurs par associé). Plutôt que de re-parser tout le planning, il COLLE
// directement ce petit tableau récap (paramètres × associés) ; on remplit les cases automatiquement.
// Stockage : table planning_compteurs_ref (par année), socle pour construire le 3ᵉ recueil.
// ============================================================
import { ASSOCIES } from '../data/associes'

export const VERSION_CREF = 1

// Paramètres suivis (clé interne → libellé), alignés sur LIGNES_BILAN + §16.
export const PARAMS_REF = [
  ['gWeekend', 'G week-end'],
  ['aWeekend', 'A week-end'],
  ['gVendredi', 'G vendredi'],
  ['aVendredi', 'A vendredi'],
  ['rea', 'Réa'],
  ['gardeSemaine', 'Gardes de semaine'],
  ['vacances', 'Semaines de vacances'],
  ['recupFerie', 'Récup férié'],
]
const CLES_PARAM = PARAMS_REF.map(([k]) => k)

// ── Forme garantie ──
export function compteursVides() {
  const compteurs = {}
  for (const ini of ASSOCIES) {
    compteurs[ini] = {}
    for (const k of CLES_PARAM) compteurs[ini][k] = 0
  }
  return compteurs
}

export function compteursRefVide() {
  return { v: VERSION_CREF, importeLe: null, inclutNoel: false, compteurs: compteursVides() }
}

export function normaliserCompteursRef(data) {
  if (!data || typeof data !== 'object') return compteursRefVide()
  const base = compteursVides()
  const src = data.compteurs && typeof data.compteurs === 'object' ? data.compteurs : {}
  for (const ini of ASSOCIES) {
    for (const k of CLES_PARAM) {
      const n = src?.[ini]?.[k]
      if (Number.isFinite(n) && n >= 0) base[ini][k] = Math.round(n)
    }
  }
  return {
    v: VERSION_CREF,
    importeLe: data.importeLe ?? null,
    inclutNoel: !!data.inclutNoel,
    compteurs: base,
  }
}

// ── Reconnaissance d'un libellé de paramètre (tolérante : sans accents, minuscules) ──
function sansAccents(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Renvoie la clé de paramètre correspondant à un libellé, ou null. Ordre des tests important
// (« gardes de semaine » contient « semaine » mais pas « week »/« vendredi »).
export function matchParam(libelle) {
  const t = sansAccents(libelle)
  if (!t) return null
  const astreinte = /\ba\b|astreinte/.test(t) // « A vendredi », « astreinte … »
  if (t.includes('vacance')) return 'vacances'
  if (/recup|ferie|rjf/.test(t)) return 'recupFerie'
  if (/\brea\b|reanim/.test(t)) return 'rea'
  if (/week|\bwe\b/.test(t)) return astreinte ? 'aWeekend' : 'gWeekend'
  if (t.includes('vendredi')) return astreinte ? 'aVendredi' : 'gVendredi'
  if (t.includes('semaine')) return 'gardeSemaine'
  return null
}

// Extrait un entier d'une cellule (« 12 », « 12 ", " 7 »). Renvoie null si pas de nombre.
function nombreCellule(v) {
  const m = String(v ?? '').match(/-?\d+/)
  return m ? Math.max(0, Math.abs(Number(m[0]))) : null
}

const SET_ASSOCIES = new Set(ASSOCIES)
const indexIni = (v) => ASSOCIES.indexOf(String(v ?? '').trim().toUpperCase())

// ── Parse un TABLEAU RÉCAP collé (paramètres × associés) → { compteurs, nbParams, nbAssocies } ──
// Tolère les deux orientations : associés en COLONNES (en-tête d'initiales) ou en LIGNES (1ʳᵉ colonne).
// Les lignes/colonnes non reconnues sont ignorées ; cases par défaut à 0.
export function parserTableauCompteurs(texte) {
  const compteurs = compteursVides()
  if (typeof texte !== 'string' || texte.trim() === '') return { compteurs, nbParams: 0, nbAssocies: 0 }
  const matrice = texte.replace(/\r/g, '').split('\n')
    .map(l => l.split('\t').map(c => c.trim()))
    .filter(l => l.some(c => c !== ''))
  if (!matrice.length) return { compteurs, nbParams: 0, nbAssocies: 0 }

  const nbInisLigne = (l) => l.filter(c => SET_ASSOCIES.has(c.toUpperCase())).length

  // 1) Orientation « associés en colonnes » : une ligne d'en-tête contient les initiales.
  let rEntete = -1, meilleur = 0
  matrice.forEach((l, r) => { const n = nbInisLigne(l); if (n > meilleur) { meilleur = n; rEntete = r } })

  const parametresVus = new Set()
  const associesVus = new Set()

  if (meilleur >= 2) {
    const colIni = {}
    matrice[rEntete].forEach((c, k) => { const i = indexIni(c); if (i >= 0 && colIni[ASSOCIES[i]] == null) colIni[ASSOCIES[i]] = k })
    matrice.forEach((ligne, r) => {
      if (r === rEntete) return
      const param = ligne.map(matchParam).find(Boolean)
      if (!param || parametresVus.has(param)) return
      parametresVus.add(param)
      for (const ini of ASSOCIES) {
        const k = colIni[ini]
        if (k == null) continue
        const n = nombreCellule(ligne[k])
        if (n != null) { compteurs[ini][param] = n; associesVus.add(ini) }
      }
    })
    return { compteurs, nbParams: parametresVus.size, nbAssocies: associesVus.size }
  }

  // 2) Orientation « associés en lignes » : une colonne contient les initiales, l'en-tête porte les params.
  const nbCol = matrice.reduce((m, l) => Math.max(m, l.length), 0)
  let colIni = -1, meilleurC = 0
  for (let c = 0; c < nbCol; c++) {
    const n = matrice.filter(l => SET_ASSOCIES.has((l[c] ?? '').toUpperCase())).length
    if (n > meilleurC) { meilleurC = n; colIni = c }
  }
  if (meilleurC < 2) return { compteurs, nbParams: 0, nbAssocies: 0 }
  // En-tête = 1ʳᵉ ligne sans initiale dans colIni → mapping colonne → paramètre.
  const ligneEntete = matrice.find(l => indexIni(l[colIni]) < 0) ?? []
  const colParam = {}
  ligneEntete.forEach((c, k) => { const p = matchParam(c); if (p && !Object.values(colParam).includes(p)) colParam[k] = p })
  for (const p of Object.values(colParam)) parametresVus.add(p)
  matrice.forEach((ligne) => {
    const ini = ASSOCIES[indexIni(ligne[colIni])]
    if (!ini) return
    for (const [k, param] of Object.entries(colParam)) {
      const n = nombreCellule(ligne[Number(k)])
      if (n != null) { compteurs[ini][param] = n; associesVus.add(ini) }
    }
  })
  return { compteurs, nbParams: parametresVus.size, nbAssocies: associesVus.size }
}
