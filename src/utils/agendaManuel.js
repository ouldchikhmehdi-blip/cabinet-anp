// ============================================================
// agendaManuel.js — transforme le collage Excel de l'associé (sa colonne, ou tout le planning) en
// événements d'agenda « journée entière ». Alternative à la synchro AUTO (planning validé, dérivé en
// interne par evenementsAgenda.js). Réutilise les briques de la vue faiseur (planningParService.js).
//
// Orientation INVERSE de parserCollageParService (qui transpose poste → qui) : ici on lit UNE colonne,
// celle de l'associé connecté (repérée par ses initiales), et on produit son poste JOUR PAR JOUR.
//
// Sortie : { events:[{ d:'YYYY-MM-DD', fin:'YYYY-MM-DD'(exclusif), titre }],
//            diag:{ colonne, nbJours, nonDatees:[label], nonReconnues:[{label,texte}], avert:[string] } }
// ============================================================
import { normaliserCle } from './importConsultations'
import { enMatrice, normaliserPosteCanonique } from './planningParService'
import { parseDateFR, formatISO, parseISO } from './calendrier'

const JOUR_MS = 24 * 60 * 60 * 1000

function isoPlusUn(iso) {
  return formatISO(new Date(parseISO(iso).getTime() + JOUR_MS))
}

function nettoie(s) {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Classe une cellule vers un LIBELLÉ d'agenda, ou null (repos / vide / non reconnu).
// Étend normaliserPosteCanonique (les 6 postes de service) avec les rôles garde / astreinte / congé,
// testés AVANT (ce sont les « journées contraintes »). « VPA » seul reste sans événement (via le repli).
export function classerCelluleAgenda(libelle) {
  const t = nettoie(libelle).replace(/\bvpa\b/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (/\bgarde\b/.test(t) || /^g\d*$/.test(t) || /^g\s*\d/.test(t)) return 'Garde'
  if (/\bastreinte\b/.test(t) || /\bastr/.test(t) || /^a\d*$/.test(t) || /^a\s*\d/.test(t)) return 'Astreinte'
  if (/\bconge/.test(t) || /\bvacances?\b/.test(t) || /^c\d*$/.test(t) || /\bcp\b/.test(t) || /\brtt\b/.test(t) || /\brecup/.test(t)) return 'Congé'
  return normaliserPosteCanonique(libelle) // → un des 6 postes de service, ou null
}

// Parse le collage de l'associé → { events, diag }. `ini` = initiales de l'associé connecté.
// Le collage doit inclure la colonne des DATES en 1ʳᵉ colonne. On accepte :
//   - tout le planning (en-têtes = initiales) → on repère la colonne dont l'en-tête = `ini` ;
//   - juste [dates + ma colonne] (2 colonnes) → on prend la colonne 1 même si l'en-tête n'est pas l'initiale.
export function parserAgendaManuel(texte, { ini, anneeIndice = 2026 } = {}) {
  const vide = { events: [], diag: { colonne: null, nbJours: 0, nonDatees: [], nonReconnues: [], avert: [] } }
  if (!ini) return { ...vide, diag: { ...vide.diag, avert: ['Aucune initiale associée à votre compte.'] } }

  const matrice = enMatrice(texte)
  if (matrice.length < 2) return { ...vide, diag: { ...vide.diag, avert: ['Collage vide ou incomplet (au moins un en-tête + un jour attendus).'] } }

  const entetes = matrice[0]
  const corps = matrice.slice(1)
  const nbColonnes = matrice.reduce((m, l) => Math.max(m, l.length), 0)
  const cleIni = normaliserCle(ini)

  // 1) Repérer la colonne de l'associé (par en-tête = initiales). Sinon repli 2 colonnes.
  let colIdx = -1
  let colonneLabel = null
  for (let c = 1; c < nbColonnes; c++) {
    if (normaliserCle(entetes[c] ?? '') === cleIni) { colIdx = c; colonneLabel = (entetes[c] ?? ini).trim(); break }
  }
  if (colIdx < 0 && nbColonnes === 2) {
    colIdx = 1
    colonneLabel = (entetes[1] ?? '').trim() || `${ini} (colonne unique collée)`
  }
  if (colIdx < 0) {
    return { ...vide, diag: { ...vide.diag, avert: [`Votre colonne (« ${ini} ») est introuvable dans le collage. Collez le planning avec l'en-tête des initiales, ou seulement les 2 colonnes [dates + votre colonne].`] } }
  }

  // 2) Ligne par ligne : date (col 0) + poste (ma colonne).
  const parJour = {} // iso → titre
  const nonDatees = []
  const nonReconnues = []
  for (const ligne of corps) {
    const dateLabel = (ligne[0] ?? '').trim()
    const cellule = ligne[colIdx] ?? ''
    const iso = parseDateFR(dateLabel, { anneeIndice })
    if (!iso) {
      if (dateLabel || cellule.trim()) nonDatees.push(dateLabel || '(ligne sans date)')
      continue
    }
    const titre = classerCelluleAgenda(cellule)
    if (!titre) {
      if (cellule.trim()) nonReconnues.push({ label: dateLabel, texte: cellule.trim() })
      continue
    }
    parJour[iso] = titre // dernière valeur gagne si une date apparaît deux fois
  }

  // 3) Fusionner les jours consécutifs de même titre en événements multi-jours (fin = DTEND exclusif).
  const isos = Object.keys(parJour).sort()
  const brut = []
  for (const iso of isos) {
    const titre = parJour[iso]
    const dernier = brut[brut.length - 1]
    if (dernier && dernier.titre === titre && isoPlusUn(dernier._fin) === iso) dernier._fin = iso
    else brut.push({ titre, d: iso, _fin: iso })
  }
  const events = brut.map(e => ({ d: e.d, fin: isoPlusUn(e._fin), titre: e.titre }))

  return {
    events,
    diag: { colonne: colonneLabel, nbJours: isos.length, nonDatees, nonReconnues, avert: [] },
  }
}
