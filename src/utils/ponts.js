// ============================================================
// ponts.js — détection des « ponts » autour des jours fériés (PLANNING.md).
// Un jour férié = garde/astreinte uniquement, le bloc opératoire ne tourne pas.
// Un associé « fait le pont » s'il pose des jours off accolés à un férié (et/ou
// au week-end) pour cumuler une longue plage de repos → à signaler au faiseur.
//
// Détection par segments de jours calendaires consécutifs : on unit les
// samedis + dimanches + fériés + jours off de l'associé, on découpe en segments
// contigus, et on garde tout segment contenant AU MOINS un férié ET un jour off.
// La détection J-1/J/J+1 et les plages plus longues en découlent naturellement.
//
// Tout en UTC. Déterministe (aucun Math.random / Date.now).
// ============================================================
import { joursFeriesFR, formatISO, parseISO, numeroSemaineISO, lundiDeSemaineISO } from './calendrier'

const JOUR_MS = 24 * 60 * 60 * 1000 // non exporté par calendrier.js → redéfini ici

// Clé d'écartement d'un jour off de pont (format stocké dans data.pontsEcartes).
export function cleEcart(ini, iso) {
  return `${ini}|${iso}`
}

// Clé d'écartement d'une indispo week-end de pont (semaine ISO du week-end).
export function cleEcartWeekend(ini, semaine) {
  return `${ini}|WE|${semaine}`
}

const estWeekend = (date) => {
  const j = date.getUTCDay()
  return j === 0 || j === 6 // dimanche ou samedi
}

// Calcule les ponts d'un associé à partir de ses jours off et d'une carte des fériés.
//   offSet      : Set(iso) des jours off de l'associé
//   feriesSet   : Set(iso) des fériés de l'année
//   feriesNom   : Map(iso → nom) des fériés
//   annee       : année civile à parcourir
// → Pont[] (cf. forme ci-dessous)
function segmentsPonts(offSet, feriesSet, feriesNom, annee) {
  if (offSet.size === 0 || feriesSet.size === 0) return []

  const ponts = []
  let courant = null // { debut(Date), fin(Date), feries:[{iso,nom}], joursOff:[iso], jours:number }

  const cloturer = () => {
    if (courant && courant.feries.length > 0 && courant.joursOff.length > 0) {
      const debut = formatISO(courant.debut)
      const fin = formatISO(courant.fin)
      ponts.push({
        id: `${debut}_${fin}`,
        debut,
        fin,
        feries: courant.feries,
        joursOff: courant.joursOff,
        nbJoursReposTotal: courant.jours,
      })
    }
    courant = null
  }

  // Parcours de l'année civile, jour par jour (on ne traverse pas 31/12 → 01/01).
  const debutAnnee = Date.UTC(annee, 0, 1)
  const finAnnee = Date.UTC(annee, 11, 31)
  for (let t = debutAnnee; t <= finAnnee; t += JOUR_MS) {
    const date = new Date(t)
    const iso = formatISO(date)
    const ferie = feriesSet.has(iso)
    const off = offSet.has(iso)
    const repos = estWeekend(date) || ferie || off

    if (!repos) { cloturer(); continue }

    if (!courant) courant = { debut: date, fin: date, feries: [], joursOff: [], jours: 0 }
    courant.fin = date
    courant.jours += 1
    if (ferie) courant.feries.push({ iso, nom: feriesNom.get(iso) })
    if (off) courant.joursOff.push(iso)
  }
  cloturer()
  return ponts
}

// Ponts d'un seul associé.
// joursOff : ['YYYY-MM-DD', …] (data.joursOffSouhaites). → Pont[] trié par début.
export function detecterPonts(joursOff, annee) {
  const offSet = new Set(joursOff ?? [])
  if (offSet.size === 0) return []
  const feries = joursFeriesFR(annee)
  const feriesSet = new Set(feries.map(f => f.iso))
  const feriesNom = new Map(feries.map(f => [f.iso, f.nom]))
  return segmentsPonts(offSet, feriesSet, feriesNom, annee)
}

// Ponts de tous les associés (fériés calculés une seule fois).
// parIni : { ini: ['YYYY-MM-DD', …] }. → { ini: Pont[] } (entrées vides omises).
export function detecterPontsTous(parIni, annee) {
  const feries = joursFeriesFR(annee)
  const feriesSet = new Set(feries.map(f => f.iso))
  const feriesNom = new Map(feries.map(f => [f.iso, f.nom]))
  const out = {}
  for (const [ini, joursOff] of Object.entries(parIni ?? {})) {
    const ponts = segmentsPonts(new Set(joursOff ?? []), feriesSet, feriesNom, annee)
    if (ponts.length > 0) out[ini] = ponts
  }
  return out
}

// ── Ponts « week-end » : indispos posées sur un week-end accolé à un férié ──
// Un férié un VENDREDI rend accolé le week-end de SA semaine (ven + sam + dim).
// Un férié un LUNDI rend accolé le week-end de la semaine PRÉCÉDENTE (sam + dim + lun).
// Un férié samedi/dimanche ne compte pas (le week-end est déjà non travaillé au bloc).
//
// → { [semaine ISO du week-end]: [{ iso, nom, jour:'vendredi'|'lundi' }] }
export function weekendsAccolesFerie(annee) {
  const out = {}
  for (const f of joursFeriesFR(annee)) {
    const d = parseISO(f.iso)
    const j = d.getUTCDay() // 1 = lundi, 5 = vendredi
    let semaine = null
    let jour = null
    if (j === 5) { semaine = numeroSemaineISO(d); jour = 'vendredi' }
    else if (j === 1) { semaine = numeroSemaineISO(new Date(d.getTime() - JOUR_MS)); jour = 'lundi' }
    if (semaine == null) continue
    ;(out[semaine] ??= []).push({ iso: f.iso, nom: f.nom, jour })
  }
  return out
}

// Ponts week-end de tous les associés : intersection de leurs indispos week-end
// avec les week-ends accolés à un férié vendredi/lundi.
// parIniWE : { ini: [semaines ISO indisponibles] }.
// → { ini: [{ semaine, debut, fin, feries:[{iso,nom,jour}] }] } (entrées vides omises).
export function detecterPontsWeekendTous(parIniWE, annee) {
  const accoles = weekendsAccolesFerie(annee)
  const out = {}
  for (const [ini, semaines] of Object.entries(parIniWE ?? {})) {
    const liste = []
    for (const semaine of (semaines ?? [])) {
      const feries = accoles[semaine]
      if (!feries) continue
      const lundi = lundiDeSemaineISO(annee, semaine)
      const debut = formatISO(new Date(lundi.getTime() + 5 * JOUR_MS)) // samedi
      const fin = formatISO(new Date(lundi.getTime() + 6 * JOUR_MS))   // dimanche
      liste.push({ semaine, debut, fin, feries })
    }
    if (liste.length > 0) {
      liste.sort((a, b) => a.semaine - b.semaine)
      out[ini] = liste
    }
  }
  return out
}

// Petit utilitaire d'affichage : libellé court d'une plage de pont.
// Réexporté ici pour éviter aux composants d'importer parseISO directement.
export { parseISO }
