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

// ── Vacances scolaires (indicatif, À CONFIRMER selon la zone de la clinique) ──
// Les numéros de semaine ISO sont approximatifs et doivent être validés.
export const VACANCES_SCOLAIRES_2026 = {
  aConfirmer: true,
  fevrier: { label: 'Février (hiver)', semaines: [7, 8] },
  paques: { label: 'Pâques (printemps)', semaines: [16, 17] },
  toussaint: { label: 'Toussaint', semaines: [43, 44] },
}
