// ============================================================
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
import { parseISO, formatISO, numeroSemaineISO, joursFeriesFR } from './calendrier'

export const VERSION_NOEL = 1

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
            const role = c.role === 'G' || c.role === 'A' ? c.role : null
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
  const couleurs = extraireCouleursHTML(html) // [ligne][col] de 'G'|'A'|null (aligné par index de ligne)
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
    const parAssocie = {}
    for (const c of Object.keys(colAssoc)) {
      const ci = Number(c)
      const ini = colAssoc[c]
      const poste = (mat[r]?.[ci] ?? '').trim()
      const role = couleurs?.[r]?.[ci] ?? null // 'G' | 'A' | null
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
//   → { <numSemaineISO>: ini } = le porteur de la garde de week-end (le dimanche de garde).
// Sert à intégrer ces week-ends à l'équilibrage de l'étape Week-ends sans double saisie.
export function weekendsGardeNoel(noelData) {
  const data = normaliserNoel(noelData)
  const m = {}
  for (const j of data.jours) {
    const d = parseISO(j.iso)
    if (d.getUTCDay() !== 0) continue // dimanche uniquement (= garde de week-end)
    const num = numeroSemaineISO(d)
    for (const ini of ASSOCIES) {
      if (j.parAssocie?.[ini]?.role === 'G') { m[num] = ini; break }
    }
  }
  return m
}

// Bilan des comptes de Noël par associé + ensemble des semaines ISO couvertes (pour exclure le double
// comptage côté bilan annuel). Les fériés des DEUX années sont pris en compte (Noël chevauche l'an).
//   → { parAssocie:{ <ini>:{ gWeekend, aVendredi, gVendredi, gardeSemaine, rea, recupJF } }, semaines:Set }
export function bilanNoel(noelData, annee) {
  const data = normaliserNoel(noelData)
  const par = {}
  for (const ini of ASSOCIES) par[ini] = { gWeekend: 0, aVendredi: 0, gVendredi: 0, gardeSemaine: 0, rea: 0, recupJF: 0 }
  const semaines = new Set()
  const reaSemaines = {}
  const feries = new Set([...joursFeriesFR(annee), ...joursFeriesFR(annee + 1)].map(f => f.iso))

  for (const j of data.jours) {
    const d = parseISO(j.iso)
    const dow = d.getUTCDay()            // 0=dim, 1=lun … 5=ven, 6=sam
    const num = numeroSemaineISO(d)
    semaines.add(num)
    const estFerie = feries.has(j.iso)
    for (const ini of ASSOCIES) {
      const cell = j.parAssocie?.[ini]
      if (!cell) continue
      const aPoste = (cell.poste ?? '').trim() !== ''
      if (cell.role === 'G') {
        if (dow === 0 || dow === 6) par[ini].gWeekend++       // dimanche (et samedi, rare)
        else if (dow === 5) par[ini].gVendredi++              // vendredi
        else par[ini].gardeSemaine++                          // lun → jeu
      } else if (cell.role === 'A') {
        if (dow === 5) par[ini].aVendredi++                   // seule l'astreinte du vendredi est suivie
      }
      // Récup JF : férié travaillé SANS être de service (case non colorée — réa comprise).
      if (estFerie && aPoste && cell.role == null) par[ini].recupJF++
      // Semaine de réa : au moins une case « réa » dans la semaine.
      if (estReaPoste(cell.poste)) (reaSemaines[ini] ??= new Set()).add(num)
    }
  }
  for (const ini of ASSOCIES) par[ini].rea = reaSemaines[ini]?.size ?? 0
  return { parAssocie: par, semaines }
}
