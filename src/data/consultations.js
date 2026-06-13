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
import { REGLES_DEFAUT } from './consultationsReglesDefaut'
import { normaliserCle } from '../utils/importConsultations'
import { charger, sauver } from '../utils/stockage'

const CLE       = 'sarm:consult'
const CLE_REGLES = 'sarm:consult-regles'

// Clone profond simple (pas de Date ni de RegExp dans ces structures)
const clone = v => JSON.parse(JSON.stringify(v))

// ─── Initialisation & réconciliation du store ────────────────────────────────

function initStore() {
  return {
    global: clone(CONSULTATIONS),
    teleconsultations: clone(TELECONSULTATIONS),
    specialites: clone(CONSULT_SPECIALITES),
  }
}

/**
 * Réconcilie le store persisté avec le mock baseline courant.
 *
 * Garantit que les spécialités / praticiens ajoutés après la première
 * initialisation (ex. Pneumologie, gastro-entérologues) apparaissent dans le
 * store sans écraser les valeurs déjà importées.
 *
 * Migration endoscopie : si la spécialité est encore au format { valeurs }
 * (ancienne structure), elle est convertie vers { praticiens } pour rester
 * cohérente avec le mock actuel.
 */
function reconcilier(store) {
  for (const specMock of CONSULT_SPECIALITES) {
    let specStore = store.specialites.find(s => s.id === specMock.id)

    if (!specStore) {
      // Nouvelle spécialité absente du store → on l'ajoute avec les valeurs du mock
      store.specialites.push(clone(specMock))
      continue
    }

    // Migration endoscopie : ancienne structure valeurs → praticiens
    if (specMock.praticiens && !specStore.praticiens) {
      specStore.praticiens = clone(specMock.praticiens)
      delete specStore.valeurs
    }

    // Praticiens manquants dans le store (ajouts ultérieurs)
    if (specMock.praticiens && specStore.praticiens) {
      for (const pratMock of specMock.praticiens) {
        const existe = specStore.praticiens.some(p => p.id === pratMock.id)
        if (!existe) specStore.praticiens.push(clone(pratMock))
      }
    }

    // Spécialité sans praticiens : s'assurer que valeurs existe
    if (!specMock.praticiens && !specStore.valeurs) {
      specStore.valeurs = clone(specMock.valeurs)
    }
  }

  return store
}

/** Lecture du store (initialise à partir du mock si absent, puis réconcilie). */
export function getConsultData() {
  const store = charger(CLE, initStore())
  return reconcilier(store)
}

/** Persistance complète du store. */
function sauverStore(store) {
  sauver(CLE, store)
}

/** Réinitialise le store aux données du mock (utile pour un reset total). */
export function resetConsultData() {
  sauverStore(initStore())
}

// ─── Règles d'import ─────────────────────────────────────────────────────────

/**
 * Renvoie la liste complète des règles actives :
 *   REGLES_DEFAUT fusionnées avec les règles persistées par l'utilisateur.
 *   Les règles utilisateur ont la priorité (même cleNorm → on garde la sienne).
 *
 * C'est cette liste qui doit être passée à analyserCSV().
 */
export function reglesInitiales() {
  const reglesUtilisateur = charger(CLE_REGLES, [])

  // Index des règles utilisateur par clé normalisée (priorité sur les défauts)
  const indexUtilisateur = {}
  for (const r of reglesUtilisateur) {
    indexUtilisateur[normaliserCle(r.cle)] = true
  }

  // Filtrer les règles par défaut masquées par l'utilisateur
  const defautsActifs = REGLES_DEFAUT.filter(
    r => !indexUtilisateur[normaliserCle(r.cle)]
  )

  return [...defautsActifs, ...reglesUtilisateur]
}

// ─── Import ───────────────────────────────────────────────────────────────────

/**
 * Fusionne les données issues d'un import CSV dans le store, mois par mois.
 *
 * @param {Object} agrege — sortie de importConsultations.analyserCSV()
 *   {
 *     global:            { [annee]: { [mois]: number } },
 *     teleconsultations: { [annee]: { [mois]: number } },
 *     praticiens:        { [specId]: { [pratId]: { [annee]: { [mois]: number } } } },
 *     specialites:       { [specId]: { [annee]: { [mois]: number } } },
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

  // Fusion spécialités sans praticiens (ex. Pneumologie)
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

// ─── Cibles ───────────────────────────────────────────────────────────────────

/**
 * Renvoie la liste des cibles assignables lors du classement des clés inconnues.
 * Chaque cible = { id, label, type: 'praticien'|'specialite'|'global'|'ignorer', … }
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
