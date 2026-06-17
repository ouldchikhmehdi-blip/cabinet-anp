// ============================================================
// compteursRef.js — « Compteurs de référence (cumul à ce stade) ».
//
// Le faiseur fabrique la 1ʳᵉ partie + l'été (+ Noël) directement dans Excel. Pour construire la suite,
// l'outil a besoin de connaître le cumul des compteurs par associé. Le faiseur COLLE son planning réel
// (texte tabulé + HTML pour les couleurs) ; on en extrait, par associé, les 8 paramètres suivis
// (cf. PLANNING.md §16 + LIGNES_BILAN de PlanningSemaines.jsx).
//
// DOUBLE COMPTAGE CROISÉ (décision faiseur) :
//   (a) NUMÉROS collés aux postes (A7, G5, Réa3…) → on prend le PLUS HAUT par associé/paramètre
//       = total à ce stade (système d'équité, cf. PLANNING.md §14) ;
//   (b) RECOMPTAGE indépendant via couleurs + structure (jour de semaine, fériés).
// Si (a) et (b) divergent → on signale la/les case(s) douteuse(s) ; le faiseur complète à la main.
//
// ⚠️ Les couleurs exactes de l'export du faiseur ne sont pas connues d'avance : la classification
// couleur (méthode b) est volontairement isolée dans `categorieCouleur()` et `classerCellule()`,
// à calibrer sur le 1ᵉʳ vrai collage. La méthode (a) reste la source principale.
// ============================================================
import { ASSOCIES } from '../data/associes'
import { extraireFondsHTML } from './trameEte'
import { numeroSemaineISO, joursFeriesFR, formatISO, formatDateLongueFR } from './calendrier'
import { COULEURS_GRILLE } from './grilleSemaine'

export const VERSION_CREF = 1

// Nom de mois français (avec/sans accent) → index 0-11, pour parser une date écrite en toutes lettres.
const MOIS_INDEX = {
  janvier: 0, fevrier: 1, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, aout: 7, août: 7, septembre: 8, octobre: 9, novembre: 10,
  decembre: 11, décembre: 11,
}

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

// Nombre minimal de jours « bleus » dans une semaine pour la considérer « semaine de vacances »
// (vs un simple repos isolé, qui partage la même couleur cyan — cf. PLANNING.md §4).
const SEUIL_JOURS_VACANCES = 3

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

// ── Couleurs ──────────────────────────────────────────────────────────────
// rgb/rgba → { r, g, b } ou null.
function parserRGB(css) {
  if (typeof css !== 'string') return null
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!m) return null
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
}

// hex 'RRGGBB' → { r, g, b }.
function hexRGB(hex) {
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) }
}

// Palette EXACTE de l'outil (clé COULEURS_GRILLE → catégorie métier). Le planning collé étant généré
// par l'outil, on apparie la couleur de fond à cette palette par PLUS PROCHE couleur (robuste au léger
// ré-encodage du presse-papiers) plutôt que par seuils.
const PALETTE = [
  ['garde', 'G'],       // jaune  FFFF00
  ['astreinte', 'A'],   // orange FFC000
  ['ferie', 'ferie'],   // vert   92D050
  ['conge', 'bleu'],    // bleu   00B0F0 (vacances / repos)
  ['weekend', 'gris'],  // gris   D9D9D9 (week-end non affecté → non compté)
].map(([cle, cat]) => ({ cat, ...hexRGB(COULEURS_GRILLE[cle]) }))

// Distance² max (par canal ~70) au-delà de laquelle on considère la couleur « neutre » (blanc, inconnu).
const TOLERANCE_COULEUR = 70 * 70 * 3

// Catégorie « métier » d'une couleur de fond : 'G', 'A', 'ferie', 'bleu', 'gris' ou '' (neutre/inconnu).
export function categorieCouleur(css) {
  const c = parserRGB(css)
  if (!c) return ''
  let best = ''; let bestD = Infinity
  for (const p of PALETTE) {
    const d = (c.r - p.r) ** 2 + (c.g - p.g) ** 2 + (c.b - p.b) ** 2
    if (d < bestD) { bestD = d; best = p.cat }
  }
  return bestD <= TOLERANCE_COULEUR ? best : ''
}

// ── Dates ─────────────────────────────────────────────────────────────────
// Extrait une date d'un libellé de cellule (« 05/01 », « 05/01/2026 », « lundi 5 janvier »).
// Renvoie un Date (UTC) ou null. `annee` sert quand l'année n'est pas écrite.
export function parserDateCellule(texte, annee) {
  if (typeof texte !== 'string') return null
  const t = texte.trim().toLowerCase()
  if (t === '') return null
  // jj/mm[/aaaa] (ou - .)
  const num = t.match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?/)
  if (num) {
    const j = Number(num[1]); const mo = Number(num[2])
    let an = num[3] ? Number(num[3]) : annee
    if (an < 100) an += 2000
    if (j >= 1 && j <= 31 && mo >= 1 && mo <= 12) return new Date(Date.UTC(an, mo - 1, j))
  }
  // « (jour) 5 janvier » : un numéro de jour + un nom de mois français.
  const motMois = t.match(/(\d{1,2})\s+([a-zéûôàè]+)/)
  if (motMois) {
    const j = Number(motMois[1])
    const mo = MOIS_INDEX[motMois[2]]
    if (Number.isInteger(mo) && j >= 1 && j <= 31) return new Date(Date.UTC(annee, mo, j))
  }
  return null
}

// ── Extraction d'un entier collé à un poste (A7 → 7, Réa3 → 3, « G 12 » → 12) ──
function extraireNombre(texte) {
  if (typeof texte !== 'string') return null
  const m = texte.trim().match(/(\d+)\s*$/)
  return m ? Number(m[1]) : null
}

// Token de poste sans son nombre, en majuscules (« Réa3 » → « RÉA », « G 5 » → « G »).
function tokenPoste(texte) {
  return String(texte ?? '').replace(/\d+/g, '').trim().toUpperCase()
}

// ── Classification d'une cellule → événement compté ──────────────────────────
// jour : 0=dim … 6=sam. Renvoie l'une des clés PARAMS_REF, ou 'bleu' (vacances/repos, tranché à la
// semaine), ou '' (rien à compter). La couleur prime, le texte et le jour départagent.
export function classerCellule(jour, estFerie, couleur, texte) {
  const cat = categorieCouleur(couleur)
  const tok = tokenPoste(texte)
  // Le TEXTE prime sur la couleur : un « A »/« G » explicite tranche, même si la teinte semble ambiguë.
  // La couleur ne sert qu'en l'absence de lettre (ex. « Endoscopie » sur fond jaune = garde de semaine).
  const lettreG = tok === 'G' || tok === 'GARDE'
  const lettreA = tok === 'A' || tok === 'ASTREINTE'
  const estG = lettreG || (cat === 'G' && !lettreA)
  const estA = lettreA || (cat === 'A' && !lettreG)
  const estRea = /^R[EÉ]A/.test(tok)
  const estRecup = /R[EÉ]CUP|RJF/.test(tok)

  if (estRecup) return 'recupFerie'
  if (estRea) return 'rea'
  if (cat === 'bleu') return 'bleu'

  const weekend = jour === 0 || jour === 6
  if (weekend) {
    if (estG) return 'gWeekend'
    if (estA) return 'aWeekend'
    return ''
  }
  if (jour === 5) { // vendredi
    if (estG) return 'gVendredi'
    if (estA) return 'aVendredi'
    return ''
  }
  // Garde de semaine = mardi (toujours) ou jeudi (si garde) ; lundi/mercredi = astreinte non comptée.
  if ((jour === 2 || jour === 4) && estG) return 'gardeSemaine'
  // Un férié ouvré travaillé hors garde → récupération (heuristique de secours, si non déjà 'recupFerie').
  if (estFerie && !estG && !estA && tok !== '' && cat !== 'bleu') return 'recupFerie'
  return ''
}

// ── Parsing du planning collé ────────────────────────────────────────────────
// Renvoie { associes:[ini…], lignes:[{ dateLabel, iso, jour, estFerie, num,
//           cells:[{ ini, texte, couleur, nombre, evenement }] }], enteteTrouvee }.
export function parserPlanningComplet(texte, html, annee) {
  const vide = { associes: [], lignes: [], enteteTrouvee: false }
  if (typeof texte !== 'string' || texte.trim() === '') return vide
  const brut = texte.replace(/\r/g, '').split('\n')
  while (brut.length > 0 && brut[brut.length - 1].trim() === '') brut.pop()
  if (brut.length === 0) return vide
  const matrice = brut.map(l => l.split('\t').map(c => c.trim()))
  const fonds = extraireFondsHTML(html)

  // 1) Ligne d'en-tête = celle qui contient le plus d'initiales d'associés.
  const setAssocies = new Set(ASSOCIES)
  let rEntete = -1; let meilleur = 0
  matrice.forEach((ligne, r) => {
    const n = ligne.filter(c => setAssocies.has(c.toUpperCase())).length
    if (n > meilleur) { meilleur = n; rEntete = r }
  })
  const enteteTrouvee = meilleur >= 4
  // 2) Colonnes des associés (col → ini), dans l'ordre figé ASSOCIES.
  const colParIni = {}
  if (rEntete >= 0) {
    matrice[rEntete].forEach((c, k) => {
      const ini = c.toUpperCase()
      if (setAssocies.has(ini) && colParIni[ini] == null) colParIni[ini] = k
    })
  }
  const associes = ASSOCIES.filter(ini => colParIni[ini] != null)
  const premiereColAssocie = associes.length
    ? Math.min(...associes.map(ini => colParIni[ini]))
    : 1

  // 3) Set des fériés ouvrés (ISO) de l'année.
  const feriesSet = new Set(joursFeriesFR(annee).map(f => f.iso))

  // 4) Lignes de données.
  const lignes = []
  matrice.forEach((ligne, r) => {
    if (r === rEntete) return
    // Date : 1ʳᵉ cellule (avant les colonnes associés) qui parse en date.
    let date = null; let dateLabel = ''
    for (let k = 0; k < Math.max(1, premiereColAssocie); k++) {
      const d = parserDateCellule(ligne[k] ?? '', annee)
      if (d) { date = d; dateLabel = ligne[k]; break }
    }
    if (!date) return // ligne sans date exploitable (titres, séparateurs…)
    const jour = date.getUTCDay()
    const iso = formatISO(date)
    const num = numeroSemaineISO(date)
    const estFerie = feriesSet.has(iso)
    const cells = associes.map(ini => {
      const k = colParIni[ini]
      const txt = ligne[k] ?? ''
      const couleur = fonds?.[r]?.[k] ?? ''
      return { ini, texte: txt, couleur, nombre: extraireNombre(txt), evenement: classerCellule(jour, estFerie, couleur, txt) }
    })
    lignes.push({ dateLabel: dateLabel || formatDateLongueFR(date), iso, jour, estFerie, num, cells })
  })

  return { associes, lignes, enteteTrouvee }
}

// ── Double comptage + réconciliation ─────────────────────────────────────────
// Renvoie { compteurs, doutes } :
//   compteurs[ini][param] = valeur retenue (numéro si présent, sinon recomptage) ;
//   doutes = [{ ini, param, label, parNumero, parOccurrences, dates:[…] }] quand les deux divergent.
export function reconcilier(parse) {
  const compteurs = compteursVides()
  const doutes = []
  const associes = parse.associes.length ? parse.associes : ASSOCIES

  for (const ini of associes) {
    if (!compteurs[ini]) compteurs[ini] = Object.fromEntries(CLES_PARAM.map(k => [k, 0]))
    // Accumulateurs méthode (b) + numéros méthode (a).
    const occ = Object.fromEntries(CLES_PARAM.map(k => [k, 0]))
    const maxNum = Object.fromEntries(CLES_PARAM.map(k => [k, null]))
    const datesParam = Object.fromEntries(CLES_PARAM.map(k => [k, []]))
    const semainesRea = new Set()
    const bleusParSemaine = {} // num → nb de jours bleus

    for (const ligne of parse.lignes) {
      const cell = ligne.cells.find(c => c.ini === ini)
      if (!cell) continue
      const ev = cell.evenement
      if (ev === 'bleu') {
        bleusParSemaine[ligne.num] = (bleusParSemaine[ligne.num] ?? 0) + 1
        // Le n° cumulé de semaine de vacances est écrit sur le LUNDI de la case bleue (cf. celluleAssocieJour).
        if (cell.nombre != null) {
          maxNum.vacances = Math.max(maxNum.vacances ?? 0, cell.nombre)
          datesParam.vacances.push(ligne.dateLabel)
        }
        continue
      }
      if (!CLES_PARAM.includes(ev)) continue
      datesParam[ev].push(ligne.dateLabel)
      if (cell.nombre != null) maxNum[ev] = Math.max(maxNum[ev] ?? 0, cell.nombre)
      if (ev === 'rea') semainesRea.add(ligne.num)
      else occ[ev] += 1
    }
    // Réa et vacances : comptage à la SEMAINE.
    occ.rea = semainesRea.size
    occ.vacances = Object.values(bleusParSemaine).filter(n => n >= SEUIL_JOURS_VACANCES).length

    for (const [k, label] of PARAMS_REF) {
      const a = maxNum[k]
      const b = occ[k]
      const retenu = a != null ? a : b
      compteurs[ini][k] = retenu
      // Doute : les deux méthodes donnent un résultat et divergent, ou un numéro existe sans recomptage.
      const divergent = (a != null && b > 0 && a !== b) || (a != null && b === 0)
      if (divergent) {
        doutes.push({ ini, param: k, label, parNumero: a, parOccurrences: b, dates: datesParam[k].slice(0, 8) })
      }
    }
  }
  return { compteurs, doutes }
}

// Analyse complète d'un collage → { compteurs, doutes, parse }.
export function analyserCollagePlanning(texte, html, annee) {
  const parse = parserPlanningComplet(texte, html, annee)
  const { compteurs, doutes } = reconcilier(parse)
  return { compteurs, doutes, parse }
}
