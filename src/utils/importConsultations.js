/**
 * Utilitaire d'import CSV Doctolib pour les consultations.
 *
 * Usage :
 *   const { agrege, fileAttente } = analyserCSV(texteCSV, mappage, regles, cibles)
 *
 * mappage = objet indiquant quelle colonne CSV correspond à quel champ :
 *   { date, praticien, motif?, statut?, typeTeleconsult? }
 *   Toutes les valeurs sont des noms de colonnes (chaînes de caractères) tels
 *   qu'ils apparaissent dans le CSV.
 *
 * regles = tableau de règles mémorisées :
 *   [{ cle, action: 'ignorer'|'praticien'|'specialite'|'global', specId?, pratId? }]
 *
 * cibles = retour de cibles() dans consultations.js
 *
 * Retour :
 *   agrege      — données à passer à appliquerImport() si fileAttente est vide
 *   fileAttente — clés inconnues sans règle, à classer manuellement
 *   apercu      — récap par mois (pour affichage avant validation)
 */
import Papa from 'papaparse'

// ─── Normalisation des clés ───────────────────────────────────────────────────

/**
 * Normalise une chaîne pour la comparer indépendamment de l'orthographe :
 *   MAJUSCULES · sans accents · sans préfixes Dr/Pr/M./Mme · espaces compressés
 *
 * Exemples :
 *   "Dr Nogues J."  → "NOGUES J"
 *   "MEYER-BISCH"   → "MEYER-BISCH"
 *   "dr meyer bisch"→ "MEYER BISCH"
 */
export function normaliserCle(str) {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // supprime les diacritiques
    .toUpperCase()
    .replace(/^(DR|PR|DOCTEUR|PROFESSEUR|M\.|MME|MR)\s+/i, '') // retire les préfixes
    .replace(/[.,;:!?'"]/g, ' ') // ponctuation → espace
    .replace(/\s+/g, ' ')        // espaces multiples
    .trim()
}

// ─── Matching tolérant (préfixe-nom) ─────────────────────────────────────────

/**
 * Recherche la règle correspondant à un nom normalisé.
 *
 * Algorithme :
 *   1. Correspondance exacte sur la clé normalisée (priorité absolue).
 *   2. Sinon, correspondance par préfixe de nom de famille :
 *      la clé de règle la plus longue qui est un préfixe de nomNorm
 *      (ex. "MEYER BISCH" matche "MEYER BISCH Vincent" ; "MEYER" ne gagne pas).
 *
 * @param {string} nomNorm      — clé du nom extrait, déjà normalisée
 * @param {Object} regleParCle  — index des règles { cleNorm → règle }
 */
function trouverRegle(nomNorm, regleParCle) {
  // 1. Correspondance exacte
  if (regleParCle[nomNorm]) return regleParCle[nomNorm]

  // 2. Préfixe-nom : la clé la plus longue qui est un préfixe de nomNorm
  let meilleure = null
  let longueurMax = 0
  for (const [cle, regle] of Object.entries(regleParCle)) {
    if (
      cle.length > longueurMax &&
      (nomNorm === cle || nomNorm.startsWith(cle + ' '))
    ) {
      meilleure = regle
      longueurMax = cle.length
    }
  }
  return meilleure
}

// ─── Détection de colonnes ────────────────────────────────────────────────────

/**
 * Noms de colonnes Doctolib connus (variantes possibles).
 * À compléter / ajuster une fois le vrai CSV fourni.
 */
const CANDIDATS = {
  date:            ['Date', 'date', 'Date du rendez-vous', 'date_rdv', 'Début', 'debut'],
  praticien:       ['Praticien', 'praticien', 'Médecin', 'medecin', 'Docteur', 'Nom du praticien'],
  motif:           ['Motif', 'motif', 'Motif du rendez-vous', 'Raison'],
  statut:          ['Statut', 'statut', 'État', 'etat', 'Status'],
  typeTeleconsult: ['Type', 'type', 'Mode', 'mode', 'Téléconsultation', 'teleconsultation', 'Type de rendez-vous'],
}

/**
 * Détecte le format du CSV : liste de RDV ligne-par-ligne ou tableau statistiques Doctolib.
 *
 * 'rdv'   — une ligne = un rendez-vous, colonnes Date / Praticien présentes.
 * 'stats' — tableau croisé pivot : première colonne = libellé motif,
 *           colonnes suivantes = comptages par agenda (ex. SARM-1, SARM-2…).
 *
 * @param {string[]} headers — en-têtes CSV
 * @param {Object[]} lignes  — premières lignes parsées (pour inspecter les valeurs)
 */
export function detecterFormat(headers, lignes) {
  // Si une colonne Date ou Praticien est détectable → format RDV
  const mappage = detecterMappage(headers)
  if (mappage.date || mappage.praticien) return 'rdv'

  // Si premier en-tête vide (export Doctolib statistiques) et colonnes numériques → stats
  const premierVide = !headers[0] || headers[0].trim() === ''
  if (premierVide && headers.length > 1) {
    if (lignes && lignes.length > 0) {
      const hasNumerique = headers.slice(1).some(h =>
        lignes.slice(0, 5).some(l => /^\d+$/.test((l[h] || '').trim()))
      )
      if (hasNumerique) return 'stats'
    }
    return 'stats' // structure cohérente même sans lignes inspectables
  }

  return 'rdv' // par défaut
}

/**
 * Tente de détecter automatiquement le mappage des colonnes à partir des en-têtes.
 * @param {string[]} headers — en-têtes du CSV
 * @returns {{ date, praticien, motif, statut, typeTeleconsult }} (certains peuvent être null)
 */
export function detecterMappage(headers) {
  const mappage = {}
  const headersLower = headers.map(h => h.trim().toLowerCase())

  for (const [champ, candidats] of Object.entries(CANDIDATS)) {
    let trouve = null
    for (const c of candidats) {
      const idx = headersLower.indexOf(c.toLowerCase())
      if (idx !== -1) { trouve = headers[idx]; break }
    }
    mappage[champ] = trouve
  }
  return mappage
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Valeurs de la colonne statut indiquant un RDV annulé / non honoré.
 * Ces lignes sont ignorées lors du comptage (sauf si une règle "ignorer" existe déjà).
 */
const STATUTS_IGNORES = [
  'annulé', 'annule', 'annulée', 'annulee',
  'non présenté', 'non presente', 'absent', 'no show',
  'reporté', 'reporte',
]

/**
 * Valeurs de la colonne type/mode indiquant une téléconsultation.
 */
const VALEURS_TELECONSULT = [
  'téléconsultation', 'teleconsultation', 'video', 'vidéo', 'visio',
  'en ligne', 'remote', 'distance',
]

function estAnnule(ligne, colStatut) {
  if (!colStatut) return false
  const val = (ligne[colStatut] || '').trim().toLowerCase()
  return STATUTS_IGNORES.some(s => val.includes(s))
}

function estTeleconsult(ligne, colType) {
  if (!colType) return false
  const val = (ligne[colType] || '').trim().toLowerCase()
  return VALEURS_TELECONSULT.some(s => val.includes(s))
}

/**
 * Parse une date en extrayant { annee, mois } (mois = 0-11).
 * Supporte JJ/MM/AAAA, AAAA-MM-JJ, AAAA/MM/JJ, JJ-MM-AAAA.
 */
function parseDate(str) {
  if (!str) return null
  str = str.trim()

  // JJ/MM/AAAA ou JJ-MM-AAAA
  let m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (m) return { annee: Number(m[3]), mois: Number(m[2]) - 1 }

  // AAAA-MM-JJ ou AAAA/MM/JJ
  m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return { annee: Number(m[1]), mois: Number(m[2]) - 1 }

  // Essai via Date native (en dernier recours)
  const d = new Date(str)
  if (!isNaN(d)) return { annee: d.getFullYear(), mois: d.getMonth() }

  return null
}

// ─── Analyse principale ───────────────────────────────────────────────────────

/**
 * Analyse le CSV et renvoie { agrege, fileAttente, apercu }.
 *
 * @param {string} texteCSV — contenu brut du fichier CSV
 * @param {Object} mappage  — { date, praticien, motif?, statut?, typeTeleconsult? }
 * @param {Array}  regles   — règles mémorisées [{ cle, action, specId?, pratId? }]
 */
export function analyserCSV(texteCSV, mappage, regles) {
  // Parsing papaparse — séparateur auto, header mode
  const parsed = Papa.parse(texteCSV, {
    header: true,
    skipEmptyLines: true,
    delimiter: '',   // '' = auto-détection
  })

  const lignes = parsed.data

  // Index des règles par clé normalisée (O(1), tolérant à l'orthographe)
  const regleParCle = {}
  for (const r of (regles || [])) regleParCle[normaliserCle(r.cle)] = r

  // Accumulateurs
  const agrege = {
    global:          {},  // { annee: { mois: count } }
    teleconsultations: {},
    praticiens:      {},  // { specId: { pratId: { annee: { mois: count } } } }
    specialites:     {},  // { specId: { annee: { mois: count } } }
  }

  // Clés inconnues : { cle → { count, exemples: ligne[] } }
  const inconnues = {}

  function incr(obj, annee, mois) {
    if (!obj[annee]) obj[annee] = {}
    obj[annee][mois] = (obj[annee][mois] || 0) + 1
  }

  for (const ligne of lignes) {
    // 1. Filtre statut (annulé / non honoré)
    if (estAnnule(ligne, mappage.statut)) continue

    // 2. Date
    const dateStr = mappage.date ? ligne[mappage.date] : null
    const date = parseDate(dateStr)
    if (!date) continue  // ligne sans date valide → on ignore

    const { annee, mois } = date

    // 3. Clé de classement : praticien (+ motif éventuel si besoin de désambiguïser)
    const valPrat = mappage.praticien ? (ligne[mappage.praticien] || '').trim() : ''
    const valMotif = mappage.motif ? (ligne[mappage.motif] || '').trim() : ''
    const cle = valPrat || valMotif || '(inconnu)'
    const cleNorm = normaliserCle(cle)

    // 4. Téléconsultation ?
    const isTele = estTeleconsult(ligne, mappage.typeTeleconsult)

    // 5. Appliquer la règle mémorisée — matching exact ou préfixe-nom
    const regle = trouverRegle(cleNorm, regleParCle)

    if (regle) {
      if (regle.action === 'ignorer') continue

      // Comptage global dans tous les cas
      incr(agrege.global, annee, mois)
      if (isTele) incr(agrege.teleconsultations, annee, mois)

      if (regle.action === 'praticien' && regle.specId && regle.pratId) {
        if (!agrege.praticiens[regle.specId]) agrege.praticiens[regle.specId] = {}
        if (!agrege.praticiens[regle.specId][regle.pratId]) agrege.praticiens[regle.specId][regle.pratId] = {}
        incr(agrege.praticiens[regle.specId][regle.pratId], annee, mois)
      } else if (regle.action === 'specialite' && regle.specId) {
        if (!agrege.specialites[regle.specId]) agrege.specialites[regle.specId] = {}
        incr(agrege.specialites[regle.specId], annee, mois)
      }
      // action === 'global' : déjà compté ci-dessus
    } else {
      // Clé inconnue — on regroupe par cleNorm, on conserve le libellé original d'origine
      if (!inconnues[cleNorm]) inconnues[cleNorm] = { cle, count: 0, exemples: [] }
      inconnues[cleNorm].count += 1
      if (inconnues[cleNorm].exemples.length < 3) inconnues[cleNorm].exemples.push({ annee, mois, isTele })
    }
  }

  // Construction de la file d'attente (on expose le libellé original, pas la cleNorm)
  const fileAttente = Object.entries(inconnues).map(([, info]) => ({
    cle: info.cle,
    count: info.count,
    exemples: info.exemples,
    actionSelectionnee: null,
  }))

  // Aperçu synthétique (mois × an triés)
  const apercu = construireApercu(agrege)

  return { agrege, fileAttente, apercu, erreursParsing: parsed.errors }
}

// ─── Analyse statistiques (format tableau croisé Doctolib) ───────────────────

/**
 * Analyse un export Doctolib « statistiques » (tableau croisé pivot).
 *
 * Format d'entrée :
 *   En-têtes : (vide) ; SARM-1 ; SARM-2 ; Cardiologie - CPA ; AKOME
 *   Lignes   : une ligne = un motif, cellules = comptages par agenda.
 *   Aucune colonne Date — la période est choisie par l'utilisateur.
 *
 * @param {string} texteCSV — contenu brut du fichier CSV
 * @param {Object} config   — { colonnesGardees: string[], mois: number (0-11), annee: number }
 * @param {Array}  regles   — règles mémorisées [{ cle, action, specId?, pratId? }]
 */
export function analyserStats(texteCSV, config, regles) {
  const { colonnesGardees, mois, annee } = config

  const parsed = Papa.parse(texteCSV, {
    header: true,
    skipEmptyLines: true,
    delimiter: ';',
  })

  const headers = parsed.meta.fields || []
  const colLibelle = headers[0] // première colonne = libellé du motif (peut être '' si vide)

  // Index des règles par clé normalisée
  const regleParCle = {}
  for (const r of (regles || [])) regleParCle[normaliserCle(r.cle)] = r

  const agrege = {
    global:            {},
    teleconsultations: {},
    praticiens:        {},
    specialites:       {},
  }
  const inconnues = {}

  // Ajoute `valeur` au mois/année sélectionné dans un sous-objet
  function ajouterA(obj, valeur) {
    if (!obj[annee]) obj[annee] = {}
    obj[annee][mois] = (obj[annee][mois] || 0) + valeur
  }

  // Regex d'extraction du nom du praticien depuis le libellé Doctolib
  // ex. « Consultation avec le Dr FEDKOVIC Yvan » → « FEDKOVIC Yvan »
  const RE_NOM  = /avec\s+(?:le\s+|l[''’]\s*|un\s+|la\s+)?(?:Dr|Pr|Docteur|Professeur)\.?\s+(.+)$/i
  const RE_NOM2 = /[-–]\s*(?:DR|PR|DOCTEUR|PROFESSEUR)\.?\s+(.+)$/i

  for (const ligne of parsed.data) {
    const libelle = (ligne[colLibelle] || '').trim()
    if (!libelle) continue

    // Somme des colonnes sélectionnées (ex. SARM-1 + SARM-2)
    let valeur = 0
    for (const col of colonnesGardees) {
      const raw = (ligne[col] || '0').trim().replace(/\s/g, '').replace(',', '.')
      const v = Number(raw)
      if (!isNaN(v)) valeur += v
    }
    if (valeur === 0) continue

    // Téléconsultation : détection par libellé → global + télé, pas de spécialité
    if (/vid[ée]o|t[ée]l[ée]consult/i.test(libelle)) {
      ajouterA(agrege.global, valeur)
      ajouterA(agrege.teleconsultations, valeur)
      continue
    }

    // Extraction du nom du praticien depuis le libellé
    let nomExtrait = null
    let mt = libelle.match(RE_NOM)
    if (!mt) mt = libelle.match(RE_NOM2)
    if (mt) {
      // Retrait des parenthèses de fin (ex. « (Créneau réservé…) », « (a été supprimé) »)
      nomExtrait = mt[1].replace(/\s*\(.*\)\s*$/, '').trim()
    }

    const cleRecherche = nomExtrait || libelle
    const cleNorm = normaliserCle(cleRecherche)

    const regle = trouverRegle(cleNorm, regleParCle)

    if (regle) {
      if (regle.action === 'ignorer') continue

      ajouterA(agrege.global, valeur)

      if (regle.action === 'teleconsult') {
        ajouterA(agrege.teleconsultations, valeur)
      } else if (regle.action === 'praticien' && regle.specId && regle.pratId) {
        if (!agrege.praticiens[regle.specId]) agrege.praticiens[regle.specId] = {}
        if (!agrege.praticiens[regle.specId][regle.pratId]) agrege.praticiens[regle.specId][regle.pratId] = {}
        ajouterA(agrege.praticiens[regle.specId][regle.pratId], valeur)
      } else if (regle.action === 'specialite' && regle.specId) {
        if (!agrege.specialites[regle.specId]) agrege.specialites[regle.specId] = {}
        ajouterA(agrege.specialites[regle.specId], valeur)
      }
      // action === 'global' : déjà compté ci-dessus
    } else {
      // Clé inconnue → file d'attente (count = nombre de consultations, pas de lignes)
      if (!inconnues[cleNorm]) inconnues[cleNorm] = { cle: cleRecherche, count: 0, exemples: [] }
      inconnues[cleNorm].count += valeur
      if (inconnues[cleNorm].exemples.length < 3) inconnues[cleNorm].exemples.push({ mois, annee })
    }
  }

  const fileAttente = Object.entries(inconnues).map(([, info]) => ({
    cle: info.cle,
    count: info.count,
    exemples: info.exemples,
    actionSelectionnee: null,
  }))

  const apercu = construireApercu(agrege)
  return { agrege, fileAttente, apercu, erreursParsing: parsed.errors }
}

/**
 * Relance analyserStats avec des règles supplémentaires (après classement manuel en mode stats).
 */
export function reanalyserStats(texteCSV, config, reglesExistantes, reglesNouvelles) {
  const toutesRegles = [...(reglesExistantes || []), ...(reglesNouvelles || [])]
  return analyserStats(texteCSV, config, toutesRegles)
}

// ─── Réanalyse (mode RDV) ─────────────────────────────────────────────────────

/**
 * Fusionne des résultats de classement (fileAttente avec actions choisies)
 * dans un agrégat existant.
 * Renvoie le nouvel agrégé et les nouvelles règles à mémoriser.
 *
 * @param {Object} agrege       — agrégat existant (de analyserCSV)
 * @param {string} texteCSV     — le même texte CSV brut
 * @param {Object} mappage      — même mappage
 * @param {Array}  reglesNouvelles — [{ cle, action, specId?, pratId? }]
 */
export function reanalyserAvecNouvellesRegles(texteCSV, mappage, reglesExistantes, reglesNouvelles) {
  const toutesRegles = [...(reglesExistantes || []), ...(reglesNouvelles || [])]
  return analyserCSV(texteCSV, mappage, toutesRegles, [])
}

// ─── Aperçu ───────────────────────────────────────────────────────────────────

function construireApercu(agrege) {
  const lignes = []
  const annees = new Set()
  const moisSet = new Set()

  for (const [annee, moisMap] of Object.entries(agrege.global)) {
    annees.add(Number(annee))
    for (const mois of Object.keys(moisMap)) moisSet.add(Number(mois))
  }

  const MOIS_COURT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

  for (const annee of [...annees].sort()) {
    for (const mois of [...moisSet].sort((a, b) => a - b)) {
      const total = (agrege.global[annee] || {})[mois] || 0
      const tele = (agrege.teleconsultations[annee] || {})[mois] || 0
      if (total === 0) continue
      lignes.push({ annee, mois, label: `${MOIS_COURT[mois]} ${annee}`, total, tele })
    }
  }

  return lignes
}
