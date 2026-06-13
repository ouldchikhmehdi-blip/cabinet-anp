/**
 * Couche d'accès aux données de consultation.
 *
 * Les données sont initialement celles du mock (mockData.js) mais peuvent
 * être enrichies/mises à jour via l'import CSV Doctolib.
 * Elles sont persistées dans localStorage via charger/sauver.
 */
import {
  CONSULTATIONS,
  TELECONSULTATIONS,
  CONSULT_SPECIALITES,
} from './mockData'
import { charger, sauver } from '../utils/stockage'

const CLE = 'sarm:consult'

// Clone profond simple (pas de Date ni de RegExp dans ces structures)
const clone = v => JSON.parse(JSON.stringify(v))

// Initialisation du store : on utilise les données mock si rien n'est persisté
function initStore() {
  return {
    global: clone(CONSULTATIONS),
    teleconsultations: clone(TELECONSULTATIONS),
    specialites: clone(CONSULT_SPECIALITES),
  }
}

/** Lecture du store (initialise à partir du mock si absent). */
export function getConsultData() {
  return charger(CLE, initStore())
}

/** Persistance complète du store. */
function sauverStore(store) {
  sauver(CLE, store)
}

/**
 * Réinitialise le store aux données du mock (utile pour les tests ou un reset).
 */
export function resetConsultData() {
  sauverStore(initStore())
}

/**
 * Fusionne les données issues d'un import CSV dans le store, mois par mois.
 *
 * @param {Object} agrege — sortie de importConsultations.agréger()
 *   {
 *     global:          { [annee]: { [mois]: number } },   // total RDV honorés (0-indexé)
 *     teleconsultations: { [annee]: { [mois]: number } },
 *     praticiens:      { [specId]: { [pratId]: { [annee]: { [mois]: number } } } },
 *     specialites:     { [specId]: { [annee]: { [mois]: number } } },  // pour spéc. sans praticiens
 *   }
 */
export function appliquerImport(agrege) {
  const store = getConsultData()

  // Fusion global
  for (const [annee, moisMap] of Object.entries(agrege.global || {})) {
    if (!store.global[annee]) store.global[annee] = Array(12).fill(0)
    for (const [mois, val] of Object.entries(moisMap)) {
      store.global[annee][Number(mois)] = val
    }
  }

  // Fusion téléconsultations
  for (const [annee, moisMap] of Object.entries(agrege.teleconsultations || {})) {
    if (!store.teleconsultations[annee]) store.teleconsultations[annee] = Array(12).fill(0)
    for (const [mois, val] of Object.entries(moisMap)) {
      store.teleconsultations[annee][Number(mois)] = val
    }
  }

  // Fusion par praticien
  for (const [specId, pratMap] of Object.entries(agrege.praticiens || {})) {
    const spec = store.specialites.find(s => s.id === specId)
    if (!spec || !spec.praticiens) continue
    for (const [pratId, anneeMap] of Object.entries(pratMap)) {
      const prat = spec.praticiens.find(p => p.id === pratId)
      if (!prat) continue
      for (const [annee, moisMap] of Object.entries(anneeMap)) {
        if (!prat.valeurs[annee]) prat.valeurs[annee] = Array(12).fill(0)
        for (const [mois, val] of Object.entries(moisMap)) {
          prat.valeurs[annee][Number(mois)] = val
        }
      }
    }
  }

  // Fusion spécialités sans praticiens
  for (const [specId, anneeMap] of Object.entries(agrege.specialites || {})) {
    const spec = store.specialites.find(s => s.id === specId)
    if (!spec || spec.praticiens) continue
    for (const [annee, moisMap] of Object.entries(anneeMap)) {
      if (!spec.valeurs) spec.valeurs = {}
      if (!spec.valeurs[annee]) spec.valeurs[annee] = Array(12).fill(0)
      for (const [mois, val] of Object.entries(moisMap)) {
        spec.valeurs[annee][Number(mois)] = val
      }
    }
  }

  sauverStore(store)
  return store
}

/**
 * Renvoie la liste des cibles assignables lors du classement des clés inconnues.
 * Chaque cible = { id, label, type: 'praticien'|'specialite'|'global'|'ignorer', specId?, pratId? }
 */
export function cibles() {
  const store = getConsultData()
  const liste = []

  for (const spec of store.specialites) {
    if (spec.praticiens) {
      for (const prat of spec.praticiens) {
        liste.push({
          id: `prat:${spec.id}:${prat.id}`,
          label: `${prat.nom} (${spec.nom})`,
          type: 'praticien',
          specId: spec.id,
          specNom: spec.nom,
          pratId: prat.id,
          pratNom: prat.nom,
        })
      }
    } else {
      liste.push({
        id: `spec:${spec.id}`,
        label: spec.nom,
        type: 'specialite',
        specId: spec.id,
        specNom: spec.nom,
      })
    }
  }

  liste.push({ id: 'global', label: 'Global / autre', type: 'global' })
  liste.push({ id: 'ignorer', label: 'Ignorer', type: 'ignorer' })

  return liste
}
