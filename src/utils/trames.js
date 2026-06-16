// ============================================================
// trames.js — modèle + parsing du catalogue de « semaines type » (PLANNING.md §4, §11).
// Une trame = une SEMAINE TYPE entière (grille) : N colonnes, chaque colonne étant une
// séquence figée lun→ven de postes ("" = repos). Les colonnes sont interchangeables entre
// associés, mais la succession à l'intérieur d'une colonne ne change jamais.
//
// Des colonnes spéciales sont DÉSIGNÉES par le faiseur sur chaque trame (index, ou null) :
//   - rea      : colonne de réanimation (à donner à l'associé de réa) ;
//   - vacances : TABLEAU d'index — une ou PLUSIEURS colonnes de vacances (autant de postes de congé) ;
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
// rea / avantWE / apresWE / remplacants[].col = index (0-based) d'une colonne ; vacances = tableau d'index.
//
// Chaque colonne porte EN PLUS un objet `service` { lun..ven } booléen : true = cette colonne est
// « de service » (de garde/astreinte) ce jour-là, détecté au collage depuis le FOND de couleur des
// cellules Excel (jaune ou orange ⇒ de service, cf. PLANNING.md §14). La couleur dit QUI est de
// service ; le TYPE garde/astreinte vient d'ailleurs : lun=A/mar=G/mer=A fixes (§3), jeu/ven de la
// base calendrier (rotation, par semaine) — cf. typeDuJour() dans calendrier.js. Le comptage par
// personne croisera `service` × typeDuJour × affectation des colonnes (à venir).
// ============================================================
import { ASSOCIES } from '../data/associes'

export const VERSION_TRAMES = 3

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

// Renvoie un objet `service` complet (les 5 clés) booléen. Tolérant aux deux formes : un booléen
// (nouvelle forme) ou un ancien statut 'G'/'A' (itération précédente non déployée) ⇒ de service.
function normaliserService(src) {
  const service = {}
  for (const j of JOURS) {
    const v = src && typeof src === 'object' ? src[j] : null
    service[j] = v === true || v === 'G' || v === 'A'
  }
  return service
}

export function normaliserTrames(data) {
  const liste = Array.isArray(data?.trames) ? data.trames : []
  const trames = liste.map(t => {
    // Tolère un ancien format { jours } (1 colonne) → on l'enveloppe en colonnes:[…].
    const colsSrc = Array.isArray(t?.colonnes)
      ? t.colonnes
      : (t?.jours ? [t.jours] : [])
    const colonnes = colsSrc.map(c => ({ ...normaliserJours(c), service: normaliserService(c?.service ?? c?.statuts) }))
    // Index de colonne valide (dans les bornes) sinon null.
    const idxCol = (v) => (Number.isInteger(v) && v >= 0 && v < colonnes.length ? v : null)
    // Tableau d'index valides, dédupliqués et triés. Migration tolérante : un ancien nombre unique
    // (vacances = index) devient [index] ; null/absent → [].
    const idxColArray = (v) => {
      const src = Array.isArray(v) ? v : (v == null ? [] : [v])
      return [...new Set(src.map(idxCol).filter(i => i != null))].sort((a, b) => a - b)
    }
    return {
      id: Number.isInteger(t?.id) ? t.id : null,
      nom: typeof t?.nom === 'string' ? t.nom.trim() : '',
      colonnes,
      rea: idxCol(t?.rea),
      vacances: idxColArray(t?.vacances),
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

// Capacité d'accueil de vacances d'une trame = nombre de colonnes vacances DÉSIGNÉES (= nombre de
// vacanciers plaçables). Par défaut, suggererRoles désigne toutes les colonnes entièrement vides, mais
// le faiseur peut en ajouter/retirer. Sert à ne proposer, pour N vacanciers, que les trames à ≥ N.
export function capaciteVacances(trame) {
  return (trame?.vacances ?? []).length
}

// Indices des colonnes qu'un associé peut DEMANDER dans ses desiderata : on exclut les colonnes
// affectées automatiquement — Réa, Vacances, Remplaçant, ainsi que les colonnes avant-WE et
// après-WE (fixées par l'attribution des week-ends, donc non demandables).
export function colonnesSelectionnables(trame) {
  if (!trame) return []
  const exclus = new Set()
  if (trame.rea != null) exclus.add(trame.rea)
  for (const i of trame.vacances ?? []) exclus.add(i)
  if (trame.avantWE != null) exclus.add(trame.avantWE)
  if (trame.apresWE != null) exclus.add(trame.apresWE)
  for (const r of trame.remplacants ?? []) if (r.col != null) exclus.add(r.col)
  return trame.colonnes.map((_, i) => i).filter(i => !exclus.has(i))
}

function normaliserPoste(v) {
  return (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Suggestions de désignation à la création (le faiseur reste libre de corriger) :
//   - vacances : TOUTES les colonnes entièrement vides (autant de postes de congé) ;
//   - rea      : 1ʳᵉ colonne dont les 5 jours contiennent « rea » ;
//   - apresWE  : 1ʳᵉ colonne avec lundi ET vendredi au repos (cases vides) mais pas entièrement
//                vide — retour de garde de week-end → repos le lundi (et le vendredi), §7. C'est
//                forcément la colonne « après le week-end » ; le faiseur n'a plus qu'à désigner
//                l'« avant le week-end ».
//   - remplacants : les colonnes AU-DELÀ des 8 associés (index ≥ ASSOCIES.length, soit C9, C10, C11…)
//                qui ne sont pas vides — ce sont forcément des postes de remplaçant externe. Le nom
//                reste à compléter par le faiseur.
function estRepos(col, j) { return !(col?.[j] ?? '').trim() }
export function suggererRoles(colonnes) {
  const vacances = colonnes.map((col, i) => (colonneVide(col) ? i : -1)).filter(i => i !== -1)
  let rea = colonnes.findIndex(col => JOURS.every(j => normaliserPoste(col[j]).includes('rea')))
  if (rea === -1) rea = null
  let apresWE = colonnes.findIndex((col, i) =>
    i !== rea && !colonneVide(col) && estRepos(col, 'lun') && estRepos(col, 'ven'))
  if (apresWE === -1) apresWE = null
  const remplacants = colonnes
    .map((col, i) => i)
    .filter(i => i >= ASSOCIES.length && i !== rea && i !== apresWE && !colonneVide(colonnes[i]))
    .map(col => ({ col, nom: '' }))
  return { rea, vacances, avantWE: null, apresWE, remplacants }
}

// Construit les colonnes brutes d'un bloc collé (texte tabulé : tabulations entre colonnes,
// retours-ligne entre jours). Renvoie { colonnes, debut, fin } : `colonnes` est la liste COMPLÈTE
// (non rognée) [{ lun..ven }, …] ; `debut`/`fin` délimitent la plage utile (colonnes vides aux
// extrémités exclues, mais une colonne vide intérieure — « vacances » — est conservée). `debut`
// vaut -1 si tout est vide. Le marqueur `service` est ajouté ensuite, en réutilisant la même plage.
function _matriceColonnes(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return { colonnes: [], debut: -1, fin: -1 }
  const lignes = texte.replace(/\r/g, '').split('\n')
  while (lignes.length > 0 && lignes[lignes.length - 1].trim() === '') lignes.pop()
  if (lignes.length === 0) return { colonnes: [], debut: -1, fin: -1 }

  const matrice = lignes.map(l => l.split('\t').map(c => c.trim()))
  const nbColonnes = matrice.reduce((m, ligne) => Math.max(m, ligne.length), 0)

  const colonnes = []
  for (let c = 0; c < nbColonnes; c++) {
    const jours = {}
    JOURS.forEach((j, i) => { jours[j] = matrice[i]?.[c] ?? '' })
    colonnes.push(jours)
  }

  const debut = colonnes.findIndex(j => !colonneVide(j))
  if (debut === -1) return { colonnes, debut: -1, fin: -1 }
  let fin = colonnes.length - 1
  while (fin > debut && colonneVide(colonnes[fin])) fin--
  return { colonnes, debut, fin }
}

// Parse un bloc collé depuis Excel (texte brut). Renvoie les colonnes d'UNE trame :
// [{ lun..ven, service }, …], cellule vide → repos (""), service tout false (pas de couleur).
export function parserCollage(texte) {
  const { colonnes, debut, fin } = _matriceColonnes(texte)
  if (debut === -1) return []
  return colonnes.slice(debut, fin + 1).map(j => ({ ...j, service: normaliserService(null) }))
}

// Classe une couleur de fond CSS ('rgb(r,g,b)' / 'rgba(r,g,b,a)') en couleur de service :
//   jaune  → 'G' (garde),  orange → 'A' (astreinte),  autre/blanc/transparent → null.
// Brique bas-niveau : le modèle ne retient que « non-null ⇒ de service » (le type vient ailleurs).
// Le canal vert distingue jaune (G≈255) d'orange (G≈192) ; on teste le jaune d'abord.
export function classifierCouleur(css) {
  if (typeof css !== 'string') return null
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i)
  if (!m) return null
  const r = Number(m[1]), g = Number(m[2]), b = Number(m[3])
  const a = m[4] === undefined ? 1 : Number(m[4])
  if (a === 0) return null                          // transparent
  if (r > 240 && g > 240 && b > 240) return null    // blanc
  if (r >= 200 && g >= 200 && b <= 120) return 'G'  // jaune  #FFFF00 (vert très haut)
  if (r >= 200 && g >= 120 && g <= 215 && b <= 120 && r - g >= 35) return 'A' // orange #FFC000
  return null
}

// Extrait du HTML du presse-papiers Excel une matrice couleurs[ligne][colonne] ('G'|'A'|null),
// ou null si pas de table exploitable. Excel pose la couleur en style inline OU via des classes
// CSS d'un bloc <style> ; pour résoudre les deux, on injecte le fragment dans un conteneur
// hors-écran ATTACHÉ au document (getComputedStyle ne résout les classes que dans le document).
function extraireCouleursHTML(html) {
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
        const st = classifierCouleur(getComputedStyle(cell).backgroundColor)
        for (let k = 0; k < Math.max(1, cell.colSpan); k++) out.push(st) // colspan défensif
      }
      return out
    })
  } finally {
    hote.remove()
  }
}

// Comme parserCollage, mais lit AUSSI le fond de couleur Excel (depuis le HTML du presse-papiers)
// pour renseigner `service` { lun..ven } (booléen) par colonne : une cellule jaune OU orange ⇒ de
// service. La matrice de couleurs est alignée par index (ligne = jour, colonne = position), puis
// rognée à la même plage que le texte.
export function parserCollageAvecCouleurs(texte, html) {
  const { colonnes, debut, fin } = _matriceColonnes(texte)
  if (debut === -1) return []
  const matriceCouleur = extraireCouleursHTML(html)
  const serviceParColonne = colonnes.map((_, c) => {
    const sv = {}
    JOURS.forEach((j, i) => { sv[j] = matriceCouleur?.[i]?.[c] != null })
    return normaliserService(sv)
  })
  const cols = colonnes.slice(debut, fin + 1)
  const svCols = serviceParColonne.slice(debut, fin + 1)
  return cols.map((j, k) => ({ ...j, service: svCols[k] }))
}
