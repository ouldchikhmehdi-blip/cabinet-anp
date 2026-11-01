// ============================================================
// facturationMoteur.js — lecture des justificatifs d'honoraires de la clinique
// (FAC = facturé dans le mois, RED = réglé dans le mois) et recoupement du
// chirurgien par numéro de séjour. Module pur, sans dépendance : testable avec
// des lignes inventées (compta/facturationMoteur.test.js).
//
// Les fichiers portent des noms de patients : ce module tourne sur le mini PC
// (compta/facturation.js) et ne produit, pour la base, que des agrégats. Les
// champs nom/prénom ne servent qu'au classeur local des lignes mises de côté.
// ============================================================

// Anesthésistes du groupe et remplaçants : quand `med0` est l'un d'eux, le séjour
// n'a pas de chirurgien (réa, visites, consultations), on ne l'attribue pas.
export const ANESTHESISTES = [
  'ABBAL', 'HATTERER', 'FEDIDE', 'DONNETTE', 'OULD-CHIKH', 'OULD CHIKH', 'PARNEIX', 'CHOUKHI', 'COISEL',
  'DELBERT', 'CHOUAIKHI', 'PENSIER', 'PENNE', 'FERNANDES', 'HAMMANI',
]

export const BUCKETS = {
  consultations: '__consultations',   // consultation ou avis (code CS…, séjour externe X…)
  reanimation: '__reanimation',       // actes de réanimation / soins intensifs et dialyses, quel que soit le séjour
  sejourInconnu: '__sejour_inconnu',   // séjour absent des exports d'actes (ex. acte de l'année précédente)
  aArbitrer: '__a_arbitrer',           // plusieurs chirurgiens sur le séjour
}
// Total d'une spécialité sans praticien identifié : `__spec_<id spécialité>` (ex. YYYY400 dont seul
// le type d'opérateur, gastro ou viscéral, est connu)
export const bucketSpecialite = (spec) => `__spec_${spec}`
export const estBucket = (cle) => typeof cle === 'string' && cle.startsWith('__')

export const CODES_CONSULTATION = /^(CS|MCS|MPC|APC|CSCPA|MCSCPA|APCCPA|MPCCPA|MPCMCS)$/i
// Réanimation / USC (décision drmoc, 2026-10-31) : YYYY015 et YYYY020 = actes de réanimation et de
// soins intensifs ; YYYY108 = surveillance postopératoire de chirurgie cardiaque avec CEC ; JVJ… = épuration extrarénale (dialyse) cotée en réanimation. Comptés à part, pas
// sur le chirurgien du séjour.
export const CODES_REANIMATION = /^(YYYY015|YYYY020|YYYY108|JVJ[A-Z]\d{3})$/i

const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const propre = (s) => sansAccents(s).replace(/\s+/g, ' ').trim()

/** « VERCAMBRE AUFORT », « Lucile » → « VERCAMBRE AUFORT Lucile » (clé stable d'un chirurgien). */
export function normaliserChirurgien(nom, prenom = '') {
  const n = propre(nom).toUpperCase()
  if (!n) return ''
  const p = propre(prenom)
  const pTitre = p ? p.toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase()) : ''
  return pTitre ? `${n} ${pTitre}` : n
}

/** Nom de famille (clé de rapprochement avec les praticiens de Consultations). */
export const nomFamille = (chirurgien) => String(chirurgien || '').split(' ').filter(m => m.length > 1 && m === m.toUpperCase()).join(' ')

export const estAnesthesiste = (nom) => ANESTHESISTES.includes(propre(nom).toUpperCase())

/**
 * « sdf.anest.mill@gmail.com&OULD010&MIL&RED(1).xlsx » → { associe, etablissement, type }.
 * null pour tout autre fichier.
 */
export function nomFichier(nom) {
  const m = /&([A-Z]{4}\d{3})&([A-Z]{3})&(FAC|RED)(?:\s*\(\d+\))?\.xlsx?$/i.exec(String(nom || ''))
  if (!m) return null
  return { associe: m[1].toUpperCase(), etablissement: m[2].toUpperCase(), type: m[3].toUpperCase() }
}

// Cellule date : Date, numéro de série Excel, ou « jj/mm/aaaa » → 'AAAA-MM-JJ' (sinon '')
export function versDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // La lecture Excel rend les dates 21 s trop tôt (minuit → 23:59:39 la veille, 12:30 → 12:29:39) :
    // on ajoute 30 s avant de lire le jour en heure locale.
    const d = new Date(v.getTime() + 30 * 1000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return d.toISOString().slice(0, 10)
  }
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(v ?? '').trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

const nombre = (v) => {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const arrondi = (v) => Math.round(v * 100) / 100

const COLONNES = {
  FAC: {
    sejour: 'N° Dossier', nom: 'Nom', prenom: 'Prénom', code: 'Code Acte', dateActe: 'Date Acte', date: 'Date Facture', entree: 'Date Entrée', sortie: 'Date Sortie', coef: 'Coef',
    montants: { dh: 'Mt DH', amo: 'Mt AMO', amc: 'Mt AMC', pat: 'Mt Pat', total: 'Mt Total' },
  },
  RED: {
    sejour: 'N° Dossier', nom: 'Nom', prenom: 'Prénom', code: 'CCAM', dateActe: 'Date Acte', date: 'Date Régl.',
    montants: { conv: 'Base Conv', dh: 'Base DH', redevHt: 'Redev. HT', tva: 'TVA', redevTtc: 'Redev. TTC' },
  },
}

/**
 * Lit la feuille d'un justificatif (tableau de lignes, cellules brutes) :
 * { type, annee, mois, associe, lignes, total, nbLignes }.
 * - l'en-tête est la ligne qui commence par « N° Dossier » (FAC) ou « N° Fac Red. » (RED) ;
 * - la période « Du jj/mm/aaaa au jj/mm/aaaa » et le code associé (AAAA000) sont cherchés au-dessus ;
 * - la ligne « Total » au-dessus de l'en-tête sert de contrôle : chaque colonne de montant doit
 *   recoller à la somme des lignes à 0,05 € près, sinon erreur (rien n'est agrégé sur un fichier douteux).
 */
export function lireJustificatif(rows, { type: typeAttendu } = {}) {
  const iEntete = rows.findIndex(r => r && /^N° ?(Dossier|Fac\.? ?Red\.?)$/i.test(String(r[0] ?? '').trim()))
  if (iEntete < 0) throw new Error('En-tête introuvable (ni « N° Dossier » ni « N° Fac Red. »)')
  const entete = rows[iEntete].map(c => propre(c))
  const type = /Fac/i.test(String(rows[iEntete][0])) ? 'RED' : 'FAC'
  if (typeAttendu && typeAttendu !== type) throw new Error(`Fichier ${typeAttendu} attendu, contenu ${type}`)
  const col = COLONNES[type]
  const idx = (nom) => entete.findIndex(c => c.toLowerCase() === propre(nom).toLowerCase())
  const iSejour = idx(col.sejour), iNom = idx(col.nom), iPrenom = idx(col.prenom), iCode = idx(col.code), iDateActe = idx(col.dateActe), iDate = idx(col.date)
  const iEntree = col.entree ? idx(col.entree) : -1, iSortie = col.sortie ? idx(col.sortie) : -1, iCoef = col.coef ? idx(col.coef) : -1
  const iMontants = Object.fromEntries(Object.entries(col.montants).map(([k, nom]) => [k, idx(nom)]))
  const manquantes = [[col.sejour, iSejour], [col.code, iCode], [col.date, iDate], ...Object.entries(col.montants).map(([k, nom]) => [nom, iMontants[k]])].filter(([, i]) => i < 0).map(([n]) => n)
  if (manquantes.length) throw new Error(`Colonnes manquantes : ${manquantes.join(', ')}`)

  let annee = null, mois = null, associe = ''
  for (const r of rows.slice(0, iEntete)) {
    for (const c of r || []) {
      const s = String(c ?? '').trim()
      const p = /^Du (\d{2})\/(\d{2})\/(\d{4}) au/.exec(s)
      if (p) { annee = Number(p[3]); mois = Number(p[2]) }
      if (/^[A-Z]{4}\d{3}$/.test(s)) associe = s
    }
  }
  if (!annee) throw new Error('Période « Du jj/mm/aaaa au … » introuvable')

  const lignes = []
  for (const r of rows.slice(iEntete + 1)) {
    if (!r) continue
    const sejour = String(r[iSejour] ?? '').trim()
    const montants = Object.fromEntries(Object.entries(iMontants).map(([k, i]) => [k, nombre(r[i])]))
    const vide = !sejour && String(r[iNom] ?? '').trim() === '' && Object.values(montants).every(v => v === 0)
    if (vide) continue
    lignes.push({
      sejour, nom: String(r[iNom] ?? '').trim(), prenom: String(r[iPrenom] ?? '').trim(),
      code: String(r[iCode] ?? '').trim().toUpperCase(), dateActe: versDate(r[iDateActe]), date: versDate(r[iDate]), ...montants,
      ...(type === 'FAC' ? { entree: iEntree >= 0 ? versDate(r[iEntree]) : '', sortie: iSortie >= 0 ? versDate(r[iSortie]) : '', coef: iCoef >= 0 ? String(r[iCoef] ?? '').trim() : '' } : {}),
      ligne: lignes.length + 1,
    })
  }

  // Contrôle : ligne « Total » (au-dessus de l'en-tête) = somme des lignes, colonne par colonne
  const iTotal = rows.slice(0, iEntete).findIndex(r => (r || []).some(c => String(c ?? '').trim() === 'Total'))
  const total = {}
  for (const [k, i] of Object.entries(iMontants)) {
    const somme = arrondi(lignes.reduce((s, l) => s + l[k], 0))
    total[k] = somme
    if (iTotal >= 0) {
      const attendu = nombre(rows[iTotal][i])
      if (Math.abs(attendu - somme) > 0.05) throw new Error(`Colonne « ${col.montants[k]} » : somme des lignes ${somme} ≠ total du fichier ${arrondi(attendu)}`)
    }
  }
  return { type, annee, mois, associe, lignes, total, nbLignes: lignes.length }
}

/**
 * Index séjour → chirurgiens, depuis les exports d'actes des associés :
 * `actes` = [{ sejour, nom, prenom }] (colonnes sejo.sejo_num_sej, med0.mede_nom_usu, med0.mede_prenom).
 * Les anesthésistes ne sont pas des chirurgiens ; un séjour qui n'a qu'eux est « sans chirurgien ».
 */
export function indexerSejours(actes) {
  const index = new Map()
  for (const a of actes) {
    const sejour = String(a.sejour ?? '').trim()
    if (!sejour) continue
    if (!index.has(sejour)) index.set(sejour, new Set())
    const nom = propre(a.nom)
    if (!nom || estAnesthesiste(nom)) continue
    index.get(sejour).add(normaliserChirurgien(nom, a.prenom))
  }
  return index
}

/** Lignes des exports d'actes (cellules brutes, en-tête en ligne 0) → [{ sejour, nom, prenom }]. */
export function lireActes(rows) {
  const h = (rows[0] || []).map(c => String(c ?? '').trim())
  const iS = h.indexOf('sejo.sejo_num_sej'), iN = h.indexOf('med0.mede_nom_usu'), iP = h.indexOf('med0.mede_prenom')
  const iPN = h.indexOf('pati.pati_nom_usu'), iPP = h.indexOf('pati.pati_prenom')
  if (iS < 0 || iN < 0) return []
  return rows.slice(1).filter(r => r && r[iS] != null).map(r => ({
    sejour: r[iS], nom: r[iN], prenom: iP >= 0 ? r[iP] : '',
    patientNom: iPN >= 0 ? r[iPN] : '', patientPrenom: iPP >= 0 ? r[iPP] : '',
  }))
}

// ---- Rattachement par la consultation d'anesthésie (CPA) quand le séjour n'est pas dans les exports ----
//
// L'export Diane des CPA (feuille « Résultats ») donne, pour chaque patient vu en consultation, le
// chirurgien prévu et la date de bloc, mais pas le numéro de séjour. Une ligne facturée est rattachée
// quand une CPA a le même nom (ou nom marital), un prénom compatible et une date de bloc comprise dans
// le séjour (entrée − 1 j → sortie + 1 j). Plusieurs chirurgiens possibles → « À arbitrer ».

const motsNom = (s) => sansAccents(s).toUpperCase().replace(/[-_'.]/g, ' ').split(/\s+/).filter(Boolean)
const MOTS_IGNORES = new Set(['DR', 'DOCTEUR', 'PR'])

/** Lignes de l'export CPA (en-tête en ligne 0) → [{ nom, nomMarital, prenom, dateBloc, chirurgien }]. [] si ce n'en est pas un. */
export function lireCpa(rows) {
  const h = (rows[0] || []).map(c => String(c ?? '').trim().toLowerCase())
  const i = (n) => h.indexOf(n)
  const iN = i('nom'), iM = i('nom marital'), iP = i('prénom'), iB = i('date bloc'), iC = i('chirurgien')
  if (iN < 0 || iP < 0 || iB < 0 || iC < 0) return []
  return rows.slice(1).filter(r => r && r[iN]).map(r => ({
    nom: String(r[iN] ?? '').trim(), nomMarital: iM >= 0 ? String(r[iM] ?? '').trim() : '', prenom: String(r[iP] ?? '').trim(),
    dateBloc: versDate(r[iB]), chirurgien: String(r[iC] ?? '').trim(),
  }))
}

/**
 * Annuaire des chirurgiens : nom de famille (mots en majuscules) → prénoms connus → clé canonique.
 * Sources, par priorité : `med0` des exports d'actes (`{ nom, prenom }`), puis les noms bien écrits
 * de la CPA (« NOM Prénom »), puis les noms tout en majuscules à 2 mots ou plus (« NOM PRENOM »).
 * Deux prénoms qui commencent par les 3 mêmes lettres sont la même personne (Franz / Frantz).
 */
export function construireAnnuaire(med0 = [], brutsCpa = []) {
  const familles = new Map() // 'MEYER BISCH' → [{ prenom: 'VINCENT', cle }]
  const enregistrer = (motsFamille, prenom, cle) => {
    if (!motsFamille.length) return
    const f = motsFamille.join(' ')
    if (ANESTHESISTES.some(a => motsNom(a).join(' ') === f)) return
    const liste = familles.get(f) || familles.set(f, []).get(f)
    const p = motsNom(prenom)[0] || ''
    if (liste.some(x => x.prenom.slice(0, 3) === p.slice(0, 3))) return
    liste.push({ prenom: p, cle })
  }
  for (const { nom, prenom } of med0) if (nom) enregistrer(motsNom(nom), prenom, normaliserChirurgien(nom, prenom))
  const restes = []
  for (const brut of new Set(brutsCpa)) {
    const b = String(brut).replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
    const m = /^(.*?[A-ZÀ-Ý]{2,})\s+([A-ZÀ-Ý][a-zà-ÿ].*)$/.exec(b)
    if (m && m[1] === m[1].toUpperCase()) enregistrer(motsNom(m[1]).filter(w => !MOTS_IGNORES.has(w)), m[2], normaliserChirurgien(m[1], m[2]))
    else restes.push(b)
  }
  // « NOM PRENOM » tout en majuscules, nom de famille inconnu : le dernier mot est le prénom
  for (const b of restes) {
    const mots = motsNom(b).filter(w => !MOTS_IGNORES.has(w))
    if (mots.length < 2 || mots.at(-1).length < 2 || b !== b.toUpperCase() || /\bOU\b/.test(b)) continue
    if (trouverFamilles(familles, mots).length) continue
    enregistrer(mots.slice(0, -1), mots.at(-1), normaliserChirurgien(mots.slice(0, -1).join(' '), mots.at(-1)))
  }
  return familles
}

// Familles de l'annuaire présentes dans une suite de mots (les plus longues d'abord, sans chevauchement)
function trouverFamilles(familles, mots) {
  const trouvees = []
  const pris = new Set()
  const cles = [...familles.keys()].sort((a, b) => b.split(' ').length - a.split(' ').length)
  for (const f of cles) {
    const fm = f.split(' ')
    for (let i = 0; i + fm.length <= mots.length; i++) {
      if (fm.every((w, k) => mots[i + k] === w) && fm.every((_, k) => !pris.has(i + k))) {
        fm.forEach((_, k) => pris.add(i + k)); trouvees.push({ famille: f, debut: i, fin: i + fm.length })
      }
    }
  }
  return trouvees
}

/**
 * Nom de chirurgien saisi librement dans la CPA → clé canonique, ou « ?<texte> » quand il est
 * illisible (vide, inconnu, deux noms, prénom qui ne départage pas deux homonymes).
 */
export function resoudreChirurgien(brut, annuaire) {
  const texte = String(brut ?? '').trim()
  const mots = motsNom(texte).filter(w => !MOTS_IGNORES.has(w))
  if (!mots.length) return '?'
  const trouvees = trouverFamilles(annuaire, mots)
  if (trouvees.length !== 1) return '?' + texte
  const { famille, debut, fin } = trouvees[0]
  const prenoms = annuaire.get(famille)
  const autres = [...mots.slice(0, debut), ...mots.slice(fin)]
  if (!autres.length) return prenoms.length === 1 ? prenoms[0].cle : '?' + texte
  const p = autres[0]
  const ok = prenoms.filter(x => (p.length < 3 ? x.prenom.startsWith(p) : x.prenom.slice(0, 3) === p.slice(0, 3)))
  if (ok.length === 1) return ok[0].cle
  if (prenoms.length === 1 && p.length > 1) return prenoms[0].cle // prénom mal orthographié, un seul porteur du nom
  return '?' + texte
}

const FAMILLES_ANESTH = ANESTHESISTES.map(a => motsNom(a))
const nommeAnesthesiste = (brut) => {
  const mots = motsNom(brut)
  return FAMILLES_ANESTH.some(f => f.every(w => mots.includes(w)))
}

const decaler = (jour, n) => {
  const d = new Date(jour + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const prenomsCompatibles = (a, b) => {
  const x = motsNom(a), y = motsNom(b)
  return x.length > 0 && y.length > 0 && (x[0] === y[0] || y.includes(x[0]) || x.includes(y[0]))
}

/**
 * Complète l'index séjour → chirurgiens avec la CPA, pour les séjours absents des exports d'actes.
 * `lignesFac` = lignes FAC (sejour, nom, prenom, entree, sortie, dateActe, code). Renvoie
 * { index (nouveau Map), viaCpa: Set des séjours rattachés par la CPA }.
 */
export function completerParCpa(index, lignesFac, cpas, annuaire) {
  const parNom = new Map()
  for (const c of cpas) {
    if (!c.dateBloc) continue
    for (const n of new Set([motsNom(c.nom).join(' '), motsNom(c.nomMarital).join(' ')].filter(Boolean))) {
      (parNom.get(n) || parNom.set(n, []).get(n)).push(c)
    }
  }
  // Un séjour = un patient et une fenêtre de dates (toutes ses lignes)
  const sejours = new Map()
  for (const l of lignesFac) {
    if (!l.sejour || index.has(l.sejour) || CODES_CONSULTATION.test(l.code) || CODES_REANIMATION.test(l.code) || /^X/i.test(l.sejour)) continue
    const debut = l.entree || l.dateActe, fin = l.sortie || l.dateActe
    const s = sejours.get(l.sejour)
    if (!s) sejours.set(l.sejour, { nom: l.nom, prenom: l.prenom, debut, fin })
    else { if (debut && (!s.debut || debut < s.debut)) s.debut = debut; if (fin && fin > s.fin) s.fin = fin }
  }
  const nouvel = new Map(index), viaCpa = new Set()
  for (const [sejour, s] of sejours) {
    if (!s.debut) continue
    const de = decaler(s.debut, -1), a = decaler(s.fin || s.debut, 1)
    const cands = (parNom.get(motsNom(s.nom).join(' ')) || []).filter(c => prenomsCompatibles(s.prenom, c.prenom) && c.dateBloc >= de && c.dateBloc <= a)
    if (!cands.length) continue
    // Un anesthésiste inscrit comme « chirurgien » (endoscopie sans opérateur…) : pas de chirurgien
    const chirs = new Set(cands.filter(c => !nommeAnesthesiste(c.chirurgien)).map(c => resoudreChirurgien(c.chirurgien, annuaire)))
    nouvel.set(sejour, chirs)
    viaCpa.add(sejour)
  }
  return { index: nouvel, viaCpa }
}

// ---- YYYY400 : supplément pour opacification peropératoire des voies biliopancréatiques ----
//
// Il suit soit une endoscopie biliopancréatique (CPRE : gastro-entérologue), soit une chirurgie
// biliaire (cholécystectomie… : chirurgien viscéral) — décision drmoc du 2026-10-31. Quand le séjour
// ne donne pas un gastro ou un viscéral, l'acte du même jour dans le même séjour donne la spécialité,
// et les autres séjours et CPA du même patient donnent la personne s'il n'y en a qu'une de cette
// spécialité. Sinon : total de la spécialité, sans praticien (`__spec_…`, mis de côté).
export const CODE_OPACIFICATION_BILIAIRE = /^YYYY400$/i
const ACTE_BILIAIRE_ENDOSCOPIQUE = /^H[MN][A-Z][EJ]\d{3}$/i // CPRE, sphinctérotomie, prothèse…
const ACTE_BILIAIRE_CHIRURGICAL = /^H[LMN][A-Z][AC]\d{3}$/i // cholécystectomie, chirurgie hépatobiliaire ou pancréatique
const SPECIALITES_BILIAIRES = { endoscopique: 'endoscopie', chirurgical: 'viscerale' }

/**
 * Patient (nom, prénom) → chirurgiens qui l'ont pris en charge ailleurs : séjours des exports d'actes
 * et chirurgien prévu des CPA, anesthésistes et noms illisibles exclus.
 */
export function historiquePatients(actes, cpas, annuaire) {
  const parNom = new Map()
  const noter = (nom, prenom, cle) => {
    const n = motsNom(nom).join(' ')
    if (!n || !cle || cle.startsWith('?')) return
    if (!parNom.has(n)) parNom.set(n, [])
    parNom.get(n).push({ prenom, cle })
  }
  for (const a of actes) {
    const nom = propre(a.nom)
    if (nom && !estAnesthesiste(nom)) noter(a.patientNom, a.patientPrenom, normaliserChirurgien(nom, a.prenom))
  }
  for (const c of cpas) {
    if (nommeAnesthesiste(c.chirurgien)) continue
    const cle = resoudreChirurgien(c.chirurgien, annuaire)
    for (const n of new Set([c.nom, c.nomMarital].filter(Boolean))) noter(n, c.prenom, cle)
  }
  return {
    chirurgiensDe(nom, prenom) {
      return new Set((parNom.get(motsNom(nom).join(' ')) || []).filter(x => prenomsCompatibles(prenom, x.prenom)).map(x => x.cle))
    },
  }
}

/** Type de l'acte biliaire facturé le même jour dans le même séjour : 'endoscopique', 'chirurgical' ou null (aucun ou les deux). */
export function typeActeBiliaire(ligne, lignesDuSejour) {
  const codes = lignesDuSejour.filter(x => x !== ligne && x.dateActe === ligne.dateActe).map(x => x.code)
  const endo = codes.some(c => ACTE_BILIAIRE_ENDOSCOPIQUE.test(c)), chir = codes.some(c => ACTE_BILIAIRE_CHIRURGICAL.test(c))
  return endo === chir ? null : (endo ? 'endoscopique' : 'chirurgical')
}

/**
 * Rattachement d'une ligne YYYY400 dont le séjour ne donne ni un gastro ni un viscéral. `specDe(cle)`
 * = spécialité d'un chirurgien (null s'il n'est pas classé). Renvoie { cle, motif } ou null (rien à changer).
 */
export function rattacherOpacificationBiliaire(ligne, base, { lignesDuSejour, historique, specDe }) {
  if (!CODE_OPACIFICATION_BILIAIRE.test(ligne.code)) return null
  const specBase = estBucket(base.cle) ? undefined : specDe(base.cle)
  // Déjà sur un gastro ou un viscéral, ou sur un chirurgien pas encore classé : on garde
  if (specBase === null || Object.values(SPECIALITES_BILIAIRES).includes(specBase)) return null
  const type = typeActeBiliaire(ligne, lignesDuSejour)
  if (!type) return null
  const spec = SPECIALITES_BILIAIRES[type]
  const cands = [...(historique?.chirurgiensDe(ligne.nom, ligne.prenom) || [])].filter(c => specDe(c) === spec)
  if (cands.length === 1) return { cle: cands[0], motif: `YYYY400 (acte ${type}) : seul ${spec === 'endoscopie' ? 'gastro' : 'viscéral'} du patient dans les autres séjours ou CPA` }
  return { cle: bucketSpecialite(spec), motif: `YYYY400 (acte ${type}) : ${cands.length ? 'plusieurs praticiens possibles' : 'praticien non identifié'}, compté dans la spécialité` }
}

/** À qui va une ligne facturée : { cle, motif }. `cle` = chirurgien normalisé ou bucket. */
export function attribuer(ligne, index) {
  if (CODES_REANIMATION.test(ligne.code)) return { cle: BUCKETS.reanimation, motif: 'réanimation / USC' }
  if (CODES_CONSULTATION.test(ligne.code) || /^X/i.test(ligne.sejour)) return { cle: BUCKETS.consultations, motif: 'consultation' }
  const chirs = index.get(ligne.sejour)
  if (!chirs) return { cle: BUCKETS.sejourInconnu, motif: 'séjour absent des exports d\'actes' }
  if (chirs.size === 0) return { cle: BUCKETS.aArbitrer, motif: 'séjour sans chirurgien identifié (seul un anesthésiste est noté)' }
  const illisibles = [...chirs].filter(c => c.startsWith('?'))
  if (illisibles.length) return { cle: BUCKETS.aArbitrer, motif: `chirurgien illisible dans la CPA : ${illisibles.map(c => c.slice(1) || '(vide)').join(', ')}` }
  if (chirs.size > 1) return { cle: BUCKETS.aArbitrer, motif: `plusieurs chirurgiens : ${[...chirs].join(', ')}` }
  return { cle: [...chirs][0], motif: '' }
}

/**
 * Agrège des justificatifs lus (chacun complété de { associe, etablissement, fichier } d'après
 * son nom) : lignes des deux tables + lignes mises de côté + contrôle par mois.
 */
export function agreger(justificatifs, index, { viaCpa = new Set(), historique = null, specDe = null } = {}) {
  const mensuel = new Map(), chirurgiens = new Map(), misDeCote = [], controle = new Map(), rattachements = [], actes = []
  // Lignes FAC par séjour (tous mois confondus) : l'acte du même jour sert au rattachement des YYYY400
  const parSejour = new Map()
  for (const j of justificatifs) if (j.type === 'FAC') for (const l of j.lignes) {
    if (!parSejour.has(l.sejour)) parSejour.set(l.sejour, [])
    parSejour.get(l.sejour).push(l)
  }
  const cleM = (j) => `${j.annee}-${j.mois}-${j.associe}-${j.etablissement}`
  for (const j of justificatifs) {
    const k = cleM(j)
    if (!mensuel.has(k)) mensuel.set(k, {
      annee: j.annee, mois: j.mois, associe: j.associe, etablissement: j.etablissement,
      facture_total: 0, facture_dh: 0, facture_amo: 0, facture_amc: 0, facture_pat: 0,
      regle_total: 0, regle_conv: 0, regle_dh: 0, redevance_ttc: 0,
      nb_lignes_fac: 0, nb_lignes_red: 0, fichier_fac: '', fichier_red: '',
    })
    const m = mensuel.get(k)
    if (j.type === 'FAC') {
      if (m.fichier_fac) throw new Error(`Deux fichiers FAC pour ${k} : ${m.fichier_fac} et ${j.fichier}`)
      m.fichier_fac = j.fichier; m.nb_lignes_fac = j.nbLignes
      m.facture_total = arrondi(m.facture_total + j.total.total); m.facture_dh = arrondi(m.facture_dh + j.total.dh)
      m.facture_amo = arrondi(m.facture_amo + j.total.amo); m.facture_amc = arrondi(m.facture_amc + j.total.amc); m.facture_pat = arrondi(m.facture_pat + j.total.pat)
      const cm = `${j.annee}-${String(j.mois).padStart(2, '0')}`
      if (!controle.has(cm)) controle.set(cm, { facture: 0, attribue: 0, parCpa: 0, buckets: {} })
      const c = controle.get(cm)
      c.facture = arrondi(c.facture + j.total.total)
      // Actes à 0 € écartés : codés sans tarif (ventilation, catécholamines…) ou facturés puis annulés
      // dans le même fichier (même séjour, code et date d'acte, somme nulle). Le total du mois ne bouge pas.
      const net = new Map()
      const cleActe = (l) => `${l.sejour}|${l.code}|${l.dateActe?.getTime?.() ?? l.dateActe}`
      for (const l of j.lignes) net.set(cleActe(l), arrondi((net.get(cleActe(l)) || 0) + l.total))
      for (const l of j.lignes) {
        if (!net.get(cleActe(l))) continue
        let { cle, motif } = attribuer(l, index)
        if (specDe) {
          const r = rattacherOpacificationBiliaire(l, { cle, motif }, { lignesDuSejour: parSejour.get(l.sejour) || [], historique, specDe })
          if (r) { ({ cle, motif } = r); rattachements.push({ annee: j.annee, mois: j.mois, associe: j.associe, etablissement: j.etablissement, chirurgien: cle, motif, ...l }) }
        }
        // Ligne d'acte gardée pour l'export par chirurgien : sans nom ni prénom du patient
        actes.push({
          annee: j.annee, mois: j.mois, associe: j.associe, etablissement: j.etablissement, ligne: l.ligne, chirurgien: cle,
          sejour: l.sejour, date_acte: l.dateActe || null, date_facture: l.date || null, code: l.code, coef: l.coef || '',
          dh: l.dh, amo: l.amo, amc: l.amc, pat: l.pat, total: l.total, motif: motif || '',
        })
        const kc = `${j.annee}-${j.mois}-${cle}`
        if (!chirurgiens.has(kc)) chirurgiens.set(kc, { annee: j.annee, mois: j.mois, chirurgien: cle, montant: 0, nb_lignes: 0, sejours: new Set() })
        const ch = chirurgiens.get(kc)
        ch.montant = arrondi(ch.montant + l.total); ch.nb_lignes += 1; ch.sejours.add(l.sejour)
        if (estBucket(cle)) {
          c.buckets[cle] = arrondi((c.buckets[cle] || 0) + l.total)
          if (cle !== BUCKETS.consultations && cle !== BUCKETS.reanimation && !cle.startsWith('__spec_')) misDeCote.push({ annee: j.annee, mois: j.mois, associe: j.associe, etablissement: j.etablissement, bucket: cle, motif, ...l })
        } else {
          c.attribue = arrondi(c.attribue + l.total)
          if (viaCpa.has(l.sejour)) c.parCpa = arrondi(c.parCpa + l.total)
        }
      }
    } else {
      if (m.fichier_red) throw new Error(`Deux fichiers RED pour ${k} : ${m.fichier_red} et ${j.fichier}`)
      m.fichier_red = j.fichier; m.nb_lignes_red = j.nbLignes
      m.regle_conv = arrondi(m.regle_conv + j.total.conv); m.regle_dh = arrondi(m.regle_dh + j.total.dh)
      m.regle_total = arrondi(m.regle_conv + m.regle_dh); m.redevance_ttc = arrondi(m.redevance_ttc + j.total.redevTtc)
    }
  }
  // Contrôle d'intégrité : attribué + buckets = facturé, pour chaque mois
  for (const [cm, c] of controle) {
    const somme = arrondi(c.attribue + Object.values(c.buckets).reduce((s, v) => s + v, 0))
    if (Math.abs(somme - c.facture) > 0.05) throw new Error(`Mois ${cm} : attribué + buckets (${somme}) ≠ facturé (${c.facture})`)
  }
  const tri = (a, b) => a.annee - b.annee || a.mois - b.mois
  return {
    mensuel: [...mensuel.values()].sort((a, b) => tri(a, b) || a.associe.localeCompare(b.associe) || a.etablissement.localeCompare(b.etablissement)),
    chirurgiens: [...chirurgiens.values()].map(({ sejours, ...c }) => ({ ...c, nb_sejours: sejours.size })).sort((a, b) => tri(a, b) || b.montant - a.montant),
    misDeCote,
    rattachements,
    actes,
    controle: [...controle.entries()].map(([cle, c]) => ({ mois: cle, ...c })).sort((a, b) => a.mois.localeCompare(b.mois)),
  }
}
