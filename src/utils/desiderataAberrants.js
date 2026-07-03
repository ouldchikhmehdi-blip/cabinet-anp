// ============================================================
// desiderataAberrants.js — détecte les desiderata INTERNEMENT CONTRADICTOIRES d'un associé
// (deux choix qui ne peuvent pas être satisfaits ensemble), signalés au faiseur au clic sur l'associé
// dans le suivi (« Ouverture du planning »). Purement dérivé des desiderata + la trame principale.
//
// Deux familles de règles (validées avec le faiseur) :
//   1) Vendredi / veille de week-end : un jour off le vendredi (ou une veille de WE « sans garde/
//      astreinte le vendredi ») incohérent avec la colonne choisie cette semaine-là, qui travaille /
//      est de service le vendredi.
//   2) Jour off dans une semaine déjà demandée entièrement en vacances (redondant / contradictoire).
//
// Sortie : [{ type, semaine, date?, message }]  (liste vide = aucun desiderata aberrant).
// ============================================================
import { numeroSemaineISO, parseISO } from './calendrier'

// Colonne choisie par l'associé pour une semaine → objet colonne de la trame principale, ou null.
function colonneChoisie(colonnesSouhaitees, tramePrincipale, sem) {
  if (!tramePrincipale) return null
  const idx = colonnesSouhaitees?.[sem]
  if (idx == null) return null
  return tramePrincipale.colonnes?.[idx] ?? null
}

export function detecterAberrations(d, { tramePrincipale = null } = {}) {
  const aberrations = []
  if (!d) return aberrations

  const joursOff = Array.isArray(d.joursOffSouhaites) ? d.joursOffSouhaites : []
  const vacances = new Set(Array.isArray(d.vacancesSouhaitees) ? d.vacancesSouhaitees : [])
  const veille = new Set(Array.isArray(d.weekendsVeilleIndispo) ? d.weekendsVeilleIndispo : [])
  const colonnesSouhaitees = d.colonnesSouhaitees ?? {}

  for (const iso of joursOff) {
    const dt = parseISO(iso)
    if (Number.isNaN(dt.getTime())) continue
    const sem = numeroSemaineISO(dt)

    // Règle 2 — jour off dans une semaine déjà demandée entièrement en vacances.
    if (vacances.has(sem)) {
      aberrations.push({
        type: 'off-dans-vacances', semaine: sem, date: iso,
        message: `Jour off le ${iso} demandé dans la semaine S${sem}, déjà demandée entièrement en vacances.`,
      })
    }

    // Règle 1a — jour off le VENDREDI alors que la colonne choisie cette semaine TRAVAILLE le vendredi.
    if (dt.getUTCDay() === 5) {
      const col = colonneChoisie(colonnesSouhaitees, tramePrincipale, sem)
      const posteVendredi = (col?.ven ?? '').trim()
      if (posteVendredi) {
        aberrations.push({
          type: 'off-vendredi-colonne', semaine: sem, date: iso,
          message: `Jour off le vendredi ${iso}, mais la colonne choisie S${sem} travaille le vendredi (${posteVendredi}).`,
        })
      }
    }
  }

  // Règle 1b — veille de WE indisponible (pas de garde/astreinte le vendredi) mais colonne choisie
  // DE SERVICE (garde/astreinte) le vendredi cette semaine-là.
  for (const sem of veille) {
    const col = colonneChoisie(colonnesSouhaitees, tramePrincipale, sem)
    if (col?.service?.ven) {
      aberrations.push({
        type: 'veille-colonne-service', semaine: sem,
        message: `Veille du week-end S${sem} demandée sans garde/astreinte le vendredi, mais la colonne choisie est de service ce vendredi-là.`,
      })
    }
  }

  return aberrations
}
