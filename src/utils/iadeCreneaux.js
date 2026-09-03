// ============================================================
// iadeCreneaux.js — logique pure des créneaux en moins (onglet « Créneaux »).
//
// Un créneau en moins = une salle qui ne tourne pas, un jour donné, sur la
// journée entière ou une seule demi-journée. C'est le seul endroit du module
// IADE qui descend à la demi-journée : ici, c'est le fait métier lui-même — une
// salle ferme souvent le matin seulement, et l'agent libéré travaille l'après-midi.
// ============================================================

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
