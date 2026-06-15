// ============================================================
// trames.js — modèle + parsing du catalogue de « semaines type » (PLANNING.md §4, §11).
// Une trame = la semaine (lun→ven) d'UN associé : suite ordonnée de postes, "" = repos.
// Le faiseur apporte ses trames par collage depuis Excel. Persistance dans tramesApi.js.
//
// data = { v, trames: [ { id, nom, jours: { lun, mar, mer, jeu, ven } } ] }
// ============================================================
export const VERSION_TRAMES = 1

// Jours couverts par une trame (lun→ven). Le week-end est géré dans l'étape Week-ends.
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
  let prochainId = 1
  const trames = liste.map(t => {
    const id = Number.isInteger(t?.id) ? t.id : null
    return {
      id, // réassigné juste après pour garantir l'unicité/numérotation
      nom: typeof t?.nom === 'string' ? t.nom.trim() : '',
      jours: normaliserJours(t?.jours),
    }
  })
  // Garantit des id entiers uniques et stables (max+1, déterministe).
  const dejaPris = new Set(trames.map(t => t.id).filter(Number.isInteger))
  for (const t of trames) {
    if (!Number.isInteger(t.id) || t.id < 1) {
      while (dejaPris.has(prochainId)) prochainId++
      t.id = prochainId
      dejaPris.add(prochainId)
      prochainId++
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

// Parse un bloc collé depuis Excel (tabulations entre colonnes, retours-ligne entre jours).
// Disposition attendue : 5 lignes (lun→ven) × N colonnes (un associé = une colonne = une trame).
// Renvoie [{ jours: { lun..ven } }, …] : une entrée par colonne non entièrement vide.
// Cellule vide → repos (""). Les lignes au-delà de la 5ᵉ sont ignorées ; les manquantes = repos.
export function parserCollage(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return []
  // On garde les cellules vides intermédiaires (split sans filtrage), on retire le \r de Windows.
  const lignes = texte.replace(/\r/g, '').split('\n')
  // On retire uniquement les lignes vides en fin de bloc (collage Excel ajoute souvent un \n final).
  while (lignes.length > 0 && lignes[lignes.length - 1].trim() === '') lignes.pop()
  if (lignes.length === 0) return []

  const matrice = lignes.map(l => l.split('\t').map(c => c.trim()))
  const nbColonnes = matrice.reduce((m, ligne) => Math.max(m, ligne.length), 0)

  const colonnes = []
  for (let c = 0; c < nbColonnes; c++) {
    const jours = {}
    let aDuContenu = false
    JOURS.forEach((j, i) => {
      const val = matrice[i]?.[c] ?? ''
      jours[j] = val
      if (val !== '') aDuContenu = true
    })
    if (aDuContenu) colonnes.push({ jours })
  }
  return colonnes
}

// Une trame est-elle vide (que du repos) ? Utile pour filtrer/avertir.
export function trameVide(trame) {
  return JOURS.every(j => !(trame?.jours?.[j] ?? '').trim())
}
