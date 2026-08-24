// ============================================================
// iadeHeuresSup.js — logique métier des heures supplémentaires IADE
// (fonctions pures, sans réseau).
//
// MODÈLE : une ligne = UN JOUR, UN nombre d'heures ENTIER, pour UN agent.
// Deux chemins d'entrée, distingués par `origine` :
//   • 'iade'    → l'agent déclare et DÉSIGNE le MAR qui les lui a demandées ;
//                 ce MAR valide (la gestion IADE peut trancher en secours).
//   • 'gestion' → la gestion ajoute les heures ; elles naissent validées et
//                 l'agent est seulement informé.
//
// Ce fichier n'importe RIEN de iadeConges.js : c'est l'inverse qui a lieu
// (la synthèse comptable y appelle sectionHeuresSup). Garder ce sens unique
// évite un cycle d'imports entre les deux modules.
//
// Les dates circulent en ISO 'YYYY-MM-DD' ; les calculs sont en UTC (cf. calendrier.js).
// Accès Supabase : iadeHeuresSupApi.js · Schéma + RLS : supabase/iade_heures_sup.sql
// ============================================================
import { parseISO, formatISO, MOIS_FR } from './calendrier'

// ⚠️ Doit rester aligné sur check (heures >= 1 and heures <= 24) — supabase/iade_heures_sup.sql.
export const MIN_HEURES = 1
export const MAX_HEURES = 24

// ⚠️ Doit rester aligné sur la contrainte check(origine) de supabase/iade_heures_sup.sql.
export const ORIGINES = {
  iade: {
    label: 'Déclarée par l’agent',
    court: 'Agent',
  },
  gestion: {
    label: 'Ajoutée par la gestion',
    court: 'Gestion',
  },
}

export function libelleOrigine(id) {
  return ORIGINES[id]?.label ?? id
}

// « 4 h » — le nombre est toujours entier (choix métier, cf. le SQL).
export function formatHeures(n) {
  return `${n} h`
}

// ── Validation d'une déclaration ─────────────────────────────────────────────

// Contrôle une saisie avant envoi. → message d'erreur, ou null si tout est bon.
// `dejaDeclares` = Map iso → ligne, les jours déjà déclarés par l'agent (hors
// refusés) : la base refuse le doublon, autant le dire avant d'envoyer.
export function verifierDeclaration({ jour, heures, marId }, dejaDeclares = new Map()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour ?? '')) return 'Choisissez le jour concerné.'

  const n = Number(heures)
  if (!Number.isInteger(n)) return 'Le nombre d’heures doit être un nombre entier.'
  if (n < MIN_HEURES || n > MAX_HEURES) {
    return `Le nombre d’heures doit être compris entre ${MIN_HEURES} et ${MAX_HEURES}.`
  }

  if (!marId) return 'Indiquez le MAR qui vous a demandé ces heures.'

  if (dejaDeclares.has(jour)) {
    return 'Vous avez déjà une déclaration sur ce jour. Modifiez-la ou retirez-la.'
  }
  return null
}

// Contrôle l'ajout par la gestion : pas de MAR à désigner (c'est elle qui acte),
// mais il faut un agent.
export function verifierAjoutGestion({ jour, heures, userId }, dejaDeclares = new Map()) {
  if (!userId) return 'Choisissez l’agent concerné.'
  const probleme = verifierDeclaration({ jour, heures, marId: 'gestion' }, dejaDeclares)
  return probleme
}

// ── Fenêtre de correction d'une décision ─────────────────────────────────────

// ⚠️ Doit rester aligné sur public.iade_hs_fin_fenetre() — supabase/iade_heures_sup.sql.
// Un MAR qui s'est trompé revient sur sa décision jusqu'à la fin du mois QUI SUIT
// le jour concerné (des heures du 14/09 → jusqu'au 31/10). Ce n'est pas « la fin du
// mois du jour » : des heures faites le 30/09 et déclarées le 1er octobre auraient
// alors eu une fenêtre déjà fermée.
export function finFenetre(iso) {
  const d = parseISO(iso)
  // jour 0 du mois m+2 = dernier jour du mois m+1.
  return formatISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0)))
}

export function fenetreOuverte(iso, aujourdhui = formatISO(new Date())) {
  return aujourdhui <= finFenetre(iso)
}

// La gestion IADE, elle, n'est jamais bloquée (c'est elle qui rattrape les erreurs
// découvertes tard) : d'où le paramètre.
export function peutRevenirDessus(ligne, { estGestion = false, aujourdhui } = {}) {
  if (ligne.statut === 'en_attente') return true   // décider n'est pas « revenir dessus »
  return estGestion || fenetreOuverte(ligne.jour, aujourdhui)
}

// ── Lectures d'un ensemble de lignes ─────────────────────────────────────────

// Index des jours déjà déclarés (hors refusés) → Map iso → ligne.
// Un jour refusé peut être redéclaré : il n'entre donc pas dans l'index.
export function indexJoursDeclares(lignes) {
  const index = new Map()
  for (const l of lignes) {
    if (l.statut === 'refusee') continue
    const existant = index.get(l.jour)
    if (!existant || l.statut === 'validee') index.set(l.jour, l)
  }
  return index
}

export function totalHeures(lignes) {
  return lignes.reduce((n, l) => n + (Number(l.heures) || 0), 0)
}

// « 3 jours · 12 h »
export function resumeHeures(lignes) {
  if (lignes.length === 0) return 'aucune heure'
  const j = lignes.length
  return `${j} jour${j > 1 ? 's' : ''} · ${formatHeures(totalHeures(lignes))}`
}

// Regroupe des lignes par agent → [{ userId, nom, lignes, heures }] trié par nom.
export function grouperParAgent(lignes, nomDe = () => '—') {
  const parAgent = new Map()
  for (const l of lignes) {
    if (!parAgent.has(l.user_id)) {
      parAgent.set(l.user_id, { userId: l.user_id, nom: l.nom ?? nomDe(l.user_id), lignes: [] })
    }
    parAgent.get(l.user_id).lignes.push(l)
  }
  return [...parAgent.values()]
    .map(a => ({ ...a, heures: totalHeures(a.lignes) }))
    .sort((x, y) => x.nom.localeCompare(y.nom, 'fr'))
}

// ── Cumul mois par mois (écran de l'agent) ───────────────────────────────────

// → [{ mois, libelle, heuresValidees, heuresEnAttente, nbValidees, nbEnAttente, nbRefusees }]
// Les 12 mois sont toujours renvoyés : un mois vide se lit, un mois manquant se
// confond avec un mois oublié.
export function recapMensuel(lignes = [], annee) {
  const mois = Array.from({ length: 12 }, (_, m) => ({
    mois: m,
    libelle: MOIS_FR[m].charAt(0).toUpperCase() + MOIS_FR[m].slice(1),
    heuresValidees: 0, heuresEnAttente: 0,
    nbValidees: 0, nbEnAttente: 0, nbRefusees: 0,
  }))

  for (const l of lignes) {
    const d = parseISO(l.jour)
    if (d.getUTCFullYear() !== annee) continue
    const m = mois[d.getUTCMonth()]
    const n = Number(l.heures) || 0
    if (l.statut === 'validee')         { m.nbValidees++;  m.heuresValidees  += n }
    else if (l.statut === 'en_attente') { m.nbEnAttente++; m.heuresEnAttente += n }
    else                                { m.nbRefusees++ }
  }
  return mois
}

// ── Section de la synthèse comptable ─────────────────────────────────────────

// Lignes de texte des heures sup VALIDÉES du mois, à insérer dans la synthèse
// mensuelle des congés (un seul texte à envoyer à la comptable).
//
// `formatJour` est fourni par l'appelant (formatJourCourt de iadeConges.js) :
// c'est ce qui évite à ce module d'importer iadeConges.js et de créer un cycle.
//
// → { lignes, valides, enAttente, heures, nbAgents }
export function sectionHeuresSup({
  heuresSup = [], nomDe = () => 'Agent inconnu', debut, fin, formatJour = (iso) => iso,
}) {
  const duMois    = heuresSup.filter(h => h.jour >= debut && h.jour <= fin)
  const valides   = duMois.filter(h => h.statut === 'validee')
  const enAttente = duMois.filter(h => h.statut === 'en_attente').length

  const parAgent = grouperParAgent(valides, nomDe)

  const lignes = []
  if (parAgent.length === 0) {
    lignes.push('Aucune heure supplémentaire validée sur ce mois.')
  } else {
    for (const a of parAgent) {
      const detail = [...a.lignes]
        .sort((x, y) => x.jour.localeCompare(y.jour))
        .map(l => `${formatJour(l.jour)} (${formatHeures(l.heures)})`)
        .join(', ')
      lignes.push(`${a.nom} — ${formatHeures(a.heures)} : ${detail}`)
    }
    lignes.push('')
    lignes.push(`Total du mois : ${formatHeures(totalHeures(valides))} pour ${parAgent.length} agent${parAgent.length > 1 ? 's' : ''}.`)
  }

  return {
    lignes,
    valides: valides.length,
    enAttente,
    heures: totalHeures(valides),
    nbAgents: parAgent.length,
  }
}
