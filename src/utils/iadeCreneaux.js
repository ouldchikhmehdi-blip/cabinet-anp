// ============================================================
// iadeCreneaux.js — logique pure des créneaux en moins (onglet « Créneaux »).
//
// Un créneau en moins = une salle qui ne tourne pas, un jour donné, sur la
// journée entière ou une seule demi-journée. C'est le seul endroit du module
// IADE qui descend à la demi-journée : ici, c'est le fait métier lui-même — une
// salle ferme souvent le matin seulement, et l'agent libéré travaille l'après-midi.
//
// Dans les deux blocs on note la même chose : QUI est absent, quand. Ce qui change,
// c'est ce qu'on en montre :
//   • Bloc A (NC, Viscérale, CPRE…) : le nom de l'opérateur, et « — matin » ou
//     « — après-midi » seulement pour une demi-journée. Rien dit, c'est la journée.
//   • Bloc B : les opérateurs y font des demi-journées, et UN opérateur = UNE
//     salle. Ce qui s'affiche est un compte : « −2 salles le matin ». C'est ça qui
//     sert à la gestion — pas la liste des noms, mais combien de salles en moins.
//
// La saisie se fait par lot, parce que c'est comme ça que l'information arrive :
// un opérateur annonce ses absences d'un bloc (« je ne suis pas là les 12, 15 et
// du 20 au 22 »). On sélectionne ses jours au calendrier, on le nomme une seule
// fois, et le lot part en une fois.
// ============================================================
import { formatJour, jourSuivant, seSuivent } from './iadeConges'
import { sallesPerdues, momentSelonTrame } from './iadeBlocB'

export const MOMENTS = [
  { id: 'journee',     label: 'Journée entière', court: 'Journée' },
  { id: 'matin',       label: 'Matin',           court: 'Matin' },
  { id: 'apres_midi',  label: 'Après-midi',      court: 'Après-midi' },
]

export const SECTEURS = [
  { id: 'A', label: 'Bloc A', aide: 'NC, Viscérale, CPRE… Le planning affiche le nom de l\'opérateur absent.' },
  { id: 'B', label: 'Bloc B', aide: 'Un opérateur absent = une salle en moins. Le planning affiche le compte.' },
]

// La colonne `salle` ne porte plus que le libellé du bloc : c'est l'opérateur qui identifie la ligne.
export const SALLE_PAR_SECTEUR = { A: 'Bloc A', B: 'Bloc B' }

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

// Ce qui identifie une ligne dans son bloc : l'opérateur.
export function cleCreneau(c) {
  return (c?.absent ?? '').trim()
}

// Ce qu'on lit pour une ligne : le nom de l'opérateur, « Dr Martin ». Le moment
// n'est précisé QUE pour une demi-journée (« Dr Martin — matin ») : rien de
// précisé, c'est la journée entière. Au bloc B le planning n'affiche pas les
// lignes une à une, il en fait le compte — mais la liste, elle, les montre ainsi.
export function resume(creneau) {
  if (!creneau) return ''
  const demi = creneau.moment === 'journee' ? '' : ` — ${momentCourt(creneau.moment).toLowerCase()}`
  return `${creneau.absent ?? SALLE_PAR_SECTEUR[creneau.secteur] ?? ''}${demi}`
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
// Un opérateur absent la journée compte le matin ET l'après-midi.
//
// « Un opérateur = une salle » est la règle, mais PAS une loi : Fedkovic tient
// l'Endo 2 et l'Endo 4 le mercredi matin, et son absence fait donc sauter DEUX
// salles. Le poids vient de la trame (`sallesPerdues`), qui vaut 1 partout
// ailleurs et pour tout opérateur qu'elle ne connaît pas. Compter 1 pour tout le
// monde dirait « −1 salle » là où il en manque deux — et c'est le nombre qui sert
// à la gestion pour savoir où elle a du monde en trop.
//
// Puis la synthèse : une salle en moins le matin ET une en moins l'après-midi,
// c'est une salle en moins la journée — peu importe que ce soient deux personnes
// différentes. C'est le nombre de salles qui compte, pas qui les tenait.
export function bilanBlocB(creneauxDuJour = []) {
  const lignes = (creneauxDuJour ?? []).filter(c => c.secteur === 'B')
  let matin = 0
  let apresMidi = 0
  for (const c of lignes) {
    if (c.moment !== 'apres_midi') matin += sallesPerdues(c.absent, c.jour, 'matin')
    if (c.moment !== 'matin') apresMidi += sallesPerdues(c.absent, c.jour, 'apres_midi')
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

// ── Vue d'une semaine ────────────────────────────────────────────────────────
// La gestion raisonne à la semaine : « lundi il me manque deux salles le matin,
// jeudi une l'après-midi ». Cinq jours ouvrés, et pour chacun qui est absent et
// combien de salles en moins au bloc B.

const pad2 = (n) => String(n).padStart(2, '0')

function isoDe(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

// Le lundi de la semaine qui contient ce jour (un dimanche appartient à la
// semaine qui s'achève, pas à celle qui commence).
export function lundiDe(iso) {
  const [a, m, j] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, j))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return isoDe(d)
}

export function decalerJours(iso, n) {
  const [a, m, j] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, j + n))
  return isoDe(d)
}

// Du lundi au vendredi.
export function joursOuvres(lundi) {
  return [0, 1, 2, 3, 4].map(i => decalerJours(lundi, i))
}

// → [{ iso, bilanB, blocA }] pour les cinq jours, plus le total de la semaine
// en demi-journées de salle perdues au bloc B (une journée en vaut deux).
export function bilanSemaine(creneaux, lundi) {
  const index = indexerParJour(creneaux)
  const jours = joursOuvres(lundi).map(iso => {
    const duJour = index.get(iso) ?? []
    return { iso, bilanB: bilanBlocB(duJour), blocA: duJour.filter(c => c.secteur !== 'B') }
  })
  const demiJourneesB = jours.reduce((n, j) => n + j.bilanB.matin + j.bilanB.apresMidi, 0)
  return { jours, demiJourneesB }
}

// ── Aides à la saisie ────────────────────────────────────────────────────────

// Les opérateurs déjà nommés, tous blocs confondus, pour les proposer à la frappe :
// personne ne devrait avoir à retaper un nom vingt fois, ni en inventer l'orthographe.
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
// `existants` = les créneaux déjà posés, pour ne pas noter deux fois le même
// opérateur et pour refuser un matin quand la journée entière est déjà posée
// (et l'inverse).
export function verifierCreneau({ jour, moment, secteur, absent, id = null }, existants = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour ?? '')) return 'Choisissez le jour concerné.'
  if (!MOMENTS.some(m => m.id === moment)) return 'Choisissez la journée, le matin ou l\'après-midi.'
  if (!SECTEURS.some(s => s.id === secteur)) return 'Choisissez le bloc A ou le bloc B.'

  const propre = (absent ?? '').trim()
  if (propre.length < 2) return 'Indiquez l\'opérateur absent.'
  if (propre.length > 80) return 'Ce nom est trop long (80 caractères au maximum).'

  const memes = existants.filter(c =>
    c.id !== id && c.jour === jour && (c.secteur ?? 'A') === secteur &&
    cleCreneau(c).toLowerCase() === propre.toLowerCase())
  const quoi = `« ${propre} »`

  if (memes.some(c => c.moment === moment)) {
    return `${quoi} est déjà noté absent ce ${libelleMoment(moment).toLowerCase()}-là.`
  }
  if (moment === 'journee' && memes.length > 0) {
    return `${quoi} a déjà une demi-journée notée ce jour-là : retirez-la avant de poser la journée entière.`
  }
  if (moment !== 'journee' && memes.some(c => c.moment === 'journee')) {
    return `${quoi} est déjà noté absent toute la journée : la demi-journée est comprise dedans.`
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
// `moments` (facultatif) = Map iso → { moment } : le moment PROPRE à chaque jour,
// déduit des habitudes de l'opérateur. Absent, `moment` s'applique à tous les jours.
// `aPoser` rend des { jour, moment } et non des ISO nus : c'est ce que l'insertion
// écrit, un lot pouvant désormais mêler des matins et des après-midi.
export function verifierLot({ jours, moment, secteur, absent, id = null }, existants = [], moments = null) {
  const liste = [...new Set(jours ?? [])].sort()
  const rien = { aPoser: [], refus: [] }
  const momentDe = (jour) => moments?.get?.(jour)?.moment ?? moment

  if (liste.length === 0) return { ...rien, message: 'Choisissez au moins un jour dans le calendrier.' }
  if (liste.length > MAX_JOURS_LOT) {
    return { ...rien, message: `Pas plus de ${MAX_JOURS_LOT} jours à la fois.` }
  }
  // Bloc et nom sont communs au lot : leurs défauts se disent une fois. Le moment,
  // lui, ne l'est plus — il se contrôle jour par jour, plus bas.
  const commun = verifierCreneau({ jour: liste[0], moment: momentDe(liste[0]), secteur, absent }, [])
  if (commun) return { ...rien, message: commun }

  const aPoser = []
  const refus = []
  for (const jour of liste) {
    const probleme = verifierCreneau({ jour, moment: momentDe(jour), secteur, absent, id }, existants)
    if (probleme) refus.push({ jour, message: probleme })
    else aPoser.push({ jour, moment: momentDe(jour) })
  }
  if (aPoser.length === 0) {
    return { aPoser, refus, message: refus.length === 1 ? refus[0].message : 'Ces jours sont déjà notés.' }
  }
  return { aPoser, refus, message: null }
}

// ── Ce qu'on retient des opérateurs : QUAND ils opèrent ──────────────────────
//
// But : quand la gestion annonce l'absence d'un opérateur un jour donné, le
// moment est déjà rempli. On ne le demande plus, on le déduit.
//
// ⚠️ LE MOMENT N'APPARTIENT PAS À L'OPÉRATEUR, IL APPARTIENT AU COUPLE
// (opérateur, jour de la semaine). L'historique du cabinet le montre sans
// ambiguïté : Espérance opère le lundi et le mardi MATIN, mais le jeudi
// APRÈS-MIDI ; Suma l'après-midi en début de semaine et le vendredi matin.
// Cinq des neuf opérateurs du bloc B changent ainsi de demi-journée selon le
// jour. Retenir « Espérance = matin » se tromperait un jeudi sur deux, et se
// tromperait EN SILENCE — le pire des cas, puisque personne ne relit un champ
// déjà rempli.
//
// D'où la règle : on regarde d'abord le MÊME JOUR DE LA SEMAINE, et on ne
// retombe sur l'habitude générale de l'opérateur que pour un jour de semaine
// jamais vu. En cas d'égalité, on ne propose RIEN : une case vide se remarque,
// une case fausse non.
//
// La source est l'historique des créneaux lui-même — rien à tenir à jour. C'est
// légitime : on ne ferme une salle que si elle devait tourner, donc une absence
// notée le lundi matin dit que l'opérateur opère le lundi matin.

const MOMENTS_IDS = MOMENTS.map(m => m.id)

const normOperateur = (s) => (s ?? '').trim().toLowerCase()

// Jour de la semaine d'un ISO, en UTC (0 = dimanche), sans dérive de fuseau.
function jourSemaine(iso) {
  const [a, m, j] = String(iso).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j)).getUTCDay()
}

/**
 * Index des habitudes, construit une fois par lot de créneaux.
 * → Map opérateur → { total: {moment: n}, parJour: Map jourSemaine → {moment: n} }
 */
export function habitudes(creneaux) {
  const index = new Map()
  for (const c of creneaux ?? []) {
    const cle = normOperateur(c?.absent)
    if (!cle || !MOMENTS_IDS.includes(c.moment) || !c.jour) continue
    if (!index.has(cle)) index.set(cle, { total: {}, parJour: new Map() })
    const entree = index.get(cle)
    entree.total[c.moment] = (entree.total[c.moment] ?? 0) + 1
    const js = jourSemaine(c.jour)
    if (!entree.parJour.has(js)) entree.parJour.set(js, {})
    const comptes = entree.parJour.get(js)
    comptes[c.moment] = (comptes[c.moment] ?? 0) + 1
  }
  return index
}

// Le moment majoritaire d'un décompte, ou null si personne ne se détache.
// Une égalité ne se trancherait qu'au hasard : mieux vaut ne rien proposer.
function majoritaire(comptes) {
  const paires = Object.entries(comptes ?? {}).filter(([, n]) => n > 0)
  if (paires.length === 0) return null
  paires.sort((a, b) => b[1] - a[1])
  if (paires.length > 1 && paires[0][1] === paires[1][1]) return null
  const total = paires.reduce((n, [, v]) => n + v, 0)
  return { moment: paires[0][0], n: paires[0][1], total }
}

/**
 * Le moment habituel d'un opérateur un jour donné.
 * → { moment, source: 'jour' | 'operateur', n, total } ou null si on ne sait pas.
 *   • 'jour'      : déduit des fois où il était absent CE jour de la semaine ;
 *   • 'operateur' : ce jour-là n'a jamais été vu, on retombe sur son habitude
 *                   générale — plus fragile, et l'écran doit le dire.
 */
export function momentHabituel(index, absent, jourIso) {
  const entree = index?.get?.(normOperateur(absent))
  if (!entree || !jourIso) return null

  const duJour = majoritaire(entree.parJour.get(jourSemaine(jourIso)))
  if (duJour) return { ...duJour, source: 'jour' }

  const general = majoritaire(entree.total)
  return general ? { ...general, source: 'operateur' } : null
}

/**
 * Le moment retenu pour CHAQUE jour d'un lot. C'est la pièce maîtresse : une
 * absence annoncée sur lundi ET jeudi ne porte pas le même moment aux deux
 * jours, et un moment unique pour le lot en écraserait un.
 * → Map iso → { moment, source: 'jour'|'operateur'|'choisi', n, total }
 */
// Ordre des sources, du plus sûr au moins sûr :
//   1. la TRAME du bloc B (`iadeBlocB.js`) — le fait, pas une statistique ;
//   2. l'historique des absences, pour qui n'y figure pas (le bloc A, un
//      remplaçant, un opérateur arrivé depuis) ;
//   3. la valeur du champ, faute de mieux.
// `trame: false` pour le bloc A : la trame décrit le BLOC B seul. Un opérateur
// homonyme y ferait pré-remplir un moment qui n'a rien à voir.
export function momentsDuLot(index, absent, jours = [], defaut = 'journee', { trame: avecTrame = true } = {}) {
  const out = new Map()
  for (const iso of jours) {
    const trame = avecTrame ? momentSelonTrame(absent, iso) : null
    const trouve = trame
      ? { moment: trame.moment, source: 'trame', salles: trame.salles, n: 0, total: 0 }
      : momentHabituel(index, absent, iso)
    out.set(iso, trouve ?? { moment: defaut, source: 'choisi', n: 0, total: 0 })
  }
  return out
}

// Vrai si le lot mélange plusieurs moments : l'écran doit alors montrer le
// détail jour par jour plutôt qu'un seul intitulé qui mentirait sur la moitié.
export function lotPanache(moments) {
  const vus = new Set([...(moments?.values?.() ?? [])].map(m => m.moment))
  return vus.size > 1
}

/**
 * Ce qu'on sait d'un opérateur, en clair : « lundi matin, mardi matin, jeudi
 * après-midi ». Affiché à la saisie pour que la gestion voie sur quoi la
 * déduction se fonde, et la corrige si l'habitude a changé.
 * → [{ jourSemaine, label, moment, n, total }] du lundi au dimanche.
 */
const NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const ORDRE_SEMAINE = [1, 2, 3, 4, 5, 6, 0]

export function habitudesOperateur(index, absent) {
  const entree = index?.get?.(normOperateur(absent))
  if (!entree) return []
  const out = []
  for (const js of ORDRE_SEMAINE) {
    const m = majoritaire(entree.parJour.get(js))
    if (m) out.push({ jourSemaine: js, label: NOMS_JOURS[js], ...m })
  }
  return out
}
