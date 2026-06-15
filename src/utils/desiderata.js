// ============================================================
// desiderata.js — modèle de données et persistance des desiderata
// Stockage localStorage (MVP), une clé par année. Cf. PLANNING.md §11B, §17.
// ============================================================
import { charger, sauver } from './stockage'
import { ASSOCIES } from '../data/associes'

const cleAnnee = (annee) => `sarm:planning:desiderata:${annee}`
export const CLE_MOI = 'sarm:planning:moi'
export const CLE_ANNEE = 'sarm:planning:annee'
export const ANNEE_DEFAUT = 2026

// Objet desiderata vide d'un associé — tous les champs §11B, tous facultatifs.
export function desiderataVide() {
  return {
    rienASignaler: false,
    soumis: false,
    majLe: null,
    vacancesSouhaitees: [],      // numéros de semaine ISO
    vacancesRefusees: [],        // numéros de semaine ISO (contrainte négative)
    joursOffSouhaites: [],       // dates 'YYYY-MM-DD'
    joursReposInterdits: [],     // dates 'YYYY-MM-DD'
    preferenceVacancesScolaires: null, // 'paques' | 'fevrier' | null (exclusivité §8)
    toussaintSouhaitee: null,    // true | false | null
    weekends: {},                // { '<numSemaine>': 'dispo'|'indispo'|'garde-ok'|'astreinte-ok' }
    demandeColonneSemaineType: '',
    commentaire: '',
  }
}

// Charge les données d'une année, en fusionnant chaque associé avec le modèle vide
// (tolérance aux schémas partiels / champs ajoutés plus tard).
export function chargerAnnee(annee) {
  const brut = charger(cleAnnee(annee), null)
  const associes = {}
  for (const a of ASSOCIES) {
    associes[a] = { ...desiderataVide(), ...(brut?.associes?.[a] ?? {}) }
  }
  return { annee, associes }
}

export function sauverAnnee(annee, data) {
  sauver(cleAnnee(annee), data)
}

// Un associé est considéré « rempli » (🟢) dès qu'il a transmis, coché « rien à
// signaler », ou renseigné au moins un champ.
export function estRempli(d) {
  if (!d) return false
  if (d.rienASignaler || d.soumis) return true
  return (
    d.vacancesSouhaitees.length > 0 ||
    d.vacancesRefusees.length > 0 ||
    d.joursOffSouhaites.length > 0 ||
    d.joursReposInterdits.length > 0 ||
    d.preferenceVacancesScolaires !== null ||
    d.toussaintSouhaitee !== null ||
    Object.keys(d.weekends).length > 0 ||
    d.demandeColonneSemaineType.trim() !== '' ||
    d.commentaire.trim() !== ''
  )
}
