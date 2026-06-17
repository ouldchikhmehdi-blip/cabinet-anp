// ============================================================
// vacancesScolaires.js — helpers de libellé / détection autour des souhaits de
// vacances scolaires (préférence Pâques/Février, Toussaint, semaines scolaires).
// Partagés par PanneauVacances, RecapVacancesScolaires et PlanningSuivi.
// ============================================================
import { ASSOCIES } from '../data/associes'
import { labelSousSemaine } from './desiderata'

// Libellé de la préférence vacances scolaires d'un associé, ou null.
export function prefScolaire(d) {
  const nom = d.preferenceVacancesScolaires === 'paques' ? 'Pâques'
    : d.preferenceVacancesScolaires === 'fevrier' ? 'Février'
      : null
  if (!nom) return null
  const sous = labelSousSemaine(d.prefVacancesSemaine)
  return sous ? `${nom} (${sous})` : nom
}

// Libellé Toussaint d'un associé, ou null.
export function labelToussaint(d) {
  if (d.toussaintSouhaitee === true) {
    const sous = labelSousSemaine(d.toussaintSemaine)
    return sous ? `Toussaint souhaitée (${sous})` : 'Toussaint souhaitée'
  }
  if (d.toussaintSouhaitee === false) return 'Toussaint non souhaitée'
  return null
}

// Un associé a-t-il au moins un souhait de vacances scolaires ?
export function aDesSouhaitsScolaires(desiderataParAssocie = {}, scolairesSet = new Set()) {
  return ASSOCIES.some(ini => {
    const d = desiderataParAssocie[ini]
    if (!d) return false
    if (prefScolaire(d) || labelToussaint(d)) return true
    return (d.vacancesSouhaitees ?? []).some(n => scolairesSet.has(n))
  })
}
