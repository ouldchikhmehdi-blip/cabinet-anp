// ============================================================
// noel.js — Moteur des « blocs imposés » fournis tels quels : une grille colorée jour × associés
// collée depuis Excel, détectée (pas calculée) et intégrée au bilan/export. Conçu pour Noël, ce moteur
// est GÉNÉRIQUE et sert AUSSI aux vacances de la Toussaint (cf. toussaintApi.js / PlanningVacances) :
// parserCollageNoel / normaliserNoel / bilanNoel / semainesImposeesNoel / weekendsGardeNoel /
// compteursNoel / groupeJourNoel ne supposent rien de spécifique à Noël (la déduction d'année gère
// oct/nov → annee comme nov/déc). Les noms gardent le suffixe « Noel » pour limiter le churn.
//
// noel.js — Période de Noël « fournie telle quelle » (PLANNING.md §10).
// Le faiseur COLLE depuis Excel la grille assemblée des ~15 jours : 1ʳᵉ colonne = dates,
// colonnes suivantes = les 8 associés. Cases jaune = garde, orange = astreinte (convention
// existante, cf. classifierCouleur), texte = poste (« Réa »…), case vide = repos.
//
// L'outil DÉTECTE (pas de calcul/proposition) puis intègre au bilan annuel :
//   - garde dimanche → G week-end ; garde vendredi → G vendredi ; garde lun→jeu → garde de semaine ;
//   - astreinte vendredi → A vendredi ;
//   - jour férié TRAVAILLÉ sans être de service → récup JF (réa comprise, jamais de service) ;
//   - semaines (ISO) distinctes avec ≥1 case « réa » → semaines de réa.
//
// Modèle persistant (table planning_noel) :
//   { v:1, colle:'<texte brut>', jours:[{ iso:'YYYY-MM-DD', parAssocie:{ <ini>:{ poste, role } } }] }
//   role ∈ 'G' | 'A' | null
// ============================================================
import { ASSOCIES } from '../data/associes'
import { extraireCouleursHTML } from './trames'
import { COULEURS_GRILLE } from './grilleSemaine'
import { parseISO, formatISO, numeroSemaineISO, joursFeriesFR } from './calendrier'

export const VERSION_NOEL = 1

// Palette EXACTE de l'outil (clé COULEURS_GRILLE → rôle Noël). On apparie par PLUS PROCHE couleur :
// la grille de Noël est colorée avec ces teintes (jaune=garde, orange=astreinte, cyan=congé/repos,
// vert=férié → récup), donc plus robuste que des seuils. weekend (gris) → null (pas un rôle).
const PALETTE_NOEL = [
  ['garde', 'G'],       // jaune  FFFF00
  ['astreinte', 'A'],   // orange FFC000
  ['conge', 'C'],       // bleu   00B0F0 (congé / repos)
  ['ferie', 'F'],       // vert   92D050 (jour férié → récup)
].map(([cle, role]) => {
  const hex = COULEURS_GRILLE[cle]
  return { role, r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) }
})
const TOLERANCE_NOEL = 70 * 70 * 3 // distance² max avant de considérer la couleur « neutre »

// Classifie une couleur de fond CSS pour Noël : 'G' (garde, jaune), 'A' (astreinte, orange),
// 'C' (congé/repos, cyan), 'F' (jour férié → récup, vert), ou null (blanc/gris/transparent/inconnu).
export function classifierCouleurNoel(css) {
  if (typeof css !== 'string') return null
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i)
  if (!m) return null
  const r = Number(m[1]), g = Number(m[2]), b = Number(m[3])
  const a = m[4] === undefined ? 1 : Number(m[4])
  if (a === 0) return null
  let best = null, bestD = Infinity
  for (const p of PALETTE_NOEL) {
    const d = (r - p.r) ** 2 + (g - p.g) ** 2 + (b - p.b) ** 2
    if (d < bestD) { bestD = d; best = p.role }
  }
  return bestD <= TOLERANCE_NOEL ? best : null
}

// Poste « réel » : on ignore les cases purement numériques (« 10 », « 5 »… = bruit, pas un poste).
function nettoyerPoste(poste) {
  const t = (poste ?? '').trim()
  return /^\d+$/.test(t) ? '' : t
}

export function noelVide() {
  return { v: VERSION_NOEL, colle: '', jours: [] }
}

export function normaliserNoel(src) {
  if (!src || typeof src !== 'object') return noelVide()
  const jours = Array.isArray(src.jours)
    ? src.jours
        .filter(j => j && typeof j.iso === 'string')
        .map(j => {
          const parAssocie = {}
          for (const ini of ASSOCIES) {
            const c = j.parAssocie?.[ini]
            if (!c) continue
            const poste = typeof c.poste === 'string' ? c.poste : ''
            const role = (c.role === 'G' || c.role === 'A' || c.role === 'C' || c.role === 'F') ? c.role : null
            if (poste.trim() || role) parAssocie[ini] = { poste, role }
          }
          return { iso: j.iso, parAssocie }
        })
    : []
  return { v: VERSION_NOEL, colle: typeof src.colle === 'string' ? src.colle : '', jours }
}

// Mois français (accents retirés) → numéro de mois.
const MOIS_FR = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
}

// Construit un ISO à partir de jour/mois (+ année éventuelle), avec déduction d'année si absente
// (nov/déc → annee ; jan/fév → annee+1 ; sinon annee, car Noël chevauche l'année civile).
function isoDepuis(jour, mois, anExplicite, annee) {
  if (jour < 1 || jour > 31 || mois < 1 || mois > 12) return null
  let an = anExplicite
  if (an == null) an = mois >= 11 ? annee : (mois <= 2 ? annee + 1 : annee)
  else if (an < 100) an += 2000
  const d = new Date(Date.UTC(an, mois - 1, jour))
  if (d.getUTCMonth() !== mois - 1) return null // date invalide (ex. 31/02)
  return formatISO(d)
}

// Parse une date de cellule, tolérante à deux formats :
//   - numérique : « 25/12 », « 25/12/2026 », « lun. 25/12 », « 25.12.26 » ;
//   - texte FR  : « jeudi 17 décembre 2026 », « 1 janvier 2027 » (jour + mois en lettres + année).
function parseDateCellule(txt, annee) {
  if (typeof txt !== 'string') return null
  const num = txt.match(/(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/)
  if (num) return isoDepuis(Number(num[1]), Number(num[2]), num[3] != null ? Number(num[3]) : null, annee)
  // Format texte : on retire les accents puis on cherche « <jour> <mois> [<année>] ».
  const norm = txt.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const t = norm.match(/(\d{1,2})\s+([a-z]+)\.?\s*(\d{4})?/)
  if (t && MOIS_FR[t[2]]) return isoDepuis(Number(t[1]), MOIS_FR[t[2]], t[3] != null ? Number(t[3]) : null, annee)
  return null
}

// Découpe le collage en matrice [ligne][colonne] de texte (tabs / retours ligne), sans rogner.
function matriceTexte(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return []
  const lignes = texte.replace(/\r/g, '').split('\n')
  while (lignes.length && lignes[lignes.length - 1].trim() === '') lignes.pop()
  return lignes.map(l => l.split('\t').map(c => c.trim()))
}

// Parse la grille de Noël (texte + HTML du presse-papiers) → { jours, colle }.
//   - LIGNE D'EN-TÊTE = la ligne contenant le plus d'initiales d'ASSOCIES (où qu'elle soit) → mapping
//     colonne→associé (repli positionnel sinon) ;
//   - COLONNE DATES = la colonne (hors colonnes associés) qui parse le plus de dates ;
//   - JOURS = toutes les lignes (sauf l'en-tête) dont la cellule date parse — y compris au-dessus de
//     l'en-tête (Excel place parfois une date avant la ligne d'initiales) ;
//   - couleur de fond (HTML) → role 'G'/'A'/null via classifierCouleur.
export function parserCollageNoel(texte, html, annee) {
  const mat = matriceTexte(texte)
  if (!mat.length) return { jours: [], colle: texte ?? '' }
  const couleurs = extraireCouleursHTML(html, classifierCouleurNoel) // [ligne][col] de 'G'|'A'|'C'|null
  const nbCol = mat.reduce((m, l) => Math.max(m, l.length), 0)
  const estIni = (v) => ASSOCIES.some(a => a.toUpperCase() === (v ?? '').trim().toUpperCase())

  // Ligne d'en-tête = celle qui contient le plus d'initiales (≥ 2).
  let headerRow = -1, meilleur = 1
  for (let r = 0; r < mat.length; r++) {
    const n = mat[r].filter(estIni).length
    if (n >= 2 && n > meilleur) { meilleur = n; headerRow = r }
  }
  const colAssoc = {}
  if (headerRow >= 0) {
    mat[headerRow].forEach((v, c) => {
      const ini = ASSOCIES.find(a => a.toUpperCase() === (v ?? '').trim().toUpperCase())
      if (ini && !Object.values(colAssoc).includes(ini)) colAssoc[c] = ini
    })
  }

  // Colonne dates = colonne (hors associés) avec le plus de cellules qui parsent en date.
  let colDate = -1, meilleurDates = 0
  for (let c = 0; c < nbCol; c++) {
    if (colAssoc[c]) continue
    let n = 0
    for (let r = 0; r < mat.length; r++) { if (r !== headerRow && parseDateCellule(mat[r]?.[c], annee)) n++ }
    if (n > meilleurDates) { meilleurDates = n; colDate = c }
  }
  if (colDate === -1) colDate = 0

  // Repli positionnel : aucun en-tête reconnu → colonnes après la colonne dates = ASSOCIES dans l'ordre.
  if (Object.keys(colAssoc).length === 0) {
    let k = 0
    for (let c = 0; c < nbCol && k < ASSOCIES.length; c++) {
      if (c === colDate) continue
      colAssoc[c] = ASSOCIES[k++]
    }
  }

  const jours = []
  for (let r = 0; r < mat.length; r++) {
    if (r === headerRow) continue
    const iso = parseDateCellule(mat[r]?.[colDate], annee)
    if (!iso) continue
    const dow = parseISO(iso).getUTCDay() // 0=dim … 6=sam
    const estWeekend = dow === 0 || dow === 6
    const parAssocie = {}
    for (const c of Object.keys(colAssoc)) {
      const ci = Number(c)
      const ini = colAssoc[c]
      const brut = (mat[r]?.[ci] ?? '').trim()
      let role = couleurs?.[r]?.[ci] ?? null // 'G' | 'A' | 'C' | 'F' | null
      // Week-end : les cases « A5 »/« G5 » sont souvent collées SANS fond → on déduit le rôle du préfixe.
      if (!role && estWeekend && /^[AG]\d*$/i.test(brut)) role = brut[0].toUpperCase()
      // Récup (case verte = férié) : on CONSERVE le contenu numérique (le n° de récup) pour l'afficher ;
      // ailleurs, une case purement numérique est du bruit et reste ignorée.
      const poste = role === 'F' ? brut : nettoyerPoste(brut)
      if (poste || role) parAssocie[ini] = { poste, role }
    }
    jours.push({ iso, parAssocie })
  }
  return { jours, colle: texte ?? '' }
}

// Détecte si un poste désigne la réa (« Réa », « rea »…).
function estReaPoste(poste) {
  return /r[ée]a/i.test(poste ?? '')
}

// Rôle du groupe ce jour-là pour la colonne « G/A » (aperçu + export) : 'G' s'il existe une garde,
// sinon 'A' s'il existe une astreinte, sinon ''.
export function groupeJourNoel(jour) {
  let aG = false, aA = false
  for (const ini of ASSOCIES) {
    const r = jour?.parAssocie?.[ini]?.role
    if (r === 'G') aG = true
    else if (r === 'A') aA = true
  }
  return aG ? 'G' : aA ? 'A' : ''
}

// Week-ends de garde imposés par la grille de Noël (notamment ceux qui ENCADRENT les 15 jours) :
//   → { <numSemaineISO>: ini } = le détenteur du week-end, repéré par TEXTE (entrée non vide le samedi
//   ou le dimanche, ex. « A5 »/« G5 »), car ces cases ne sont pas forcément colorées.
export function weekendsGardeNoel(noelData) {
  const data = normaliserNoel(noelData)
  const m = {}
  for (const j of data.jours) {
    const d = parseISO(j.iso)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) continue // samedi ou dimanche
    const num = numeroSemaineISO(d)
    for (const ini of ASSOCIES) {
      const cell = j.parAssocie?.[ini]
      if (cell && (cell.poste ?? '').trim()) { m[num] = ini; break }
    }
  }
  return m
}

// Semaines ISO « imposées » par la grille de Noël (les ~15 jours fournis tels quels) : la grille fait
// foi sur ces semaines (réa, vacances, gardes de semaine et week-ends y sont déjà fixés). Les étapes de
// construction (réa, vacances, en semaine) NE doivent donc pas les remplir automatiquement, et leurs
// comptes sont déjà inclus dans les Compteurs de référence. Même découpage que bilanNoel / l'export.
export function semainesImposeesNoel(noelData) {
  const data = normaliserNoel(noelData)
  const out = new Set()
  for (const j of data.jours) out.add(numeroSemaineISO(parseISO(j.iso)))
  return out
}

// Bilan des comptes de Noël par associé + ensemble des semaines ISO couvertes (pour exclure le double
// comptage côté bilan annuel). Les fériés des DEUX années sont pris en compte (Noël chevauche l'an).
//   → { parAssocie:{ <ini>:{ gWeekend, aVendredi, gVendredi, gardeSemaine, rea, recupJF, vacances } }, semaines }
export function bilanNoel(noelData, annee) {
  const data = normaliserNoel(noelData)
  const par = {}
  for (const ini of ASSOCIES) par[ini] = { gWeekend: 0, aVendredi: 0, gVendredi: 0, gardeSemaine: 0, rea: 0, recupJF: 0, vacances: 0 }
  const semaines = new Set()
  const reaSemaines = {}
  const feries = new Set([...joursFeriesFR(annee), ...joursFeriesFR(annee + 1)].map(f => f.iso))
  // Suivi des jours ouvrés (lun→ven) par semaine ISO, pour détecter les semaines entièrement off (vacances).
  const ouvres = {} // { num: { presents:Set(dow1-5), off:{ ini:Set(dow) } } }

  for (const j of data.jours) {
    const d = parseISO(j.iso)
    const dow = d.getUTCDay()            // 0=dim, 1=lun … 5=ven, 6=sam
    const num = numeroSemaineISO(d)
    semaines.add(num)
    const estFerie = feries.has(j.iso)
    const estOuvre = dow >= 1 && dow <= 5
    if (estOuvre) (ouvres[num] ??= { presents: new Set(), off: {} }).presents.add(dow)
    for (const ini of ASSOCIES) {
      const cell = j.parAssocie?.[ini]
      const poste = (cell?.poste ?? '').trim()
      const role = cell?.role ?? null
      // Récup JF : case verte (rôle 'F') = jour férié travaillé hors service → récupération.
      if (role === 'F') par[ini].recupJF++
      // Jours ouvrés : gardes/astreintes + suivi "off" pour les vacances.
      if (estOuvre) {
        if (role === 'G') { if (dow === 5) par[ini].gVendredi++; else par[ini].gardeSemaine++ }
        else if (role === 'A') { if (dow === 5) par[ini].aVendredi++ }
        // Off ce jour-là = ni garde/astreinte/récup, et pas de vrai poste (congé bleu 'C' ou case vide).
        const off = role !== 'G' && role !== 'A' && role !== 'F' && (role === 'C' || poste === '')
        if (off) ((ouvres[num].off[ini] ??= new Set())).add(dow)
        // Repli récup JF : férié travaillé non coloré, sans être de service ni en congé (réa comprise).
        if (estFerie && poste && role == null) par[ini].recupJF++
        // Semaine de réa : au moins une case « réa » dans la semaine.
        if (estReaPoste(poste)) (reaSemaines[ini] ??= new Set()).add(num)
      }
    }
  }
  for (const ini of ASSOCIES) par[ini].rea = reaSemaines[ini]?.size ?? 0

  // Week-ends : un week-end (samedi/dimanche) tenu = +1 G week-end pour son détenteur.
  for (const ini of Object.values(weekendsGardeNoel(noelData))) if (par[ini]) par[ini].gWeekend++

  // Vacances : semaines ISO dont les 5 jours ouvrés sont présents et où l'associé est off les 5.
  for (const info of Object.values(ouvres)) {
    if (info.presents.size < 5) continue // semaine partielle → on ne conclut pas
    for (const ini of ASSOCIES) {
      if ((info.off[ini]?.size ?? 0) >= 5) par[ini].vacances++
    }
  }
  return { parAssocie: par, semaines }
}

// Compteurs cumulés AFFICHÉS dans les cases de Noël, en PROLONGEMENT du cumul annuel (week-end, réa,
// vacances uniquement — cf. décision : les gardes de semaine de Noël ne sont pas numérotées car leur
// continuité exigerait le planning assemblé complet).
//   base = { weekend:{ini:n}, rea:{ini:n}, vac:{ini:n} } = totaux PRÉ-Noël (hors semaines de Noël).
//   → { '<iso>|<ini>': '<texte à afficher>' } : week-end « G6 »/« A6 », réa « Réa3 », vacances « 2 ».
export function compteursNoel(noelData, annee, base = {}) {
  const data = normaliserNoel(noelData)
  const joursTries = data.jours.slice().sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0))
  const out = {}
  const cWE = {}, cRea = {}, cVac = {}
  for (const ini of ASSOCIES) {
    cWE[ini] = base?.weekend?.[ini] ?? 0
    cRea[ini] = base?.rea?.[ini] ?? 0
    cVac[ini] = base?.vac?.[ini] ?? 0
  }

  // ── Week-ends : +1 par week-end tenu (détenteur via weekendsGardeNoel), n° affiché sur sam ET dim. ──
  const weHolder = weekendsGardeNoel(noelData) // { num: ini }
  const weNumParSemaine = {}
  const numsWE = [...new Set(joursTries
    .map(j => numeroSemaineISO(parseISO(j.iso)))
    .filter(n => weHolder[n] != null))].sort((a, b) => a - b)
  for (const num of numsWE) { const ini = weHolder[num]; cWE[ini] = (cWE[ini] ?? 0) + 1; weNumParSemaine[num] = cWE[ini] }
  for (const j of joursTries) {
    const d = parseISO(j.iso); const dow = d.getUTCDay(); const num = numeroSemaineISO(d)
    if ((dow === 0 || dow === 6) && weHolder[num]) {
      const ini = weHolder[num]
      const role = j.parAssocie?.[ini]?.role
      const prefixe = role === 'A' ? 'A' : role === 'G' ? 'G' : (dow === 6 ? 'A' : 'G') // sam=A, dim=G par défaut
      out[`${j.iso}|${ini}`] = `${prefixe}${weNumParSemaine[num]}`
    }
  }

  // ── Réa : 1ʳᵉ case « réa » de chaque semaine ISO (par associé) → +1, « RéaN » sur cette case. ──
  const reaVue = {}
  for (const j of joursTries) {
    const num = numeroSemaineISO(parseISO(j.iso))
    for (const ini of ASSOCIES) {
      if (!estReaPoste((j.parAssocie?.[ini]?.poste ?? '').trim())) continue
      const vu = (reaVue[ini] ??= new Set())
      if (!vu.has(num)) { vu.add(num); cRea[ini] = (cRea[ini] ?? 0) + 1 }
      out[`${j.iso}|${ini}`] = `Réa${cRea[ini]}`
    }
  }

  // ── Vacances : semaine off 5/5 (détection identique à bilanNoel) → +1, n° sur le 1ᵉʳ jour ouvré off. ──
  const ouvres = {} // num → { presents:Set, off:{ini:Set}, premier:{ini:iso} }
  for (const j of joursTries) {
    const d = parseISO(j.iso); const dow = d.getUTCDay(); const num = numeroSemaineISO(d)
    if (dow < 1 || dow > 5) continue
    const info = (ouvres[num] ??= { presents: new Set(), off: {}, premier: {} })
    info.presents.add(dow)
    for (const ini of ASSOCIES) {
      const cell = j.parAssocie?.[ini]; const poste = (cell?.poste ?? '').trim(); const role = cell?.role ?? null
      const off = role !== 'G' && role !== 'A' && role !== 'F' && (role === 'C' || poste === '')
      if (off) { ((info.off[ini] ??= new Set())).add(dow); if (info.premier[ini] == null) info.premier[ini] = j.iso }
    }
  }
  for (const num of Object.keys(ouvres).map(Number).sort((a, b) => a - b)) {
    const info = ouvres[num]
    if (info.presents.size < 5) continue
    for (const ini of ASSOCIES) {
      if ((info.off[ini]?.size ?? 0) >= 5) { cVac[ini] = (cVac[ini] ?? 0) + 1; out[`${info.premier[ini]}|${ini}`] = String(cVac[ini]) }
    }
  }

  return out
}
