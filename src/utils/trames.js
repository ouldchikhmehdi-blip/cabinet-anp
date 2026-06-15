// ============================================================
// trames.js — modèle + parsing du catalogue de « semaines type » (PLANNING.md §4, §11).
// Une trame = une SEMAINE TYPE entière (grille) : N colonnes, chaque colonne étant une
// séquence figée lun→ven de postes ("" = repos). Les colonnes sont interchangeables entre
// associés, mais la succession à l'intérieur d'une colonne ne change jamais.
//
// Quatre colonnes spéciales sont DÉSIGNÉES par le faiseur sur chaque trame (index, ou null) :
//   - rea      : colonne de réanimation (à donner à l'associé de réa) ;
//   - vacances : colonne de vacances (semaine de congé) ;
//   - avantWE  : colonne d'avant week-end (celui qui s'apprête à faire le week-end) ;
//   - apresWE  : colonne du retour de week-end (celui qui sort d'un week-end).
// Au moment de l'affectation, ces colonnes se remplissent automatiquement selon les étapes
// précédentes (Réa, Vacances, Week-ends). Le reste des colonnes colle aux jours off demandés.
//
// Certaines trames comportent EN PLUS une ou plusieurs colonnes « remplaçant » (le ou les
// remplaçants pris cette semaine-là). Le faiseur les désigne et les nomme librement
// (« Remplaçant 1 », « Remplaçant 2 »…) via remplacants: [ { col, nom } ].
//
// Le faiseur désigne une TRAME PRINCIPALE (data.principaleId) : celle qui est affichée aux
// associés dans leurs desiderata pour qu'ils choisissent une colonne par semaine.
//
// Le faiseur apporte ses trames par collage depuis Excel. Persistance dans tramesApi.js.
// data = { v, principaleId, trames: [ { id, nom, colonnes: [ {lun..ven} ], rea, vacances,
//                                       avantWE, apresWE, remplacants: [ { col, nom } ] } ] }
// rea / vacances / avantWE / apresWE / remplacants[].col = index (0-based) d'une colonne.
// ============================================================
export const VERSION_TRAMES = 1

// Jours couverts par une colonne (lun→ven). Le week-end est géré dans l'étape Week-ends.
export const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven']
export const JOURS_LABEL = { lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi', jeu: 'Jeudi', ven: 'Vendredi' }

export function tramesVide() {
  return { v: VERSION_TRAMES, principaleId: null, trames: [] }
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
    const colonnes = colsSrc.map(normaliserJours)
    // Index de colonne valide (dans les bornes) sinon null.
    const idxCol = (v) => (Number.isInteger(v) && v >= 0 && v < colonnes.length ? v : null)
    return {
      id: Number.isInteger(t?.id) ? t.id : null,
      nom: typeof t?.nom === 'string' ? t.nom.trim() : '',
      colonnes,
      rea: idxCol(t?.rea),
      vacances: idxCol(t?.vacances),
      avantWE: idxCol(t?.avantWE),
      apresWE: idxCol(t?.apresWE),
      remplacants: Array.isArray(t?.remplacants)
        ? t.remplacants
            .map(r => ({ col: idxCol(r?.col), nom: typeof r?.nom === 'string' ? r.nom.trim() : '' }))
            .filter(r => r.col != null)
        : [],
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
  // Trame principale : doit pointer sur une trame existante, sinon null.
  const principaleId = trames.some(t => t.id === data?.principaleId) ? data.principaleId : null
  return { v: VERSION_TRAMES, principaleId, trames }
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

// Indices des colonnes qu'un associé peut DEMANDER dans ses desiderata : on exclut les colonnes
// affectées automatiquement — Réa, Vacances et Remplaçant (avant/après WE restent demandables).
export function colonnesSelectionnables(trame) {
  if (!trame) return []
  const exclus = new Set()
  if (trame.rea != null) exclus.add(trame.rea)
  if (trame.vacances != null) exclus.add(trame.vacances)
  for (const r of trame.remplacants ?? []) if (r.col != null) exclus.add(r.col)
  return trame.colonnes.map((_, i) => i).filter(i => !exclus.has(i))
}

function normaliserPoste(v) {
  return (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Suggestions de désignation à la création (le faiseur reste libre de corriger) :
//   - vacances : 1ʳᵉ colonne entièrement vide ;
//   - rea      : 1ʳᵉ colonne dont les 5 jours contiennent « rea ».
export function suggererRoles(colonnes) {
  let vacances = colonnes.findIndex(colonneVide)
  if (vacances === -1) vacances = null
  let rea = colonnes.findIndex(col => JOURS.every(j => normaliserPoste(col[j]).includes('rea')))
  if (rea === -1) rea = null
  return { rea, vacances, avantWE: null, apresWE: null }
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
