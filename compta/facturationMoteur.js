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
  sansChirurgien: '__sans_chirurgien', // séjour retrouvé, mais sans chirurgien (réa, visites)
  sejourInconnu: '__sejour_inconnu',   // séjour absent des exports d'actes (ex. acte de l'année précédente)
  aArbitrer: '__a_arbitrer',           // plusieurs chirurgiens sur le séjour
}
export const estBucket = (cle) => typeof cle === 'string' && cle.startsWith('__')

export const CODES_CONSULTATION = /^(CS|MCS|MPC|APC|CSCPA|MCSCPA|APCCPA|MPCCPA|MPCMCS)$/i

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
export const nomFamille = (chirurgien) => String(chirurgien || '').split(' ').filter(m => m === m.toUpperCase()).join(' ')

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
    // Les exports portent une heure (23:59:39 locale) : on lit le jour en heure locale
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
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
    sejour: 'N° Dossier', nom: 'Nom', prenom: 'Prénom', code: 'Code Acte', dateActe: 'Date Acte', date: 'Date Facture',
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
  if (iS < 0 || iN < 0) return []
  return rows.slice(1).filter(r => r && r[iS] != null).map(r => ({ sejour: r[iS], nom: r[iN], prenom: iP >= 0 ? r[iP] : '' }))
}

/** À qui va une ligne facturée : { cle, motif }. `cle` = chirurgien normalisé ou bucket. */
export function attribuer(ligne, index) {
  if (CODES_CONSULTATION.test(ligne.code) || /^X/i.test(ligne.sejour)) return { cle: BUCKETS.consultations, motif: 'consultation' }
  const chirs = index.get(ligne.sejour)
  if (!chirs) return { cle: BUCKETS.sejourInconnu, motif: 'séjour absent des exports d\'actes' }
  if (chirs.size === 0) return { cle: BUCKETS.sansChirurgien, motif: 'séjour sans chirurgien (réa, visites)' }
  if (chirs.size > 1) return { cle: BUCKETS.aArbitrer, motif: `plusieurs chirurgiens : ${[...chirs].join(', ')}` }
  return { cle: [...chirs][0], motif: '' }
}

/**
 * Agrège des justificatifs lus (chacun complété de { associe, etablissement, fichier } d'après
 * son nom) : lignes des deux tables + lignes mises de côté + contrôle par mois.
 */
export function agreger(justificatifs, index) {
  const mensuel = new Map(), chirurgiens = new Map(), misDeCote = [], controle = new Map()
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
      const cm = `${j.annee}-${j.mois}`
      if (!controle.has(cm)) controle.set(cm, { facture: 0, attribue: 0, buckets: {} })
      const c = controle.get(cm)
      c.facture = arrondi(c.facture + j.total.total)
      for (const l of j.lignes) {
        const { cle, motif } = attribuer(l, index)
        const kc = `${j.annee}-${j.mois}-${cle}`
        if (!chirurgiens.has(kc)) chirurgiens.set(kc, { annee: j.annee, mois: j.mois, chirurgien: cle, montant: 0, nb_lignes: 0, sejours: new Set() })
        const ch = chirurgiens.get(kc)
        ch.montant = arrondi(ch.montant + l.total); ch.nb_lignes += 1; ch.sejours.add(l.sejour)
        if (estBucket(cle)) {
          c.buckets[cle] = arrondi((c.buckets[cle] || 0) + l.total)
          if (cle !== BUCKETS.consultations) misDeCote.push({ annee: j.annee, mois: j.mois, associe: j.associe, etablissement: j.etablissement, bucket: cle, motif, ...l })
        } else c.attribue = arrondi(c.attribue + l.total)
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
    controle: [...controle.entries()].map(([cle, c]) => ({ mois: cle, ...c })).sort((a, b) => a.mois.localeCompare(b.mois)),
  }
}
