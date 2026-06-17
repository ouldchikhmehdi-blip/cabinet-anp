// ============================================================
// trameEte.js — grille d'été (fournie par le faiseur) + préférences de colonnes des associés.
// La grille d'été est une feuille datée (juillet→août) collée depuis Excel : 1ʳᵉ colonne = dates,
// colonnes suivantes (B, C, D…) = postes déjà placés (vacances, gardes, astreintes…). Les associés
// choisissent la/les colonne(s) qu'ils veulent faire. La persistance est dans trameEteApi.js.
// ============================================================

// ── Lettre de colonne « façon Excel » (0 → A, 1 → B, … 25 → Z, 26 → AA) ──
// La colonne 0 (dates) est l'« A » ; les colonnes choisissables commencent donc à « B ».
export function indexVersLettre(i) {
  let n = i, s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

// ── Couleur de fond exploitable : on neutralise le transparent (alpha 0). ──
function nettoyerCouleur(css) {
  if (typeof css !== 'string') return ''
  const m = css.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/i)
  if (m && Number(m[1]) === 0) return '' // transparent → fond par défaut
  return css.trim()
}

// ── Matrice des fonds de couleur du HTML du presse-papiers Excel ──
// Même technique que extraireCouleursHTML (trames.js) : on injecte le fragment hors-écran et on lit
// getComputedStyle(td).backgroundColor, mais on conserve la couleur BRUTE (pas de classification G/A).
// → couleurs[ligne][colonne] (string), ou null si pas de table.
export function extraireFondsHTML(html) {
  if (typeof html !== 'string' || html === '' || typeof document === 'undefined') return null
  const hote = document.createElement('div')
  hote.style.cssText = 'position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden'
  hote.innerHTML = html
  document.body.appendChild(hote)
  try {
    const table = hote.querySelector('table')
    if (!table) return null
    const trs = Array.from(table.querySelectorAll('tr')).filter(tr => tr.querySelector('td,th'))
    return trs.map(tr => {
      const out = []
      for (const cell of tr.querySelectorAll('td,th')) {
        const couleur = nettoyerCouleur(getComputedStyle(cell).backgroundColor)
        for (let k = 0; k < Math.max(1, cell.colSpan); k++) out.push(couleur) // colspan défensif
      }
      return out
    })
  } finally {
    hote.remove()
  }
}

// ── Parse une grille d'été collée depuis Excel (texte tabulé + HTML pour les couleurs) ──
// Renvoie { colonnes, lignes } :
//   colonnes : [{ key, label }] pour les colonnes 1..N (la colonne 0 = dates est exclue).
//   lignes   : [{ dateLabel, cells: [{ texte, couleur }] }] — cells alignées sur `colonnes`.
// Tolère un collage sans HTML (couleurs vides). La largeur = nombre max de cellules d'une ligne.
export function parserGrilleEte(texte, html) {
  if (typeof texte !== 'string' || texte.trim() === '') return { colonnes: [], lignes: [] }
  const brut = texte.replace(/\r/g, '').split('\n')
  while (brut.length > 0 && brut[brut.length - 1].trim() === '') brut.pop()
  if (brut.length === 0) return { colonnes: [], lignes: [] }

  const matrice = brut.map(l => l.split('\t').map(c => c.trim()))
  const nbCol = matrice.reduce((m, ligne) => Math.max(m, ligne.length), 0)
  if (nbCol < 2) return { colonnes: [], lignes: [] } // besoin d'au moins la colonne dates + 1 colonne

  const fonds = extraireFondsHTML(html)

  const colonnes = []
  for (let c = 1; c < nbCol; c++) {
    const lettre = indexVersLettre(c)
    colonnes.push({ key: lettre, label: lettre })
  }

  const lignes = []
  matrice.forEach((ligne, r) => {
    const dateLabel = ligne[0] ?? ''
    const cells = colonnes.map((_, k) => {
      const c = k + 1
      return { texte: ligne[c] ?? '', couleur: fonds?.[r]?.[c] ?? '' }
    })
    const videTotale = dateLabel.trim() === '' && cells.every(x => x.texte === '' && x.couleur === '')
    if (!videTotale) lignes.push({ dateLabel, cells })
  })

  return { colonnes, lignes }
}

// ── Forme garantie d'une grille d'été stockée ──
export function trameEteVide() {
  return { colonnes: [], lignes: [], importeLe: null }
}

export function normaliserTrameEte(data) {
  if (!data || typeof data !== 'object') return trameEteVide()
  return {
    colonnes: Array.isArray(data.colonnes) ? data.colonnes : [],
    lignes: Array.isArray(data.lignes) ? data.lignes : [],
    importeLe: data.importeLe ?? null,
  }
}

// ============================================================
// Préférences de colonnes d'un associé (stockées dans desiderata.data.colonnesEte).
// Forme : { prioritaires: [key…], possibles: [key…], refusees: [key…] }.
//   - prioritaires : ORDONNÉE (1er choix, 2e, 3e…)
//   - possibles    : « je peux la faire » (non ordonnée)
//   - refusees     : « surtout pas »
//   - une colonne absente des 3 listes = sans avis.
// ============================================================
export const NIVEAUX_COLONNE = [
  { val: 'prioritaire', lib: 'Prioritaire', icone: '⭐' },
  { val: 'possible', lib: 'Possible', icone: '👍' },
  { val: 'refus', lib: 'À éviter', icone: '🚫' },
]

export function prefColonnesVide() {
  return { prioritaires: [], possibles: [], refusees: [] }
}

function normaliserPref(val) {
  return {
    prioritaires: Array.isArray(val?.prioritaires) ? [...val.prioritaires] : [],
    possibles: Array.isArray(val?.possibles) ? [...val.possibles] : [],
    refusees: Array.isArray(val?.refusees) ? [...val.refusees] : [],
  }
}

// Niveau actuel d'une colonne : 'prioritaire' | 'possible' | 'refus' | '' (sans avis).
export function niveauColonne(val, key) {
  if (val?.prioritaires?.includes(key)) return 'prioritaire'
  if (val?.possibles?.includes(key)) return 'possible'
  if (val?.refusees?.includes(key)) return 'refus'
  return ''
}

// Rang (1-based) d'une colonne prioritaire, sinon null.
export function rangPriorite(val, key) {
  const i = val?.prioritaires?.indexOf(key) ?? -1
  return i === -1 ? null : i + 1
}

// Applique un niveau à une colonne (retire des 3 listes, puis ajoute selon le niveau).
export function appliquerNiveau(val, key, niveau) {
  const v = normaliserPref(val)
  v.prioritaires = v.prioritaires.filter(k => k !== key)
  v.possibles = v.possibles.filter(k => k !== key)
  v.refusees = v.refusees.filter(k => k !== key)
  if (niveau === 'prioritaire') v.prioritaires.push(key)
  else if (niveau === 'possible') v.possibles.push(key)
  else if (niveau === 'refus') v.refusees.push(key)
  return v
}

// Réordonne une colonne prioritaire (-1 = monter, +1 = descendre).
function deplacer(val, key, delta) {
  const v = normaliserPref(val)
  const i = v.prioritaires.indexOf(key)
  const j = i + delta
  if (i === -1 || j < 0 || j >= v.prioritaires.length) return v
  ;[v.prioritaires[i], v.prioritaires[j]] = [v.prioritaires[j], v.prioritaires[i]]
  return v
}
export function monter(val, key) { return deplacer(val, key, -1) }
export function descendre(val, key) { return deplacer(val, key, +1) }

// « Toutes possibles » : marque possibles toutes les colonnes encore sans avis (garde priorités/refus).
export function toutesPossibles(val, colonnes) {
  const v = normaliserPref(val)
  for (const c of colonnes) {
    if (!v.prioritaires.includes(c.key) && !v.refusees.includes(c.key) && !v.possibles.includes(c.key)) {
      v.possibles.push(c.key)
    }
  }
  return v
}

export function reinitialiserPref() {
  return prefColonnesVide()
}

// Vrai si l'associé a exprimé au moins une préférence.
export function aDesPreferences(val) {
  return (val?.prioritaires?.length ?? 0) > 0
    || (val?.possibles?.length ?? 0) > 0
    || (val?.refusees?.length ?? 0) > 0
}
