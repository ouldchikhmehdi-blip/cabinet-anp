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

// Parse une date de cellule tolérante : « 25/12 », « 25/12/2026 », « lun. 25/12 », « 25.12.26 ».
// Année déduite si absente : nov/déc → annee ; jan/fév → annee+1 ; sinon annee (Noël chevauche l'an).
function parseDateCellule(txt, annee) {
  if (typeof txt !== 'string') return null
  const m = txt.match(/(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/)
  if (!m) return null
  const jour = Number(m[1]); const mois = Number(m[2])
  if (jour < 1 || jour > 31 || mois < 1 || mois > 12) return null
  let an
  if (m[3] != null) { an = Number(m[3]); if (an < 100) an += 2000 }
  else an = mois >= 11 ? annee : (mois <= 2 ? annee + 1 : annee)
  const d = new Date(Date.UTC(an, mois - 1, jour))
  if (d.getUTCMonth() !== mois - 1) return null // date invalide (ex. 31/02)
  return formatISO(d)
}

// Découpe le collage en matrice [ligne][colonne] de texte (tabs / retours ligne), sans rogner.
function matriceTexte(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return []
  const lignes = texte.replace(/\r/g, '').split('\n')
  while (lignes.length && lignes[lignes.length - 1].trim() === '') lignes.pop()
  return lignes.map(l => l.split('\t').map(c => c.trim()))
}

// Parse la grille de Noël (texte + HTML du presse-papiers) → { jours, colle }.
//   - 1ʳᵉ ligne = en-tête : on mappe les colonnes aux ASSOCIES par leurs initiales (repli positionnel) ;
//   - colonne « dates » = 1ʳᵉ colonne dont les lignes de données parsent comme des dates (repli col 0) ;
//   - couleur de fond (HTML) → role 'G'/'A'/null via classifierCouleur.
export function parserCollageNoel(texte, html, annee) {
  const mat = matriceTexte(texte)
  if (mat.length < 2) return { jours: [], colle: texte ?? '' }
  const couleurs = extraireCouleursHTML(html) // [ligne][col] de 'G'|'A'|null (en-tête inclus)
  const nbCol = mat.reduce((m, l) => Math.max(m, l.length), 0)

  // Mapping colonne → associé via l'en-tête (initiales), repli positionnel ensuite.
  const entete = mat[0]
  const colAssoc = {}
  for (let c = 0; c < nbCol; c++) {
    const v = (entete[c] ?? '').trim().toUpperCase()
    const ini = ASSOCIES.find(a => a.toUpperCase() === v)
    if (ini && !Object.values(colAssoc).includes(ini)) colAssoc[c] = ini
  }
  // Colonne dates : 1ʳᵉ colonne (hors colonnes associés) qui parse comme date sur les lignes de données.
  let colDate = -1
  for (let c = 0; c < nbCol && colDate === -1; c++) {
    if (colAssoc[c]) continue
    for (let r = 1; r < mat.length; r++) {
      if (parseDateCellule(mat[r]?.[c], annee)) { colDate = c; break }
    }
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
  for (let r = 1; r < mat.length; r++) {
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
