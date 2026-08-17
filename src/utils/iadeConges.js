// ============================================================
// iadeConges.js — logique métier des congés IADE (fonctions pures, sans réseau).
// Les dates circulent en ISO 'YYYY-MM-DD' ; les calculs sont en UTC (cf. calendrier.js).
// Accès Supabase : iadeCongesApi.js · Schéma + RLS : supabase/iade_conges.sql
// ============================================================
import { parseISO, formatISO, joursFeriesFR } from './calendrier'

const JOUR_MS = 24 * 60 * 60 * 1000

// ⚠️ Doit rester aligné sur la contrainte check(type_conge) de supabase/iade_conges.sql.
export const TYPES_CONGE = [
  { id: 'conges',        label: 'Congés payés' },
  { id: 'rtt',           label: 'RTT / récupération' },
  { id: 'sans_solde',    label: 'Congé sans solde' },
  { id: 'formation',     label: 'Formation' },
  { id: 'enfant_malade', label: 'Enfant malade' },
  { id: 'autre',         label: 'Autre' },
]

// ⚠️ Doit rester aligné sur la contrainte check(statut) de supabase/iade_conges.sql.
export const STATUTS = {
  en_attente: { label: 'En attente', couleur: 'var(--color-amber)',   fond: 'var(--color-amber-light)' },
  validee:    { label: 'Validée',    couleur: 'var(--color-success)', fond: 'var(--color-success-light)' },
  refusee:    { label: 'Refusée',    couleur: 'var(--color-danger)',  fond: 'var(--color-danger-light)' },
}

export function libelleType(id) {
  return TYPES_CONGE.find(t => t.id === id)?.label ?? 'Congé'
}

export function libelleStatut(id) {
  return STATUTS[id]?.label ?? id
}

// ── Comptages ────────────────────────────────────────────────────────────────

// Nombre de jours calendaires d'une période, bornes incluses.
export function nbJours(debutIso, finIso) {
  const d = parseISO(debutIso).getTime()
  const f = parseISO(finIso).getTime()
  if (Number.isNaN(d) || Number.isNaN(f) || f < d) return 0
  return Math.round((f - d) / JOUR_MS) + 1
}

// Nombre de jours ouvrés (lundi→vendredi, hors jours fériés français) de la période.
export function nbJoursOuvres(debutIso, finIso) {
  const total = nbJours(debutIso, finIso)
  if (total === 0) return 0

  const debut = parseISO(debutIso)
  const fin   = parseISO(finIso)

  // Fériés des années couvertes par la période (une période peut être à cheval sur deux ans).
  const feries = new Set()
  for (let a = debut.getUTCFullYear(); a <= fin.getUTCFullYear(); a++) {
    for (const f of joursFeriesFR(a)) feries.add(f.iso)
  }

  let n = 0
  for (let i = 0; i < total; i++) {
    const jour = new Date(debut.getTime() + i * JOUR_MS)
    const dow = jour.getUTCDay() // 0 = dimanche, 6 = samedi
    if (dow === 0 || dow === 6) continue
    if (feries.has(formatISO(jour))) continue
    n++
  }
  return n
}

// ── Chevauchements ───────────────────────────────────────────────────────────

// Deux périodes { date_debut, date_fin } se recouvrent-elles (bornes incluses) ?
export function chevauchent(a, b) {
  return a.date_debut <= b.date_fin && b.date_debut <= a.date_fin
}

// Demandes de la liste qui recouvrent la période, en ignorant `saufId` (édition)
// et les demandes refusées (elles ne bloquent rien).
export function chevauchements(periode, demandes, saufId = null) {
  return demandes.filter(d =>
    d.id !== saufId &&
    d.statut !== 'refusee' &&
    chevauchent(periode, d)
  )
}

// ── Validation d'une saisie ──────────────────────────────────────────────────

// Contrôle une demande avant envoi. → message d'erreur, ou null si tout est bon.
// `mesDemandes` sert à détecter un doublon avec une demande déjà déposée.
export function verifierDemande({ dateDebut, dateFin, type }, mesDemandes = [], saufId = null) {
  if (!dateDebut || !dateFin) return 'Indiquez une date de début et une date de fin.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDebut) || !/^\d{4}-\d{2}-\d{2}$/.test(dateFin)) {
    return 'Dates invalides.'
  }
  if (dateFin < dateDebut) return 'La date de fin doit être après la date de début.'
  if (type && !TYPES_CONGE.some(t => t.id === type)) return 'Type de congé inconnu.'
  if (nbJours(dateDebut, dateFin) > 366) return 'Une demande ne peut pas dépasser un an.'

  const conflits = chevauchements({ date_debut: dateDebut, date_fin: dateFin }, mesDemandes, saufId)
  if (conflits.length > 0) {
    return `Vous avez déjà une demande sur cette période (${formatPeriode(conflits[0].date_debut, conflits[0].date_fin)}).`
  }
  return null
}

// ── Affichage ────────────────────────────────────────────────────────────────

const pad2 = (n) => String(n).padStart(2, '0')

function formatJJMMAAAA(iso) {
  const d = parseISO(iso)
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
}

// « 12/07/2026 » pour un jour unique, « du 12/07/2026 au 26/07/2026 » sinon.
export function formatPeriode(debutIso, finIso) {
  if (debutIso === finIso) return formatJJMMAAAA(debutIso)
  return `du ${formatJJMMAAAA(debutIso)} au ${formatJJMMAAAA(finIso)}`
}

// ── Calendrier mensuel ───────────────────────────────────────────────────────

// Bornes ISO du mois (mois : 0 = janvier).
export function bornesMois(annee, mois) {
  const debut = new Date(Date.UTC(annee, mois, 1))
  const fin   = new Date(Date.UTC(annee, mois + 1, 0))
  return { debut: formatISO(debut), fin: formatISO(fin) }
}

// Jours du mois → [{ iso, numero, dow, weekend, ferie }]
export function joursDuMois(annee, mois) {
  const feries = new Set(joursFeriesFR(annee).map(f => f.iso))
  const nb = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate()
  const jours = []
  for (let j = 1; j <= nb; j++) {
    const d = new Date(Date.UTC(annee, mois, j))
    const iso = formatISO(d)
    const dow = d.getUTCDay()
    jours.push({ iso, numero: j, dow, weekend: dow === 0 || dow === 6, ferie: feries.has(iso) })
  }
  return jours
}

// Regroupe des absences par agent → [{ userId, nom, absences }] trié par nom.
export function grouperParAgent(absences) {
  const parAgent = new Map()
  for (const a of absences) {
    const cle = a.user_id
    if (!parAgent.has(cle)) parAgent.set(cle, { userId: cle, nom: a.nom ?? '—', absences: [] })
    parAgent.get(cle).absences.push(a)
  }
  return [...parAgent.values()].sort((x, y) => x.nom.localeCompare(y.nom, 'fr'))
}

// Absence couvrant ce jour pour cet agent (la validée l'emporte sur l'en attente).
export function absenceDuJour(absences, iso) {
  const couvrantes = absences.filter(a => a.date_debut <= iso && iso <= a.date_fin)
  return couvrantes.find(a => a.statut === 'validee') ?? couvrantes[0] ?? null
}
