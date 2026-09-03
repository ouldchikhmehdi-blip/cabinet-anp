// ============================================================
// iadeCreneaux.js — logique pure des créneaux en moins (onglet « Créneaux »).
//
// Un créneau en moins = une salle qui ne tourne pas, un jour donné, sur la
// journée entière ou une seule demi-journée. C'est le seul endroit du module
// IADE qui descend à la demi-journée : ici, c'est le fait métier lui-même — une
// salle ferme souvent le matin seulement, et l'agent libéré travaille l'après-midi.
//
// La saisie se fait par lot, parce que c'est comme ça que l'information arrive :
// un opérateur annonce ses absences d'un bloc (« je ne suis pas là les 12, 15 et
// du 20 au 22 »). On sélectionne ses jours au calendrier, on nomme la salle et
// l'opérateur une seule fois, et le lot part en une fois.
// ============================================================
import { formatJour, jourSuivant, seSuivent } from './iadeConges'

export const MOMENTS = [
  { id: 'journee',     label: 'Journée entière', court: 'Journée' },
  { id: 'matin',       label: 'Matin',           court: 'Matin' },
  { id: 'apres_midi',  label: 'Après-midi',      court: 'Après-midi' },
]

// Ordre d'affichage dans une journée : la journée entière d'abord, puis le matin,
// puis l'après-midi. C'est l'ordre dans lequel on lit un planning.
const RANG_MOMENT = { journee: 0, matin: 1, apres_midi: 2 }

export function libelleMoment(id) {
  return MOMENTS.find(m => m.id === id)?.label ?? id
}

export function momentCourt(id) {
  return MOMENTS.find(m => m.id === id)?.court ?? id
}

// « Bloc B — matin », « Endoscopie 2 — journée (Dr Martin) »
export function resume(creneau) {
  if (!creneau) return ''
  const base = `${creneau.salle} — ${momentCourt(creneau.moment).toLowerCase()}`
  return creneau.absent ? `${base} (${creneau.absent})` : base
}

// jour ISO → créneaux du jour, triés (journée, matin, après-midi, puis salle).
export function indexerParJour(creneaux) {
  const index = new Map()
  for (const c of creneaux ?? []) {
    if (!index.has(c.jour)) index.set(c.jour, [])
    index.get(c.jour).push(c)
  }
  for (const liste of index.values()) {
    liste.sort((a, b) =>
      (RANG_MOMENT[a.moment] ?? 9) - (RANG_MOMENT[b.moment] ?? 9) ||
      a.salle.localeCompare(b.salle, 'fr'))
  }
  return index
}

// Les salles déjà saisies, pour les proposer à la frappe : personne ne devrait
// avoir à retaper « Endoscopie 2 » vingt fois, ni inventer une orthographe.
export function sallesConnues(creneaux) {
  const vues = new Map()
  for (const c of creneaux ?? []) {
    const cle = c.salle.trim().toLowerCase()
    if (!vues.has(cle)) vues.set(cle, c.salle.trim())
  }
  return [...vues.values()].sort((a, b) => a.localeCompare(b, 'fr'))
}

// Combien de demi-journées sautent sur une période — une journée entière en vaut
// deux. C'est le compte qui parle à la gestion : « il me manque 3 demi-journées ».
export function compterDemiJournees(creneaux) {
  return (creneaux ?? []).reduce((n, c) => n + (c.moment === 'journee' ? 2 : 1), 0)
}

// Contrôle avant enregistrement. → message d'erreur, ou null si tout est bon.
// `existants` = les créneaux déjà posés, pour ne pas doubler la même salle et
// pour refuser un matin quand la journée entière est déjà fermée (et l'inverse).
export function verifierCreneau({ jour, moment, salle, id = null }, existants = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour ?? '')) return 'Choisissez le jour concerné.'
  if (!MOMENTS.some(m => m.id === moment)) return 'Choisissez la journée, le matin ou l\'après-midi.'

  const propre = (salle ?? '').trim()
  if (propre.length < 2) return 'Indiquez la salle qui ne tourne pas.'
  if (propre.length > 60) return 'Ce nom de salle est trop long (60 caractères au maximum).'

  const memeSalle = existants.filter(c =>
    c.id !== id && c.jour === jour && c.salle.trim().toLowerCase() === propre.toLowerCase())

  if (memeSalle.some(c => c.moment === moment)) {
    return `« ${propre} » est déjà notée fermée ce ${libelleMoment(moment).toLowerCase()}-là.`
  }
  if (moment === 'journee' && memeSalle.length > 0) {
    return `« ${propre} » a déjà une demi-journée fermée ce jour-là : retirez-la avant de fermer la journée entière.`
  }
  if (moment !== 'journee' && memeSalle.some(c => c.moment === 'journee')) {
    return `« ${propre} » est déjà fermée toute la journée : la demi-journée est comprise dedans.`
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
export function verifierLot({ jours, moment, salle, id = null }, existants = []) {
  const liste = [...new Set(jours ?? [])].sort()
  const rien = { aPoser: [], refus: [] }

  if (liste.length === 0) return { ...rien, message: 'Choisissez au moins un jour dans le calendrier.' }
  if (liste.length > MAX_JOURS_LOT) {
    return { ...rien, message: `Pas plus de ${MAX_JOURS_LOT} jours à la fois.` }
  }
  // La salle et le moment sont communs au lot : leurs défauts se disent une fois.
  const commun = verifierCreneau({ jour: liste[0], moment, salle }, [])
  if (commun) return { ...rien, message: commun }

  const aPoser = []
  const refus = []
  for (const jour of liste) {
    const probleme = verifierCreneau({ jour, moment, salle, id }, existants)
    if (probleme) refus.push({ jour, message: probleme })
    else aPoser.push(jour)
  }
  if (aPoser.length === 0) {
    return { aPoser, refus, message: refus.length === 1 ? refus[0].message : 'Ces jours sont déjà notés pour cette salle.' }
  }
  return { aPoser, refus, message: null }
}
