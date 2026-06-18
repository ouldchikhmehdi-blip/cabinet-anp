// ============================================================
// referenceGrille.js — capture d'une grille collée (tiers 1+2 faits à la main) SANS reconnaissance.
// On ne cherche PAS à interpréter les couleurs en rôles (≠ noel.js) : on conserve le texte de chaque
// cellule et sa couleur de fond BRUTE (hex), pour la reproduire telle quelle, en référence, en haut de
// l'export Excel du 3ᵉ tiers. Modèle de données :
//   { v, colle:'<texte collé brut>', lignes: [ [ { t:'<texte>', c:'#RRGGBB'|null }, … ], … ] }
// ============================================================

export const VERSION_REF = 1

export function referenceVide() {
  return { v: VERSION_REF, colle: '', lignes: [] }
}

// Vrai si la référence contient au moins une ligne de cellules (donc utilisable à l'export).
export function referenceNonVide(data) {
  return Array.isArray(data?.lignes) && data.lignes.length > 0
}

// Convertit une couleur CSS (rgb(...)/rgba(...)/#hex) en '#RRGGBB', ou null si transparente/inconnue.
function couleurVersHex(css) {
  if (!css || typeof css !== 'string') return null
  const s = css.trim()
  if (s === 'transparent' || s === 'rgba(0, 0, 0, 0)') return null
  const mRgb = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i)
  if (mRgb) {
    const a = mRgb[4] != null ? Number(mRgb[4]) : 1
    if (a === 0) return null // totalement transparent → pas de fond
    const hex = (n) => Number(n).toString(16).padStart(2, '0')
    const c = `#${hex(mRgb[1])}${hex(mRgb[2])}${hex(mRgb[3])}`.toUpperCase()
    return c === '#FFFFFF' ? null : c // blanc = pas de fond (évite de peindre tout en blanc)
  }
  const mHex = s.match(/^#([0-9a-f]{6})$/i)
  if (mHex) {
    const c = `#${mHex[1].toUpperCase()}`
    return c === '#FFFFFF' ? null : c
  }
  const mHex3 = s.match(/^#([0-9a-f]{3})$/i)
  if (mHex3) {
    const [r, g, b] = mHex3[1]
    const c = `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
    return c === '#FFFFFF' ? null : c
  }
  return null
}

// Découpe le texte tabulé en lignes de cellules { t, c:null } (repli quand pas de HTML).
function parserTexte(texte) {
  const lignes = String(texte ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l, i, arr) => !(i === arr.length - 1 && l === '')) // dernière ligne vide ignorée
  return lignes.map(l => l.split('\t').map(t => ({ t: t.trim(), c: null })))
}

// Parse le presse-papiers : texte + (si présent) HTML, pour conserver le texte ET la couleur de fond
// de chaque cellule. S'inspire de extraireCouleursHTML (trames.js) mais capture AUSSI le contenu et
// la couleur exacte (aucun snapping de palette). Sans HTML exploitable, repli sur le texte tabulé.
export function parserCollageReference(texte, html) {
  if (typeof html === 'string' && html !== '' && typeof document !== 'undefined') {
    const hote = document.createElement('div')
    hote.style.cssText = 'position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden'
    hote.innerHTML = html
    document.body.appendChild(hote)
    try {
      const table = hote.querySelector('table')
      if (table) {
        const trs = Array.from(table.querySelectorAll('tr')).filter(tr => tr.querySelector('td,th'))
        const lignes = trs.map(tr => {
          const out = []
          for (const cell of tr.querySelectorAll('td,th')) {
            const t = (cell.textContent ?? '').replace(/\s+/g, ' ').trim()
            const c = couleurVersHex(getComputedStyle(cell).backgroundColor)
            for (let k = 0; k < Math.max(1, cell.colSpan); k++) out.push({ t, c })
          }
          return out
        })
        if (lignes.length) return { v: VERSION_REF, colle: String(texte ?? ''), lignes }
      }
    } finally {
      hote.remove()
    }
  }
  return { v: VERSION_REF, colle: String(texte ?? ''), lignes: parserTexte(texte) }
}

// Normalise/valide une structure venue de la base (défense contre données malformées).
export function normaliserReference(src) {
  if (!src || typeof src !== 'object') return referenceVide()
  const srcLignes = Array.isArray(src.lignes) ? src.lignes : []
  const lignes = srcLignes
    .map(ligne => (Array.isArray(ligne) ? ligne.map(cell => ({
      t: typeof cell?.t === 'string' ? cell.t : '',
      c: typeof cell?.c === 'string' && /^#[0-9A-F]{6}$/i.test(cell.c) ? cell.c.toUpperCase() : null,
    })) : []))
    .filter(ligne => ligne.length > 0)
  return { v: VERSION_REF, colle: typeof src.colle === 'string' ? src.colle : '', lignes }
}
