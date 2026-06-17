// ============================================================
// calendrier.js — utilitaires de dates pour le module planning
// Tout en UTC (Date.UTC / getUTC*) pour éviter les décalages de fuseau.
// Aucune dépendance externe (pas de date-fns / dayjs).
// ============================================================

const JOUR_MS = 24 * 60 * 60 * 1000
const SEMAINE_MS = 7 * JOUR_MS

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

const pad2 = (n) => String(n).padStart(2, '0')

// ── Numéro de semaine ISO-8601 (la semaine appartient à l'année de son jeudi) ──
export function numeroSemaineISO(date) {
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const jour = (tmp.getUTCDay() + 6) % 7 // lundi = 0 … dimanche = 6
  tmp.setUTCDate(tmp.getUTCDate() - jour + 3) // jeudi de la semaine courante
  const jeudiCourant = tmp.getTime()
  tmp.setUTCMonth(0, 1) // 1er janvier
  if (tmp.getUTCDay() !== 4) {
    tmp.setUTCMonth(0, 1 + ((4 - tmp.getUTCDay()) + 7) % 7) // 1er jeudi de l'année
  }
  return 1 + Math.ceil((jeudiCourant - tmp.getTime()) / SEMAINE_MS)
}

// ── Lundi de la semaine ISO `num` de l'année `annee` ──
export function lundiDeSemaineISO(annee, num) {
  const jan4 = new Date(Date.UTC(annee, 0, 4)) // toujours en semaine ISO 1
  const jour = (jan4.getUTCDay() + 6) % 7
  const lundiS1 = new Date(jan4.getTime() - jour * JOUR_MS)
  return new Date(lundiS1.getTime() + (num - 1) * SEMAINE_MS)
}

// ── Nombre de semaines ISO de l'année (52 ou 53 ; 2026 → 53) ──
export function nbSemainesISO(annee) {
  // Le 28 décembre est toujours dans la dernière semaine ISO de l'année.
  return numeroSemaineISO(new Date(Date.UTC(annee, 11, 28)))
}

// ── Formats ──
export function formatJJMM(date) {
  return `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}`
}

export function formatISO(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

export function parseISO(str) {
  const [a, m, j] = str.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j))
}

export function formatDateLongueFR(date) {
  return `${JOURS_FR[date.getUTCDay()]} ${date.getUTCDate()} ${MOIS_FR[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

// Libellé « Mars 2026 » (mois capitalisé + année) — pour les séparateurs de mois.
export function moisAnneeFR(date) {
  const m = MOIS_FR[date.getUTCMonth()]
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${date.getUTCFullYear()}`
}

// ── Liste des semaines ISO de l'année ──
// → [{ num, lundi, dimanche, label: 'S12 · 16/03 → 22/03' }]
export function listerSemaines(annee) {
  const total = nbSemainesISO(annee)
  const semaines = []
  for (let num = 1; num <= total; num++) {
    const lundi = lundiDeSemaineISO(annee, num)
    const dimanche = new Date(lundi.getTime() + 6 * JOUR_MS)
    semaines.push({
      num,
      lundi,
      dimanche,
      label: `S${num} · ${formatJJMM(lundi)} → ${formatJJMM(dimanche)}`,
    })
  }
  return semaines
}

// ── Liste des week-ends de l'année (samedi + dimanche de chaque semaine ISO) ──
// → [{ num, samedi, dimanche, label: 'WE S12 · 21–22/03' }]
export function listerWeekends(annee) {
  return listerSemaines(annee).map(({ num, lundi }) => {
    const samedi = new Date(lundi.getTime() + 5 * JOUR_MS)
    const dimanche = new Date(lundi.getTime() + 6 * JOUR_MS)
    return {
      num,
      samedi,
      dimanche,
      label: `WE S${num} · ${formatJJMM(samedi)} – ${formatJJMM(dimanche)}`,
    }
  })
}

// ── Années proposées dans les sélecteurs ──
export const ANNEES = Array.from({ length: 11 }, (_, i) => 2025 + i) // 2025 → 2035

// ── Plage de semaines (recueil défini par le faiseur : semaine_debut → semaine_fin) ──
export function semainesDansPlage(annee, debut, fin) {
  return listerSemaines(annee).filter(s => s.num >= debut && s.num <= fin)
}

export function weekendsDansPlage(annee, debut, fin) {
  return listerWeekends(annee).filter(w => w.num >= debut && w.num <= fin)
}

// Bornes de dates ISO d'une plage (pour borner un <input type="date">).
export function bornesPlage(annee, debut, fin) {
  const lundi = lundiDeSemaineISO(annee, debut)
  const dimanche = new Date(lundiDeSemaineISO(annee, fin).getTime() + 6 * JOUR_MS)
  return { min: formatISO(lundi), max: formatISO(dimanche) }
}

// ── Première semaine ISO du planning d'une année ──
// Le planning commence TOUJOURS après les vacances scolaires de Noël. La semaine ISO 1 (lundi fin
// décembre de l'année précédente) relève du planning de l'année d'avant → exclue d'office. On saute
// en plus le bloc de tête en vacances scolaires (Noël qui déborde sur janvier). Minimum 2.
// `vacancesScolaires` : liste plate de n° de semaines ISO (toutes périodes mêlées).
export function premiereSemainePlanning(vacancesScolaires = []) {
  const set = new Set((vacancesScolaires ?? []).filter(n => Number.isInteger(n)))
  let s = 2
  while (set.has(s)) s++ // étend tant que la semaine de tête est en congé scolaire (bloc de Noël)
  return s
}

// ── Bloc des grandes vacances (été) parmi les semaines de vacances scolaires ──
// `vacancesScolaires` est une liste plate de n° de semaines ISO (toutes périodes mêlées).
// L'été est le PLUS LONG segment de semaines consécutives (≈ S27→S35, vs 2 semaines pour
// février/Pâques/Toussaint). Renvoie { debut, fin, semaines } ou null si liste vide.
export function blocEteVacancesScolaires(vacancesScolaires = []) {
  const tri = [...new Set(vacancesScolaires)].filter(n => Number.isInteger(n)).sort((a, b) => a - b)
  if (tri.length === 0) return null
  let best = [], cur = []
  for (let i = 0; i < tri.length; i++) {
    cur = (i > 0 && tri[i] === tri[i - 1] + 1) ? [...cur, tri[i]] : [tri[i]]
    if (cur.length > best.length) best = cur
  }
  return { debut: best[0], fin: best[best.length - 1], semaines: best }
}

// ── Bloc des vacances scolaires de la Toussaint (automne) ──
// On ancre sur la semaine du 1ᵉʳ novembre (férié Toussaint), puis on étend aux semaines scolaires
// contiguës. Isolé de l'été (juil-août) et de Noël (fin décembre). Renvoie la liste des n° ISO (ou []).
export function blocToussaint(annee, vacancesScolaires = []) {
  const set = new Set(vacancesScolaires.filter(n => Number.isInteger(n)))
  if (set.size === 0) return []
  const cible = numeroSemaineISO(new Date(Date.UTC(annee, 10, 1))) // 1ᵉʳ novembre
  // Semaine scolaire d'ancrage : la cible, sinon la plus proche (± quelques semaines).
  let ancre = null
  for (let d = 0; d <= 3 && ancre == null; d++) {
    if (set.has(cible - d)) ancre = cible - d
    else if (set.has(cible + d)) ancre = cible + d
  }
  if (ancre == null) return []
  const bloc = [ancre]
  for (let x = ancre - 1; set.has(x); x--) bloc.unshift(x)
  for (let x = ancre + 1; set.has(x); x++) bloc.push(x)
  return bloc
}

// ── Vacances scolaires (indicatif, À CONFIRMER selon la zone de la clinique) ──
// Les numéros de semaine ISO sont approximatifs et doivent être validés.
export const VACANCES_SCOLAIRES_2026 = {
  aConfirmer: true,
  fevrier: { label: 'Février (hiver)', semaines: [7, 8] },
  paques: { label: 'Pâques (printemps)', semaines: [16, 17] },
  toussaint: { label: 'Toussaint', semaines: [43, 44] },
}

// ── Jours fériés français (calcul valable toute année grégorienne, en UTC) ──
// Pâques via l'algorithme de Meeus/Butcher ; les fériés mobiles en découlent.
function paquesDimanche(annee) {
  const a = annee % 19
  const b = Math.floor(annee / 100)
  const c = annee % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mois = Math.floor((h + l - 7 * m + 114) / 31) // 3 = mars, 4 = avril
  const jour = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(annee, mois - 1, jour))
}

// → [{ iso, nom, date }] trié par date
export function joursFeriesFR(annee) {
  const paques = paquesDimanche(annee)
  const liste = [
    { date: new Date(Date.UTC(annee, 0, 1)), nom: "Jour de l'an" },
    { date: new Date(paques.getTime() + 1 * JOUR_MS), nom: 'Lundi de Pâques' },
    { date: new Date(Date.UTC(annee, 4, 1)), nom: 'Fête du travail' },
    { date: new Date(Date.UTC(annee, 4, 8)), nom: 'Victoire 1945' },
    { date: new Date(paques.getTime() + 39 * JOUR_MS), nom: 'Ascension' },
    { date: new Date(paques.getTime() + 50 * JOUR_MS), nom: 'Lundi de Pentecôte' },
    { date: new Date(Date.UTC(annee, 6, 14)), nom: 'Fête nationale' },
    { date: new Date(Date.UTC(annee, 7, 15)), nom: 'Assomption' },
    { date: new Date(Date.UTC(annee, 10, 1)), nom: 'Toussaint' },
    { date: new Date(Date.UTC(annee, 10, 11)), nom: 'Armistice 1918' },
    { date: new Date(Date.UTC(annee, 11, 25)), nom: 'Noël' },
  ]
  return liste
    .sort((x, y) => x.date.getTime() - y.date.getTime())
    .map(f => ({ iso: formatISO(f.date), nom: f.nom, date: f.date }))
}

// Jours fériés tombant un jour OUVRÉ (lundi→vendredi), groupés par numéro de semaine ISO.
// Les fériés tombant un samedi/dimanche sont exclus (le bloc ne tourne pas le week-end).
// → { <num>: [{ iso, nom, jourLabel }] }
const JOUR_OUVRE_LABEL = { 1: 'lundi', 2: 'mardi', 3: 'mercredi', 4: 'jeudi', 5: 'vendredi' }
export function feriesEnSemaine(annee) {
  const parSemaine = {}
  for (const f of joursFeriesFR(annee)) {
    const jour = f.date.getUTCDay() // 0=dim, 1=lun … 5=ven, 6=sam
    if (jour < 1 || jour > 5) continue
    const num = numeroSemaineISO(f.date)
    if (!parSemaine[num]) parSemaine[num] = []
    parSemaine[num].push({ iso: f.iso, nom: f.nom, jourLabel: JOUR_OUVRE_LABEL[jour] })
  }
  return parSemaine
}

// ── Type garde / astreinte d'un jour de la semaine (rotation avec l'autre groupe). ──
// Source unique pour la base calendrier (PLANNING.md §3) : lun/mar/mer sont fixes ;
// jeu/ven/sam/dim viennent de la base saisie, sinon valeur par défaut.
export const TYPE_FIXE = { 0: 'A', 1: 'G', 2: 'A' }              // lun=Astreinte, mar=Garde, mer=Astreinte
export const CLE_JOUR = { 3: 'jeu', 4: 'ven', 5: 'sam', 6: 'dim' }
export const DEFAUT_ROTATION = { jeu: 'G', ven: 'A', sam: 'A', dim: 'G' }

// Type ('G' garde | 'A' astreinte) d'un jour (offset 0=lundi … 6=dimanche) d'une semaine ISO
// donnée, d'après la base calendrier `data` ({ semaines: { <num>: { jeu, ven, sam, dim } } }).
export function typeDuJour(calendrier, numSemaine, offset) {
  if (offset <= 2) return TYPE_FIXE[offset]
  const cle = CLE_JOUR[offset]
  return calendrier?.semaines?.[numSemaine]?.[cle] ?? DEFAUT_ROTATION[cle]
}

// ── Vacances scolaires zone C — pré-remplissage par défaut (vide). ──
// Les vraies dates sont récupérées en direct depuis l'API officielle
// (cf. recupererVacancesScolairesZoneC dans calendrierApi.js), via un bouton
// dans la page Base calendrier. Pas de valeurs codées en dur (évite l'imprécision).
export function semainesVacancesScolaires() {
  return []
}
