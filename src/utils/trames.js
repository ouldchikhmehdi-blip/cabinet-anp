// ============================================================
// trames.js — modèle + parsing du catalogue de « semaines type » (PLANNING.md §4, §11).
// Une trame = une SEMAINE TYPE entière (grille) : N colonnes, chaque colonne étant une
// séquence figée lun→ven de postes ("" = repos). Les colonnes sont interchangeables entre
// associés, mais la succession à l'intérieur d'une colonne ne change jamais. Au moment de
// l'affectation (étape ultérieure), certaines colonnes sont reconnues automatiquement :
// colonne tout en Réa, colonne entièrement vide (vacances), colonne lundi+vendredi off
// (retour de week-end), et la colonne dont un jour est off pour coller à un jour off demandé.
//
// Le faiseur apporte ses trames par collage depuis Excel. Persistance dans tramesApi.js.
// data = { v, trames: [ { id, nom, colonnes: [ { lun, mar, mer, jeu, ven } ] } ] }
// ============================================================
export const VERSION_TRAMES = 1

// Jours couverts par une colonne (lun→ven). Le week-end est géré dans l'étape Week-ends.
export const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven']
export const JOURS_LABEL = { lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi', jeu: 'Jeudi', ven: 'Vendredi' }

export function tramesVide() {
  return { v: VERSION_TRAMES, trames: [] }
}

// Renvoie un objet jours complet (les 5 clés), valeurs nettoyées ; cellule vide = repos ("").
function normaliserJours(src) {
  const jours = {}
  for (const j of JOURS) {
    const v = src && typeof src === 'object' ? src[j] : ''
    jours[j] = typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim())
  }
  return jours
}

export function normaliserTrames(data) {
  const liste = Array.isArray(data?.trames) ? data.trames : []
  const trames = liste.map(t => {
    // Tolère un ancien format { jours } (1 colonne) → on l'enveloppe en colonnes:[…].
    const colsSrc = Array.isArray(t?.colonnes)
      ? t.colonnes
      : (t?.jours ? [t.jours] : [])
    return {
      id: Number.isInteger(t?.id) ? t.id : null,
      nom: typeof t?.nom === 'string' ? t.nom.trim() : '',
      colonnes: colsSrc.map(normaliserJours),
    }
  })
  // Garantit des id entiers uniques et stables (déterministe, sans Date.now/Math.random).
  const dejaPris = new Set(trames.map(t => t.id).filter(Number.isInteger))
  let prochain = 1
  for (const t of trames) {
    if (!Number.isInteger(t.id) || t.id < 1) {
      while (dejaPris.has(prochain)) prochain++
      t.id = prochain
      dejaPris.add(prochain)
      prochain++
    }
  }
  return { v: VERSION_TRAMES, trames }
}

// Prochain id disponible pour une nouvelle trame (déterministe : max existant + 1).
export function prochainIdTrame(trames) {
  let max = 0
  for (const t of trames) if (Number.isInteger(t?.id) && t.id > max) max = t.id
  return max + 1
}

// Une colonne est-elle entièrement vide (que du repos) ? (sert à la détection « vacances »).
export function colonneVide(jours) {
  return JOURS.every(j => !(jours?.[j] ?? '').trim())
}

// Parse un bloc collé depuis Excel (tabulations entre colonnes, retours-ligne entre jours).
// Disposition attendue : 5 lignes (lun→ven) × N colonnes (les colonnes de la semaine type).
// Renvoie les colonnes d'UNE trame : [{ lun..ven }, …]. Cellule vide → repos ("").
// On rogne les colonnes entièrement vides en début/fin (sélection Excel trop large), mais on
// CONSERVE une colonne vide intérieure (c'est la colonne « vacances » de la trame).
export function parserCollage(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return []
  const lignes = texte.replace(/\r/g, '').split('\n')
  while (lignes.length > 0 && lignes[lignes.length - 1].trim() === '') lignes.pop()
  if (lignes.length === 0) return []

  const matrice = lignes.map(l => l.split('\t').map(c => c.trim()))
  const nbColonnes = matrice.reduce((m, ligne) => Math.max(m, ligne.length), 0)

  const colonnes = []
  for (let c = 0; c < nbColonnes; c++) {
    const jours = {}
    JOURS.forEach((j, i) => { jours[j] = matrice[i]?.[c] ?? '' })
    colonnes.push(jours)
  }

  // Rogne uniquement les colonnes vides aux extrémités (garde les vides intérieures).
  let debut = colonnes.findIndex(j => !colonneVide(j))
  if (debut === -1) return []
  let fin = colonnes.length - 1
  while (fin > debut && colonneVide(colonnes[fin])) fin--
  return colonnes.slice(debut, fin + 1)
}
