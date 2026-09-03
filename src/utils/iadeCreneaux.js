// ============================================================
// iadeCreneaux.js — logique pure des créneaux en moins (onglet « Créneaux »).
//
// Un créneau en moins = une salle qui ne tourne pas, un jour donné, sur la
// journée entière ou une seule demi-journée. C'est le seul endroit du module
// IADE qui descend à la demi-journée : ici, c'est le fait métier lui-même — une
// salle ferme souvent le matin seulement, et l'agent libéré travaille l'après-midi.
//
// Deux blocs, deux façons de compter :
//   • Bloc A : la salle est nommée (NC, Viscérale, CPRE…). On dit laquelle ferme,
//     et — facultatif — qui manque. Elle s'affiche par son nom.
//   • Bloc B : les opérateurs y font des demi-journées, et UN opérateur = UNE
//     salle. On dit qui est absent, et ce qui s'affiche est un compte : « −2 salles
//     le matin ». C'est ça qui sert à la gestion — pas la liste des noms, mais
//     combien de salles en moins, le matin et l'après-midi.
//
// La saisie se fait par lot, parce que c'est comme ça que l'information arrive :
// un opérateur annonce ses absences d'un bloc (« je ne suis pas là les 12, 15 et
// du 20 au 22 »). On sélectionne ses jours au calendrier, on le nomme une seule
// fois, et le lot part en une fois.
// ============================================================
import { formatJour, jourSuivant, seSuivent } from './iadeConges'

export const MOMENTS = [
  { id: 'journee',     label: 'Journée entière', court: 'Journée' },
  { id: 'matin',       label: 'Matin',           court: 'Matin' },
  { id: 'apres_midi',  label: 'Après-midi',      court: 'Après-midi' },
]

export const SECTEURS = [
  { id: 'A', label: 'Bloc A', aide: 'Une salle nommée qui ne tourne pas : NC, Viscérale, CPRE…' },
  { id: 'B', label: 'Bloc B', aide: 'Un opérateur absent = une salle en moins.' },
]

// Au bloc B la salle n'est pas nommée : c'est l'opérateur qui compte.
export const SALLE_BLOC_B = 'Bloc B'

// Ordre d'affichage dans une journée : la journée entière d'abord, puis le matin,
// puis l'après-midi. C'est l'ordre dans lequel on lit un planning.
const RANG_MOMENT = { journee: 0, matin: 1, apres_midi: 2 }

export function libelleMoment(id) {
  return MOMENTS.find(m => m.id === id)?.label ?? id
}

export function momentCourt(id) {
  return MOMENTS.find(m => m.id === id)?.court ?? id
}

export function libelleSecteur(id) {
  return SECTEURS.find(s => s.id === id)?.label ?? id
}

// Ce qui identifie une ligne dans son bloc : la salle au bloc A, l'opérateur au bloc B.
export function cleCreneau(c) {
  return ((c?.secteur === 'B' ? c?.absent : c?.salle) ?? '').trim()
}

// Ce qu'on lit pour une ligne.
// Bloc A : la salle et le nom de la personne absente, « CPRE · Dr Martin ». Le
// moment n'est précisé QUE pour une demi-journée (« — matin ») : rien de précisé,
// c'est la journée entière. Bloc B : « Dr Martin — matin » (mais le planning
// n'affiche pas les lignes du B une à une, il en fait le compte).
export function resume(creneau) {
  if (!creneau) return ''
  const demi = creneau.moment === 'journee' ? '' : ` — ${momentCourt(creneau.moment).toLowerCase()}`
  if (creneau.secteur === 'B') return `${creneau.absent ?? SALLE_BLOC_B}${demi}`
  const qui = creneau.absent ? ` · ${creneau.absent}` : ''
  return `${creneau.salle}${qui}${demi}`
}

// jour ISO → créneaux du jour, triés (journée, matin, après-midi, puis nom).
export function indexerParJour(creneaux) {
  const index = new Map()
  for (const c of creneaux ?? []) {
    if (!index.has(c.jour)) index.set(c.jour, [])
    index.get(c.jour).push(c)
  }
  for (const liste of index.values()) {
    liste.sort((a, b) =>
      (RANG_MOMENT[a.moment] ?? 9) - (RANG_MOMENT[b.moment] ?? 9) ||
      cleCreneau(a).localeCompare(cleCreneau(b), 'fr'))
  }
  return index
}

// ── Bloc B : le compte des salles en moins ───────────────────────────────────

// Pour un jour : combien de salles manquent le matin, combien l'après-midi.
// Un opérateur absent la journée compte pour une salle le matin ET une l'après-midi.
//
// Puis la synthèse : une salle en moins le matin ET une en moins l'après-midi,
// c'est une salle en moins la journée — peu importe que ce soient deux personnes
// différentes. C'est le nombre de salles qui compte, pas qui les tenait.
export function bilanBlocB(creneauxDuJour = []) {
  const lignes = (creneauxDuJour ?? []).filter(c => c.secteur === 'B')
  let matin = 0
  let apresMidi = 0
  for (const c of lignes) {
    if (c.moment !== 'apres_midi') matin++
    if (c.moment !== 'matin') apresMidi++
  }
  const journee = Math.min(matin, apresMidi)
  return {
    matin, apresMidi, lignes,
    journee,                          // salles en moins toute la journée
    seulMatin: matin - journee,       // en plus, le matin seulement
    seulApresMidi: apresMidi - journee,
  }
}

const salles = (n) => `${n} salle${n > 1 ? 's' : ''}`

// « −1 salle la journée », puis « −1 salle le matin » ou « −2 salles l'après-midi »
// pour ce qui dépasse. Une ligne par segment : c'est ce que la gestion lit.
export function segmentsBilanB(bilan) {
  if (!bilan || bilan.lignes.length === 0) return []
  const out = []
  if (bilan.journee) out.push(`−${salles(bilan.journee)} la journée`)
  if (bilan.seulMatin) out.push(`−${salles(bilan.seulMatin)} le matin`)
  if (bilan.seulApresMidi) out.push(`−${salles(bilan.seulApresMidi)} l'après-midi`)
  return out
}

export function texteBilanB(bilan) {
  return segmentsBilanB(bilan).join(' / ')
}

// ── Aides à la saisie ────────────────────────────────────────────────────────

// Les salles du bloc A déjà saisies, pour les proposer à la frappe : personne ne
// devrait avoir à retaper « Viscérale » vingt fois, ni inventer une orthographe.
export function sallesConnues(creneaux) {
  const vues = new Map()
  for (const c of creneaux ?? []) {
    if (c.secteur === 'B') continue
    const cle = (c.salle ?? '').trim().toLowerCase()
    if (cle && !vues.has(cle)) vues.set(cle, c.salle.trim())
  }
  return [...vues.values()].sort((a, b) => a.localeCompare(b, 'fr'))
}

// Les opérateurs déjà nommés, tous blocs confondus.
export function operateursConnus(creneaux) {
  const vus = new Map()
  for (const c of creneaux ?? []) {
    const cle = (c.absent ?? '').trim().toLowerCase()
    if (cle && !vus.has(cle)) vus.set(cle, c.absent.trim())
  }
  return [...vus.values()].sort((a, b) => a.localeCompare(b, 'fr'))
}

// Combien de demi-journées de salle sautent sur une période — une journée entière
// en vaut deux. C'est l'unité dans laquelle la gestion raisonne : « il me manque
// 3 demi-journées de salle ».
export function compterDemiJournees(creneaux) {
  return (creneaux ?? []).reduce((n, c) => n + (c.moment === 'journee' ? 2 : 1), 0)
}

// ── Contrôle de saisie ───────────────────────────────────────────────────────

// Contrôle avant enregistrement. → message d'erreur, ou null si tout est bon.
// `existants` = les créneaux déjà posés, pour ne pas doubler la même salle (ou le
// même opérateur au bloc B) et pour refuser un matin quand la journée entière est
// déjà fermée (et l'inverse).
export function verifierCreneau({ jour, moment, secteur, salle, absent, id = null }, existants = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour ?? '')) return 'Choisissez le jour concerné.'
  if (!MOMENTS.some(m => m.id === moment)) return 'Choisissez la journée, le matin ou l\'après-midi.'
  if (!SECTEURS.some(s => s.id === secteur)) return 'Choisissez le bloc A ou le bloc B.'

  const blocB = secteur === 'B'
  const propre = ((blocB ? absent : salle) ?? '').trim()
  if (propre.length < 2) return blocB ? 'Indiquez l\'opérateur absent.' : 'Indiquez la salle qui ne tourne pas.'
  if (propre.length > (blocB ? 80 : 60)) {
    return blocB ? 'Ce nom est trop long (80 caractères au maximum).'
                 : 'Ce nom de salle est trop long (60 caractères au maximum).'
  }

  const memes = existants.filter(c =>
    c.id !== id && c.jour === jour && (c.secteur ?? 'A') === secteur &&
    cleCreneau(c).toLowerCase() === propre.toLowerCase())
  const quoi = `« ${propre} »`
  const moments = libelleMoment(moment).toLowerCase()

  if (memes.some(c => c.moment === moment)) {
    return blocB ? `${quoi} est déjà noté absent ce ${moments}-là.`
                 : `${quoi} est déjà notée fermée ce ${moments}-là.`
  }
  if (moment === 'journee' && memes.length > 0) {
    return `${quoi} a déjà une demi-journée notée ce jour-là : retirez-la avant de poser la journée entière.`
  }
  if (moment !== 'journee' && memes.some(c => c.moment === 'journee')) {
    return `${quoi} est déjà noté${blocB ? '' : 'e'} toute la journée : la demi-journée est comprise dedans.`
  }
  return null
}

// ── Sélection de plusieurs jours ─────────────────────────────────────────────

// Un opérateur peut annoncer une longue absence, mais pas un trimestre : au-delà,
// c'est une erreur de manipulation (Maj + clic à l'autre bout de l'année).
export const MAX_JOURS_LOT = 62

// Clic sur un jour du calendrier de saisie. → la nouvelle sélection, triée.
// Maj + clic étend depuis le dernier jour cliqué : « du 20 au 22 » se pose en
// deux gestes au lieu de trois clics.
export function basculerJour(selection = [], iso, { plage = false, ancre = null } = {}) {
  const dans = new Set(selection)
  if (plage && ancre) {
    for (const j of joursDe(ancre, iso)) dans.add(j)
  } else if (dans.has(iso)) {
    dans.delete(iso)
  } else {
    dans.add(iso)
  }
  return [...dans].sort()
}

// Tous les jours entre deux bornes comprises, quel que soit le sens du glissement.
function joursDe(isoA, isoB) {
  const [debut, fin] = isoA <= isoB ? [isoA, isoB] : [isoB, isoA]
  const out = []
  let courant = debut
  while (courant <= fin && out.length < MAX_JOURS_LOT) {
    out.push(courant)
    courant = jourSuivant(courant)
  }
  return out
}

// Des jours épars → les suites de jours consécutifs qu'ils forment.
export function groupesConsecutifs(jours = []) {
  const out = []
  for (const jour of [...new Set(jours)].sort()) {
    const courant = out[out.length - 1]
    if (courant && seSuivent(courant.fin, jour)) { courant.fin = jour; courant.nb++; continue }
    out.push({ debut: jour, fin: jour, nb: 1 })
  }
  return out
}

// « 12/10/2026, du 20/10/2026 au 22/10/2026 » — ce qu'on relit avant d'enregistrer.
export function resumeJours(jours = []) {
  return groupesConsecutifs(jours)
    .map(g => g.debut === g.fin ? formatJour(g.debut) : `du ${formatJour(g.debut)} au ${formatJour(g.fin)}`)
    .join(', ')
}

// Contrôle d'un lot avant enregistrement.
// → { message, aPoser, refus } : `message` bloque tout (rien à enregistrer),
// `refus` liste les jours écartés un par un quand les autres peuvent partir.
// Un jour déjà noté ne fait pas échouer le lot : l'opérateur qui renvoie sa liste
// avec deux jours en plus ne doit pas avoir à faire le tri lui-même.
export function verifierLot({ jours, moment, secteur, salle, absent, id = null }, existants = []) {
  const liste = [...new Set(jours ?? [])].sort()
  const rien = { aPoser: [], refus: [] }

  if (liste.length === 0) return { ...rien, message: 'Choisissez au moins un jour dans le calendrier.' }
  if (liste.length > MAX_JOURS_LOT) {
    return { ...rien, message: `Pas plus de ${MAX_JOURS_LOT} jours à la fois.` }
  }
  // Bloc, moment et nom sont communs au lot : leurs défauts se disent une fois.
  const commun = verifierCreneau({ jour: liste[0], moment, secteur, salle, absent }, [])
  if (commun) return { ...rien, message: commun }

  const aPoser = []
  const refus = []
  for (const jour of liste) {
    const probleme = verifierCreneau({ jour, moment, secteur, salle, absent, id }, existants)
    if (probleme) refus.push({ jour, message: probleme })
    else aPoser.push(jour)
  }
  if (aPoser.length === 0) {
    return { aPoser, refus, message: refus.length === 1 ? refus[0].message : 'Ces jours sont déjà notés.' }
  }
  return { aPoser, refus, message: null }
}
