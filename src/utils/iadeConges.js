// ============================================================
// iadeConges.js — logique métier des congés IADE (fonctions pures, sans réseau).
//
// MODÈLE : une ligne = UN JOUR posé, avec sa nature (congé payé / récupération
// d'un jour férié). L'agent coche ses jours dans un calendrier ; les jours
// envoyés ensemble partagent un `lot`, ce qui permet à la gestion de répondre
// d'un coup sans perdre la décision jour par jour.
//
// On ne demande AUCUN motif à l'agent : la raison d'un congé ne regarde pas
// l'employeur. Seule la réponse de la gestion peut être commentée.
//
// Les dates circulent en ISO 'YYYY-MM-DD' ; les calculs sont en UTC (cf. calendrier.js).
// Accès Supabase : iadeCongesApi.js · Schéma + RLS : supabase/iade_conges.sql
// ============================================================
import { parseISO, formatISO, joursFeriesFR, moisAnneeFR } from './calendrier'
import { sectionHeuresSup } from './iadeHeuresSup'

const JOUR_MS = 24 * 60 * 60 * 1000

// ⚠️ Doit rester aligné sur la contrainte check(type_conge) de supabase/iade_conges.sql.
export const TYPES_CONGE = [
  {
    id: 'cp',
    court: 'CP',
    label: 'Congé payé',
    pluriel: 'congés payés',
    // Couleur de la pastille dans les calendriers (la couleur du STATUT prime
    // dans le calendrier d'équipe ; ici c'est celle de la sélection en cours).
    couleur: 'var(--color-primary)',
    fond: 'var(--color-primary-light)',
  },
  {
    id: 'recup_ferie',
    court: 'RF',
    label: 'Récup. jour férié',
    pluriel: 'récup. de jours fériés',
    couleur: 'var(--color-amber)',
    fond: 'var(--color-amber-light)',
  },
]

export const TYPE_DEFAUT = 'cp'

// ⚠️ Doit rester aligné sur la contrainte check(statut) de supabase/iade_conges.sql.
export const STATUTS = {
  en_attente: { label: 'En attente', couleur: 'var(--color-amber)',   fond: 'var(--color-amber-light)' },
  validee:    { label: 'Validé',     couleur: 'var(--color-success)', fond: 'var(--color-success-light)' },
  refusee:    { label: 'Refusé',     couleur: 'var(--color-danger)',  fond: 'var(--color-danger-light)' },
}

export function typeConge(id) {
  return TYPES_CONGE.find(t => t.id === id) ?? null
}

export function libelleType(id) {
  return typeConge(id)?.label ?? 'Congé'
}

// Abréviation affichée dans les cases de calendrier (« CP », « RF »).
export function courtType(id) {
  return typeConge(id)?.court ?? '•'
}

export function libelleStatut(id) {
  return STATUTS[id]?.label ?? id
}

// ── Dates ────────────────────────────────────────────────────────────────────

export function jourSuivant(iso) {
  return formatISO(new Date(parseISO(iso).getTime() + JOUR_MS))
}

// Deux jours ISO se suivent-ils ?
export function seSuivent(isoA, isoB) {
  return jourSuivant(isoA) === isoB
}

// ── Comptages ────────────────────────────────────────────────────────────────

// Nombre de jours par type → { cp: 3, recup_ferie: 2 }
export function compterParType(jours) {
  const total = {}
  for (const t of TYPES_CONGE) total[t.id] = 0
  for (const j of jours) {
    const id = j.type_conge ?? j.type
    if (id in total) total[id]++
  }
  return total
}

// « 3 congés payés · 1 récup. jour férié » — les types absents sont omis.
export function resumeTypes(jours) {
  const total = compterParType(jours)
  return TYPES_CONGE
    .filter(t => total[t.id] > 0)
    .map(t => `${total[t.id]} ${total[t.id] > 1 ? t.pluriel : t.label.toLowerCase()}`)
    .join(' · ')
}

// ── Regroupement en plages contiguës ─────────────────────────────────────────

// Regroupe des jours en plages de dates consécutives partageant les mêmes clés.
// Sert à afficher « du 12 au 16/10 — congé payé » plutôt que cinq lignes.
// → [{ debut, fin, nb, ids, jours, type_conge, statut, user_id, lot, motif_reponse }]
export function plages(jours, cles = ['type_conge', 'statut']) {
  const signature = (j) => cles.map(c => String(j[c] ?? '')).join('|')

  const tries = [...jours].sort((a, b) =>
    signature(a).localeCompare(signature(b)) || a.jour.localeCompare(b.jour)
  )

  const out = []
  for (const j of tries) {
    const courante = out[out.length - 1]
    if (courante && courante.signature === signature(j) && seSuivent(courante.fin, j.jour)) {
      courante.fin = j.jour
      courante.nb++
      courante.ids.push(j.id)
      courante.jours.push(j)
      continue
    }
    out.push({
      signature:     signature(j),
      debut:         j.jour,
      fin:           j.jour,
      nb:            1,
      ids:           [j.id],
      jours:         [j],
      type_conge:    j.type_conge,
      statut:        j.statut,
      user_id:       j.user_id,
      lot:           j.lot,
      motif_reponse: j.motif_reponse ?? null,
    })
  }
  return out.sort((a, b) => a.debut.localeCompare(b.debut))
}

// ── Validation d'une saisie ──────────────────────────────────────────────────

const MAX_JOURS_PAR_ENVOI = 62

// Contrôle la sélection avant envoi. → message d'erreur, ou null si tout est bon.
// `dejaPoses` = les jours déjà déposés par l'agent (Map iso → ligne), pour éviter
// qu'il repose un jour en attente ou déjà validé.
export function verifierSelection(selection, dejaPoses = new Map()) {
  const liste = [...selection]
  if (liste.length === 0) return 'Choisissez au moins un jour dans le calendrier.'
  if (liste.length > MAX_JOURS_PAR_ENVOI) {
    return `Vous ne pouvez pas envoyer plus de ${MAX_JOURS_PAR_ENVOI} jours à la fois.`
  }

  for (const { jour, type } of liste) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return 'Date invalide dans la sélection.'
    if (!typeConge(type)) return 'Nature de jour inconnue.'
    const deja = dejaPoses.get(jour)
    if (deja) {
      return `Le ${formatJour(jour)} fait déjà partie d'une demande (${libelleStatut(deja.statut).toLowerCase()}).`
    }
  }
  return null
}

// ── Affichage ────────────────────────────────────────────────────────────────

const pad2 = (n) => String(n).padStart(2, '0')

// En-têtes de la grille mensuelle (semaine commençant le lundi).
export const INITIALES_JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

// « 12/07/2026 »
export function formatJour(iso) {
  const d = parseISO(iso)
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
}

// « lun. 12/07 » — pour les listes de dates de la synthèse comptable.
const NOMS_JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

export function formatJourCourt(iso) {
  const d = parseISO(iso)
  return `${NOMS_JOURS_COURTS[d.getUTCDay()]} ${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`
}

// « 12/07/2026 » pour un jour unique, « du 12/07/2026 au 26/07/2026 » sinon.
export function formatPeriode(debutIso, finIso) {
  if (debutIso === finIso) return formatJour(debutIso)
  return `du ${formatJour(debutIso)} au ${formatJour(finIso)}`
}

// ── Calendrier mensuel ───────────────────────────────────────────────────────

// Bornes ISO du mois (mois : 0 = janvier).
export function bornesMois(annee, mois) {
  const debut = new Date(Date.UTC(annee, mois, 1))
  const fin   = new Date(Date.UTC(annee, mois + 1, 0))
  return { debut: formatISO(debut), fin: formatISO(fin) }
}

// Jours du mois → [{ iso, numero, dow, weekend, ferie, nomFerie }]
export function joursDuMois(annee, mois) {
  const feries = new Map(joursFeriesFR(annee).map(f => [f.iso, f.nom]))
  const nb = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate()
  const jours = []
  for (let j = 1; j <= nb; j++) {
    const d = new Date(Date.UTC(annee, mois, j))
    const iso = formatISO(d)
    const dow = d.getUTCDay()
    jours.push({
      iso,
      numero:   j,
      dow,
      weekend:  dow === 0 || dow === 6,
      ferie:    feries.has(iso),
      nomFerie: feries.get(iso) ?? null,
    })
  }
  return jours
}

// Grille du mois en semaines de 7 cases (lundi → dimanche), complétée par des
// `null` avant le 1er et après le dernier jour.
export function grilleMois(annee, mois) {
  const jours = joursDuMois(annee, mois)
  const decalage = (jours[0].dow + 6) % 7 // lundi = 0
  const cases = [...Array(decalage).fill(null), ...jours]
  while (cases.length % 7 !== 0) cases.push(null)

  const semaines = []
  for (let i = 0; i < cases.length; i += 7) semaines.push(cases.slice(i, i + 7))
  return semaines
}

// ── Lectures d'un ensemble de jours ──────────────────────────────────────────

// Regroupe des jours par agent → [{ userId, nom, jours }] trié par nom.
export function grouperParAgent(jours) {
  const parAgent = new Map()
  for (const j of jours) {
    const cle = j.user_id
    if (!parAgent.has(cle)) parAgent.set(cle, { userId: cle, nom: j.nom ?? '—', jours: [] })
    parAgent.get(cle).jours.push(j)
  }
  return [...parAgent.values()].sort((x, y) => x.nom.localeCompare(y.nom, 'fr'))
}

// Jour posé correspondant à cette date (la ligne validée l'emporte sur l'en attente).
export function absenceDuJour(jours, iso) {
  const surLeJour = jours.filter(j => j.jour === iso)
  return surLeJour.find(j => j.statut === 'validee') ?? surLeJour[0] ?? null
}

// Index des jours déjà posés (hors refusés) → Map iso → ligne.
// Un jour refusé peut être reposé : il n'entre donc pas dans l'index.
export function indexJoursPoses(jours) {
  const index = new Map()
  for (const j of jours) {
    if (j.statut === 'refusee') continue
    const existant = index.get(j.jour)
    if (!existant || j.statut === 'validee') index.set(j.jour, j)
  }
  return index
}

// ── Synthèse mensuelle pour la comptabilité ──────────────────────────────────

// Texte prêt à copier-coller dans un e-mail à la comptable : pour le mois demandé,
// les jours **validés** de chaque agent détaillés par nature, PUIS les heures
// supplémentaires **validées**. Un seul texte à envoyer : la paie a besoin des deux.
//
// Ne sortent QUE les lignes validées : un jour ou des heures en attente ne sont
// pas accordés, les envoyer en paie serait une erreur. Les compteurs « en attente »
// sont renvoyés à part pour que l'écran alerte la personne qui exporte.
//
// → { texte, valides, enAttente, nbAgents, parType, heuresSup }
export function syntheseMensuelle({
  jours = [], heuresSup = [], agents = [], annee, mois, genereLe = null,
}) {
  const { debut, fin } = bornesMois(annee, mois)
  const duMois    = jours.filter(j => j.jour >= debut && j.jour <= fin)
  const valides   = duMois.filter(j => j.statut === 'validee')
  const enAttente = duMois.filter(j => j.statut === 'en_attente').length

  const nomDe = (id) => agents.find(a => a.id === id)?.nom ?? 'Agent inconnu'

  const parAgent = new Map()
  for (const j of valides) {
    if (!parAgent.has(j.user_id)) parAgent.set(j.user_id, [])
    parAgent.get(j.user_id).push(j)
  }
  const lignesAgents = [...parAgent.entries()]
    .map(([id, siens]) => ({ nom: nomDe(id), jours: siens }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))

  const lignes = [
    'SARM — Service Anesthésie Réanimation Millénaire',
    `Congés et heures supplémentaires IADE — ${moisAnneeFR(new Date(Date.UTC(annee, mois, 1)))}`,
    '',
    'CONGÉS VALIDÉS',
    '',
  ]

  if (lignesAgents.length === 0) {
    lignes.push('Aucun congé validé sur ce mois.')
  } else {
    for (const a of lignesAgents) {
      lignes.push(`${a.nom} — ${a.jours.length} jour${a.jours.length > 1 ? 's' : ''}`)
      for (const t of TYPES_CONGE) {
        const dessus = a.jours
          .filter(j => j.type_conge === t.id)
          .sort((x, y) => x.jour.localeCompare(y.jour))
        if (dessus.length === 0) continue
        const intitule = dessus.length > 1
          ? t.pluriel.charAt(0).toUpperCase() + t.pluriel.slice(1)
          : t.label
        lignes.push(`  ${intitule} (${dessus.length}) : ${dessus.map(j => formatJourCourt(j.jour)).join(', ')}`)
      }
      lignes.push('')
    }
    lignes.push(`Total du mois : ${valides.length} jour${valides.length > 1 ? 's' : ''} — ${resumeTypes(valides)}`)
  }

  const hs = sectionHeuresSup({
    heuresSup, nomDe, debut, fin, formatJour: formatJourCourt,
  })
  lignes.push('', 'HEURES SUPPLÉMENTAIRES VALIDÉES', '', ...hs.lignes)

  if (genereLe) {
    lignes.push('', `Édité le ${formatJour(genereLe)} depuis le dashboard SARM.`)
  }

  return {
    texte:    lignes.join('\n'),
    valides:  valides.length,
    enAttente,
    nbAgents: lignesAgents.length,
    parType:  compterParType(valides),
    heuresSup: hs,
  }
}
