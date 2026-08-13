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

const MOIS_COURT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

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

// ─── Agendas à compter (règle fixe) ──────────────────────────────────────────

/**
 * Détermine les agendas à inclure dans un export « statistiques ».
 *
 * **Ce n'est pas un choix, c'est la règle du cabinet** (CONSULTATIONS.md §2/§3) : le total dur =
 * `SARM-1` + `SARM-2`. Tout le reste (`AKOME`, `Cardiologie - CPA`…) est exclu — ces consultations
 * ne sont pas les nôtres. L'utilisateur n'a donc pas à cocher les colonnes à chaque import.
 *
 * Le test porte sur « SARM » et non sur les libellés exacts `SARM-1` / `SARM-2` : un éventuel
 * `SARM-3` (ou une variante d'écriture « SARM 1 ») serait à nous et doit être compté d'office.
 *
 * @param {string[]} colonnes — colonnes agenda du CSV (toutes sauf la 1ʳᵉ, qui porte le motif)
 * @returns {{ inclus: string[], exclus: string[] }}
 */
export function detecterAgendasSARM(colonnes) {
  const estSARM = c => normaliserCle(c).replace(/[\s-]/g, '').includes('SARM')
  return {
    inclus: (colonnes || []).filter(estSARM),
    exclus: (colonnes || []).filter(c => !estSARM(c)),
  }
}

/**
 * Libellés d'AGRÉGAT (« Total », « Totaux », « Somme »…) — lignes ou colonnes de synthèse ajoutées
 * par l'export, qui valent la somme de toutes les autres.
 *
 * Elles doivent être écartées AVANT tout classement : traitées comme un motif ordinaire, elles
 * comptent une seconde fois l'intégralité du fichier (total ≈ ×2). Le danger est réel car une clé
 * inconnue BLOQUE la validation tant qu'on ne lui a pas donné une cible — le réflexe est alors de
 * la classer en « Global / autre », ce qui double les chiffres du mois.
 *
 * Comparaison sur la clé normalisée entière (pas un `includes`) pour ne pas avaler un vrai motif
 * qui contiendrait le mot.
 */
const LIBELLES_TOTAL = new Set([
  'TOTAL', 'TOTAUX', 'TOTAL GENERAL', 'TOTAL GLOBAL', 'SOMME', 'CUMUL', 'ENSEMBLE', 'TOUS',
])

function estLibelleTotal(libelle) {
  return LIBELLES_TOTAL.has(normaliserCle(libelle))
}

/** Lit une cellule de comptage Doctolib (« 1 234 », « 12,5 », vide…) → nombre, 0 si illisible. */
function nombreCellule(raw) {
  const v = Number(String(raw ?? '0').trim().replace(/\s/g, '').replace(',', '.'))
  return isNaN(v) ? 0 : v
}

/**
 * Ramène un tableau croisé Doctolib à une liste `{ libelle: motif, valeur: total SARM }`,
 * quelle que soit son ORIENTATION — Doctolib exporte les deux :
 *
 *   • `agendas-colonnes` — en-têtes = agendas (`SARM-1`, `SARM-2`, `AKOME`…), 1 ligne = 1 motif.
 *     Valeur d'un motif = somme de ses cellules sur les colonnes SARM.
 *
 *   • `agendas-lignes`   — 1ʳᵉ colonne = agendas (`SARM-1`, `Cardiologie - CPA`, `SARM-2`, `AKOME`),
 *     en-têtes = motifs. Valeur d'un motif = somme de sa colonne sur les seules lignes SARM.
 *     Les lignes `AKOME` / `Cardiologie - CPA` sont ignorées en bloc.
 *
 * L'orientation est déduite de l'endroit où se trouvent les libellés d'agenda : si un en-tête
 * ressemble à un agenda SARM → colonnes, sinon → lignes. Dans les deux cas la sélection est
 * automatique (règle du cabinet) ; `agendasGardes` ne sert qu'à forcer un cas non détecté.
 *
 * @returns {{ entrees: Array<{libelle, valeur}>, orientation: string, inclus: string[], exclus: string[] }}
 */
function extraireEntreesStats(parsed, agendasGardes) {
  const headers = parsed.meta.fields || []
  const colLibelle = headers[0]
  const colonnes = headers.slice(1).filter(h => h != null && String(h).trim() !== '')
  const force = agendasGardes?.length ? agendasGardes : null

  // ── Orientation A : agendas en colonnes ──
  const parColonnes = detecterAgendasSARM(colonnes)
  if (parColonnes.inclus.length > 0 || (force && force.some(a => colonnes.includes(a)))) {
    const inclus = force || parColonnes.inclus
    return {
      orientation: 'agendas-colonnes',
      inclus,
      exclus: colonnes.filter(c => !inclus.includes(c)),
      entrees: parsed.data
        .map(ligne => ({
          libelle: (ligne[colLibelle] || '').trim(),
          valeur: inclus.reduce((a, c) => a + nombreCellule(ligne[c]), 0),
        }))
        .filter(e => !estLibelleTotal(e.libelle)),
    }
  }

  // ── Orientation B : agendas en lignes (1ʳᵉ colonne), motifs en en-têtes ──
  const nomsLignes = parsed.data.map(l => (l[colLibelle] || '').trim()).filter(Boolean)
  const parLignes = detecterAgendasSARM(nomsLignes)
  const inclus = force || parLignes.inclus
  const lignesSARM = parsed.data.filter(l => inclus.includes((l[colLibelle] || '').trim()))

  return {
    orientation: 'agendas-lignes',
    inclus,
    exclus: nomsLignes.filter(n => !inclus.includes(n)),
    entrees: colonnes
      .filter(col => !estLibelleTotal(col))
      .map(col => ({
        libelle: String(col).trim(),
        valeur: lignesSARM.reduce((a, l) => a + nombreCellule(l[col]), 0),
      })),
  }
}

/**
 * Inspecte un export « statistiques » sans le classer : sert à AFFICHER, dès le dépôt du fichier,
 * quels agendas seront comptés et lesquels seront écartés. Aucune saisie n'est demandée.
 *
 * @returns {{ orientation: string, inclus: string[], exclus: string[] }}
 */
export function analyserEnTeteStats(texteCSV) {
  const parsed = Papa.parse(texteCSV, { header: true, skipEmptyLines: true, delimiter: ';' })
  const { orientation, inclus, exclus } = extraireEntreesStats(parsed, null)
  return { orientation, inclus, exclus }
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
 * @param {Object} config   — { mois: number (0-11), annee: number, agendasGardes?: string[] }
 *                            `agendasGardes` : override manuel, normalement inutile (règle SARM auto).
 * @param {Array}  regles   — règles mémorisées [{ cle, action, specId?, pratId? }]
 */
export function analyserStats(texteCSV, config, regles) {
  const { agendasGardes, mois, annee } = config

  const parsed = Papa.parse(texteCSV, {
    header: true,
    skipEmptyLines: true,
    delimiter: ';',
  })

  // Normalisation des deux orientations possibles en une liste { libelle: motif, valeur: total SARM }.
  // Les agendas non-SARM (AKOME, Cardiologie - CPA) sont écartés ici, une bonne fois.
  const { entrees, orientation, inclus, exclus } = extraireEntreesStats(parsed, agendasGardes)

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

  for (const { libelle, valeur } of entrees) {
    if (!libelle || valeur === 0) continue

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
  // orientation / inclus / exclus remontent jusqu'à l'aperçu : l'utilisateur doit pouvoir vérifier
  // d'un coup d'œil que ce sont bien les agendas SARM qui ont été comptés.
  return { agrege, fileAttente, apercu, erreursParsing: parsed.errors, orientation, inclus, exclus }
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

// ─── Aperçu détaillé (comparaison avec les données déjà en base) ──────────────

/** Lit une valeur { [annee]: number[12] } sans planter si l'année/le mois manque. */
const lireSerie = (serieParAnnee, annee, mois) =>
  ((serieParAnnee || {})[annee] || [])[mois] || 0

/**
 * Construit l'aperçu complet d'un import : récap mensuel comparé à l'existant,
 * ventilation par spécialité / praticien, et contrôle de cohérence.
 *
 * `appliquerImport()` **remplace** la valeur du mois (il n'additionne pas) : l'aperçu
 * affiche donc « actuel → import », et signale les lignes qui ne sont PAS dans l'import
 * et qui conserveront donc leur valeur actuelle (source classique d'incompréhension).
 *
 * @param {Object} agrege — sortie de analyserCSV() / analyserStats()
 * @param {Object} store  — store courant { global, teleconsultations, specialites }
 * @returns {{
 *   mois: Array, groupes: Array, totalImport: number, totalActuel: number,
 *   teleImport: number, ventileImport: number, nonVentile: number, remplacements: number
 * }}
 */
export function construireDetailImport(agrege, store) {
  const specialites = store?.specialites || []

  // ── Couples (année, mois) réellement touchés par l'import ──
  const clesMois = []
  for (const [annee, moisMap] of Object.entries(agrege.global || {})) {
    for (const [mois, val] of Object.entries(moisMap)) {
      if (val) clesMois.push({ annee: Number(annee), mois: Number(mois) })
    }
  }
  clesMois.sort((a, b) => a.annee - b.annee || a.mois - b.mois)

  // ── Récap mensuel : ce qu'il y a déjà vs ce qui sera écrit ──
  const mois = clesMois.map(({ annee, mois: m }) => ({
    annee,
    mois: m,
    label: `${MOIS_COURT[m]} ${annee}`,
    total: (agrege.global[annee] || {})[m] || 0,
    tele: (agrege.teleconsultations[annee] || {})[m] || 0,
    ancienTotal: lireSerie(store?.global, annee, m),
    ancienTele: lireSerie(store?.teleconsultations, annee, m),
  }))

  // Somme, sur les seuls mois importés, d'une série de l'agrégat ({ annee: { mois: val } })
  const sommeAgrege = (obj) =>
    clesMois.reduce((acc, { annee, mois: m }) => acc + ((obj?.[annee] || {})[m] || 0), 0)

  // Idem sur une série du store ({ annee: number[12] })
  const sommeStore = (serie) =>
    clesMois.reduce((acc, { annee, mois: m }) => acc + lireSerie(serie, annee, m), 0)

  // ── Ventilation par spécialité (praticiens + bucket « non attribué ») ──
  const groupes = []
  let ventileImport = 0

  for (const spec of specialites) {
    const lignes = []

    for (const prat of spec.praticiens || []) {
      const brut = agrege.praticiens?.[spec.id]?.[prat.id]
      const importe = brut ? sommeAgrege(brut) : null   // null = absent de l'import
      const actuel = sommeStore(prat.valeurs)
      if (importe === null && actuel === 0) continue     // ni avant ni après → on n'affiche pas
      if (importe !== null) ventileImport += importe
      lignes.push({ id: prat.id, nom: prat.nom, importe, actuel, masque: !!prat.masque })
    }

    // Bucket « non attribué » de la spécialité (spec.valeurs)
    const brutSpec = agrege.specialites?.[spec.id]
    const importeSpec = brutSpec ? sommeAgrege(brutSpec) : null
    const actuelSpec = sommeStore(spec.valeurs)
    if (importeSpec !== null || actuelSpec > 0) {
      if (importeSpec !== null) ventileImport += importeSpec
      lignes.push({
        id: `__spec-${spec.id}`,
        nom: spec.praticiens ? 'Non attribué' : spec.nom,
        importe: importeSpec,
        actuel: actuelSpec,
        nonAttribue: true,
      })
    }

    if (lignes.length === 0) continue
    groupes.push({
      id: spec.id,
      nom: spec.nom,
      couleur: spec.couleur,
      lignes,
      importe: lignes.reduce((a, l) => a + (l.importe || 0), 0),
      actuel: lignes.reduce((a, l) => a + l.actuel, 0),
    })
  }

  const totalImport = sommeAgrege(agrege.global)
  const totalActuel = sommeStore(store?.global)
  const teleImport = sommeAgrege(agrege.teleconsultations)

  return {
    mois,
    groupes,
    totalImport,
    totalActuel,
    teleImport,
    teleActuel: sommeStore(store?.teleconsultations),
    ventileImport,
    // Reste : lignes classées « Global / autre » — comptées dans le total, sans détail.
    nonVentile: totalImport - teleImport - ventileImport,
    // Nombre de mois déjà remplis qui vont être écrasés
    remplacements: mois.filter(m => m.ancienTotal > 0).length,
  }
}
