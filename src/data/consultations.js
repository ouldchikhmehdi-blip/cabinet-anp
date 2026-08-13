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

// v3 : données réelles Doctolib 2022→2026 (ajout 2026 jan→mai + Charpy-Debourdeau réintégrée).
const CLE       = 'sarm:consult:v3'
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
/**
 * Migration « Chir. bariatrique » : le motif FIBRO n'est plus attribué à un praticien.
 *
 * Ses opérateurs (Warthmann, Léon) sont des chirurgiens, pas des gastro-entérologues : le compter
 * comme un praticien de la Gastro faussait le détail. Ses valeurs rejoignent donc le bucket
 * « non attribué » de la spécialité, et le praticien disparaît de la liste.
 *
 * Le total de la spécialité est INCHANGÉ (`specMensuel` = somme des praticiens + bucket).
 *
 * Idempotente : une fois le praticien retiré, la fonction sort immédiatement. À appeler APRÈS la
 * boucle de réconciliation — celle-ci ré-ajoute les praticiens du mock absents du store, or
 * `bariatrique` en a justement été retiré, donc il ne revient pas.
 */
function migrerBariatrique(store) {
  const spec = store.specialites.find(s => s.id === 'endoscopie')
  if (!spec?.praticiens) return

  const i = spec.praticiens.findIndex(p => p.id === 'bariatrique')
  if (i === -1) return

  const [prat] = spec.praticiens.splice(i, 1)
  if (!spec.valeurs) spec.valeurs = {}
  for (const [annee, mois] of Object.entries(prat.valeurs || {})) {
    if (!spec.valeurs[annee]) spec.valeurs[annee] = Array(12).fill(0)
    for (let m = 0; m < 12; m++) spec.valeurs[annee][m] += mois[m] || 0
  }
}

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

  // APRÈS la boucle : sinon le praticien retiré serait ré-ajouté puis re-migré à chaque
  // chargement, et ses valeurs s'additionneraient indéfiniment dans le bucket.
  migrerBariatrique(store)

  return store
}

/** Lecture du store (initialise à partir du mock si absent, puis réconcilie). */
export function getConsultData() {
  const store = charger(CLE, initStore())
  return reconcilier(store)
}

// Persisteur DISTANT injectable (Supabase), branché par la page Consultations au montage. Laisse la
// couche data agnostique : toute mutation passant par sauverStore() est ainsi persistée en base sans
// avoir à modifier chaque site d'appel. null tant qu'aucun persisteur n'est enregistré (ex. tests).
let _persisteurDistant = null
export function setPersisteurDistant(fn) {
  _persisteurDistant = fn
}

/** Persistance complète du store : localStorage (instantané) + persisteur distant (partagé). */
function sauverStore(store) {
  sauver(CLE, store)
  _persisteurDistant?.(store)
}

/** Écrit le store en localStorage SANS déclencher le persisteur distant (chargement depuis Supabase → évite l'écho). */
export function remplacerStore(store) {
  sauver(CLE, store)
}

/** Règles d'import utilisateur (localStorage) — lues pour la persistance distante. */
export function getReglesUtilisateur() {
  return charger(CLE_REGLES, [])
}

/** Écrit les règles utilisateur en localStorage (chargement depuis Supabase). */
export function remplacerRegles(regles) {
  sauver(CLE_REGLES, Array.isArray(regles) ? regles : [])
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

  // Fusion spécialités (par ex. Pneumologie, ou bucket « non attribué » pour Gastro/Neuro/Viscéral)
  // On écrit dans spec.valeurs même si la spécialité a des praticiens —
  // cela permet d'y stocker les consultations non attribuées à un praticien précis.
  for (const [specId, anneeMap] of Object.entries(agrege.specialites || {})) {
    const spec = store.specialites.find(s => s.id === specId)
    if (!spec) continue
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

// ─── Suppression d'un mois ────────────────────────────────────────────────────

/**
 * Énumère tous les emplacements (tableaux de 12 valeurs) portant des données pour `annee` :
 * total global, téléconsultations, bucket « non attribué » de chaque spécialité et chaque
 * praticien. Renvoie des références vivantes sur les tableaux du store, pour lecture ET écriture.
 */
function emplacementsAnnee(store, annee) {
  const liste = []

  if (store.global[annee]) {
    liste.push({ categorie: 'global', label: 'Total global', serie: store.global[annee] })
  }
  if (store.teleconsultations[annee]) {
    liste.push({ categorie: 'teleconsult', label: 'Téléconsultations', serie: store.teleconsultations[annee] })
  }

  for (const spec of store.specialites) {
    if (spec.valeurs?.[annee]) {
      liste.push({
        categorie: 'specialite',
        label: spec.praticiens ? `${spec.nom} — non attribué` : spec.nom,
        specNom: spec.nom,
        serie: spec.valeurs[annee],
      })
    }
    for (const prat of spec.praticiens || []) {
      if (prat.valeurs?.[annee]) {
        liste.push({
          categorie: 'praticien',
          label: prat.nom,
          specNom: spec.nom,
          serie: prat.valeurs[annee],
        })
      }
    }
  }

  return liste
}

/**
 * Décrit ce que contient un mois — sert à montrer précisément ce qui va être supprimé
 * AVANT de valider (le total global n'est pas la somme du détail : cf. CONSULTATIONS.md §2).
 *
 * @param {number} annee
 * @param {number} mois  — 0-11
 * @returns {{ total: number, tele: number, lignes: Array<{label, specNom, valeur}> }}
 */
export function contenuMois(annee, mois) {
  const store = getConsultData()
  const emplacements = emplacementsAnnee(store, annee)

  const valeurDe = cat => emplacements.find(e => e.categorie === cat)?.serie[mois] || 0

  const lignes = emplacements
    .filter(e => e.categorie === 'praticien' || e.categorie === 'specialite')
    .map(e => ({ label: e.label, specNom: e.specNom, valeur: e.serie[mois] || 0 }))
    .filter(l => l.valeur > 0)
    .sort((a, b) => b.valeur - a.valeur)

  return { total: valeurDe('global'), tele: valeurDe('teleconsult'), lignes }
}

/**
 * Efface les données d'un mois : total global, téléconsultations et tout le détail
 * (praticiens + buckets de spécialité) sont remis à 0. Sert à rattraper un import erroné.
 *
 * Si l'année devient entièrement vide, ses clés sont retirées du store — sinon une année
 * importée par erreur (ex. 2027) resterait proposée dans le sélecteur d'années.
 *
 * @param {number} annee
 * @param {number} mois — 0-11
 * @returns {{ total: number, anneeSupprimee: boolean }} ce qui a été retiré
 */
export function supprimerMois(annee, mois) {
  const store = getConsultData()
  const emplacements = emplacementsAnnee(store, annee)

  const total = emplacements.find(e => e.categorie === 'global')?.serie[mois] || 0
  for (const { serie } of emplacements) serie[mois] = 0

  // Nettoyage : année devenue vide partout → on retire ses clés du store
  const anneeVide = emplacements.every(({ serie }) => serie.every(v => !v))
  if (anneeVide) {
    delete store.global[annee]
    delete store.teleconsultations[annee]
    for (const spec of store.specialites) {
      if (spec.valeurs) delete spec.valeurs[annee]
      for (const prat of spec.praticiens || []) delete prat.valeurs[annee]
    }
  }

  sauverStore(store)
  return { total, anneeSupprimee: anneeVide }
}

// ─── Gestion des praticiens ───────────────────────────────────────────────────

/**
 * Ajoute un praticien à une spécialité dans le store persisté.
 *
 * @param {string} specId — identifiant de la spécialité (ex. 'endoscopie')
 * @param {string} nom    — nom affiché du praticien
 * @returns {string|null} l'id généré, ou null si la spécialité n'a pas de praticiens
 */
export function ajouterPraticien(specId, nom) {
  const store = getConsultData()
  const spec = store.specialites.find(s => s.id === specId)
  if (!spec || !spec.praticiens) return null

  // Génération d'un id unique à partir du nom normalisé
  const base = normaliserCle(nom).toLowerCase().replace(/\s+/g, '-') || 'praticien'
  let id = base
  let suffixe = 2
  while (spec.praticiens.some(p => p.id === id)) {
    id = `${base}-${suffixe}`
    suffixe++
  }

  spec.praticiens.push({
    id,
    nom: nom.trim(),
    valeurs: {
      2022: Array(12).fill(0),
      2023: Array(12).fill(0),
      2024: Array(12).fill(0),
    },
    ajoutManuel: true,
  })

  sauverStore(store)
  return id
}

/**
 * Masque ou réaffiche un praticien (flag `masque`).
 * Un praticien masqué disparaît du détail mais ses chiffres restent dans les totaux.
 *
 * @param {string}  specId  — identifiant de la spécialité
 * @param {string}  pratId  — identifiant du praticien
 * @param {boolean} masque  — true pour masquer, false pour réafficher
 */
export function definirMasquePraticien(specId, pratId, masque) {
  const store = getConsultData()
  const spec = store.specialites.find(s => s.id === specId)
  if (!spec || !spec.praticiens) return
  const prat = spec.praticiens.find(p => p.id === pratId)
  if (!prat) return

  if (masque) {
    prat.masque = true
  } else {
    delete prat.masque
  }

  sauverStore(store)
}

// ─── Cibles ───────────────────────────────────────────────────────────────────

/**
 * Renvoie la liste des cibles assignables lors du classement des clés inconnues.
 * Chaque cible = { id, label, type: 'praticien'|'specialite'|'global'|'ignorer', … }
 * Les praticiens masqués sont exclus (opérateur parti → on ne leur attribue plus de consults).
 */
export function cibles() {
  const store = getConsultData()
  const liste = []

  for (const spec of store.specialites) {
    if (spec.praticiens) {
      for (const prat of spec.praticiens.filter(p => !p.masque)) {
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
      // Cible « non attribué » : compte dans le total de la spécialité sans praticien précis
      liste.push({
        id: `spec:${spec.id}`,
        label: `${spec.nom} — non attribué`,
        type: 'specialite-autre',
        specId: spec.id,
        specNom: spec.nom,
      })
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

  liste.push({ id: 'teleconsult', label: 'Téléconsultation', type: 'teleconsult' })
  liste.push({ id: 'global', label: 'Global / autre', type: 'global' })
  liste.push({ id: 'ignorer', label: 'Ignorer', type: 'ignorer' })

  return liste
}
