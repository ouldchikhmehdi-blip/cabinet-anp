// Moteur de classement des lignes bancaires de la SARM : module PUR (aucun accès
// fichier, aucune dépendance Node) pour être importé à la fois par le script local
// (compta/classer.js), par l'importeur (compta/importer.js) et par le dashboard
// (src/data/comptaApi.js, page « Règles virements »).
//
// Principe : une ligne qu'aucune règle ne couvre va dans « À arbitrer », jamais dans une
// catégorie par défaut. Pour un virement à un associé, le bénéficiaire fait foi sur le motif ;
// s'ils divergent, la ligne est classée d'après le bénéficiaire et mise en alerte.

export const A_ARBITRER = 'À arbitrer'

// ---------------------------------------------------------------------------
// Lecture de l'OFX (format SGML de BNP : balises ouvrantes, pas de fermantes)
// ---------------------------------------------------------------------------

const champ = (bloc, nom) => {
  const m = bloc.match(new RegExp(`<${nom}>([^\\r\\n<]*)`))
  return m ? m[1].trim() : ''
}

export function parserOfx(texte) {
  const blocs = texte.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g) || []
  return blocs.map(bloc => {
    const d = champ(bloc, 'DTPOSTED').slice(0, 8)
    return {
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      montant: Number(champ(bloc, 'TRNAMT')),
      type: champ(bloc, 'NAME'),
      memo: champ(bloc, 'MEMO'),
      fitid: champ(bloc, 'FITID'),
    }
  })
}

// ---------------------------------------------------------------------------
// Lecture du CSV natif BNP (export « Mes comptes ») :
//   1re ligne  : <titulaire>;<titulaire>;****<compte>;JJ/MM/AAAA;;<solde à cette date>
//   lignes     : date opération;catégorie;libellé court;libellé long;date valeur;montant
// Le libellé court est le NAME de l'OFX et le libellé long = libellé court + « » + le MEMO
// complet (l'OFX le tronque vers 70 caractères). Pas d'identifiant : on en fabrique un,
// stable d'un export à l'autre, à partir de date, montant, libellé et rang d'apparition.
// ---------------------------------------------------------------------------

const isoFr = (d) => d.trim().split('/').reverse().join('-')
const nombreFr = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.'))

// Empreinte 53 bits (cyrb53), synchrone et identique en Node et dans le navigateur
export function empreinte(str, graine = 0) {
  let h1 = 0xdeadbeef ^ graine, h2 = 0x41c6ce57 ^ graine
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

export function parserCsvBnp(texte) {
  const lignes = texte.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim())
  if (lignes.length === 0) return { lignes: [], solde: null }
  const entete = lignes[0].split(';')
  const solde = /^\d{2}\/\d{2}\/\d{4}$/.test((entete[3] || '').trim()) && entete[5] !== undefined
    ? { date: isoFr(entete[3]), solde: nombreFr(entete[5]) }
    : null
  const rangs = new Map()
  const out = []
  for (const l of lignes.slice(1)) {
    const c = l.split(';')
    if (c.length < 6 || !/^\d{2}\/\d{2}\/\d{4}$/.test(c[0].trim())) continue
    const court = c[2].trim()
    const long = c.slice(3, c.length - 2).join(';').trim() // un « ; » dans le libellé reste dans le libellé
    const date = isoFr(c[0])
    const montant = nombreFr(c[c.length - 1])
    const memo = long.startsWith(court + ' ') ? long.slice(court.length + 1).trim() : long
    const cle = `${date}|${montant.toFixed(2)}|${long}`
    const rang = rangs.get(cle) || 0
    rangs.set(cle, rang + 1)
    out.push({ date, montant, type: court, memo, fitid: `bnp-${empreinte(cle)}-${rang}` })
  }
  return { lignes: out, solde }
}

// Format reconnu au contenu : OFX (balises STMTTRN) ou CSV BNP. → { format, lignes, solde }
// Le solde de l'OFX BNP (LEDGERBAL) n'est PAS repris : vérifié faux (écart à six chiffres) le
// 2026-10-30 (les agios prélevés en juillet 2025 ne collent qu'avec le solde d'en-tête du
// CSV). Seul le solde d'en-tête du CSV sert d'ancre à la trésorerie ; `soldeOfxIgnore`
// est renvoyé pour information.
export function parserReleve(texte) {
  if (/<STMTTRN>/i.test(texte)) return { format: 'ofx', lignes: parserOfx(texte), solde: null, soldeOfxIgnore: lireSolde(texte) }
  const csv = parserCsvBnp(texte)
  return { format: 'csv-bnp', ...csv }
}

// ---------------------------------------------------------------------------
// Fusion d'un import avec les lignes déjà connues
// ---------------------------------------------------------------------------

const normLib = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * Compare des lignes à importer avec des lignes déjà connues (base ou grand livre).
 * Une ligne est un doublon si elle a le même FITID, ou — formats différents (OFX tronqué
 * vs CSV complet) — même date, même montant et l'un des libellés commence par l'autre.
 * Chaque ligne connue n'absorbe qu'une seule ligne importée.
 * → { nouvelles, identiques, enrichies } ; `enrichies` = [{ existante, nouvelle }] quand le
 *   libellé importé est plus long que celui connu (bénéficiaire tronqué par l'OFX, etc.).
 * Les lignes connues doivent porter { fitid, date, montant, memo }.
 */
export function fusionner(connues, aImporter) {
  const parId = new Map(connues.map(c => [c.fitid, c]))
  const parDateMontant = new Map()
  for (const c of connues) {
    const k = `${c.date}|${Number(c.montant).toFixed(2)}`
    if (!parDateMontant.has(k)) parDateMontant.set(k, [])
    parDateMontant.get(k).push(c)
  }
  const prises = new Set()
  const nouvelles = [], identiques = [], enrichies = []
  // D'abord les FITID exacts, pour qu'un appariement souple ne les « vole » pas
  const restantes = []
  for (const l of aImporter) {
    const c = parId.get(l.fitid)
    if (c && !prises.has(c.fitid)) { prises.add(c.fitid); identiques.push(l) } else restantes.push(l)
  }
  for (const l of restantes) {
    const candidats = parDateMontant.get(`${l.date}|${Number(l.montant).toFixed(2)}`) || []
    const a = normLib(l.memo)
    const c = candidats.find(x => {
      if (prises.has(x.fitid)) return false
      const b = normLib(x.memo)
      return a.startsWith(b) || b.startsWith(a)
    })
    if (!c) { nouvelles.push(l); continue }
    prises.add(c.fitid)
    if (normLib(l.memo).length > normLib(c.memo).length) enrichies.push({ existante: c, nouvelle: l })
    else identiques.push(l)
  }
  return { nouvelles, identiques, enrichies }
}

/**
 * Ce qu'il faut écrire en base pour importer `classees` (lignes classées d'un relevé),
 * sachant `connues` = lignes déjà en base { fitid, date, montant, memo, manuel }.
 *  - nouvelle opération                → écrite telle quelle ;
 *  - même FITID                        → reclassée, sauf si classée à la main (manuel) ;
 *  - même opération, libellé plus long → écrite sous le FITID existant (libellé enrichi,
 *                                        reclassée) ; si manuelle, seul le libellé change ;
 *  - même opération, libellé pas plus long mais FITID différent → ignorée (déjà là).
 * → { ecrire: lignes classées à upserter, libelles: [{ fitid, memo, tiers }], stats }
 */
export function planifierImport(classees, connues) {
  const { nouvelles, identiques, enrichies } = fusionner(connues, classees)
  const parId = new Map(connues.map(c => [c.fitid, c]))
  const ecrire = [...nouvelles]
  const libelles = []
  let manuellesPreservees = 0, dejaPresentes = 0
  for (const l of identiques) {
    const c = parId.get(l.fitid)
    if (!c) { dejaPresentes++; continue }
    if (c.manuel) { manuellesPreservees++; continue }
    ecrire.push(l)
  }
  for (const { existante, nouvelle } of enrichies) {
    if (existante.manuel) { manuellesPreservees++; libelles.push({ fitid: existante.fitid, memo: nouvelle.memo, tiers: nouvelle.tiers }) }
    else ecrire.push({ ...nouvelle, fitid: existante.fitid })
  }
  return {
    ecrire,
    libelles,
    stats: { lues: classees.length, nouvelles: nouvelles.length, enrichies: enrichies.length, manuellesPreservees, dejaPresentes },
  }
}

// ---------------------------------------------------------------------------
// Lecture du libellé : qui est le tiers, quel est le motif, quel est le bénéficiaire
// ---------------------------------------------------------------------------

export function analyserLibelle(memo) {
  const m = (memo || '').trim()
  if (m.startsWith('/FRM ')) {
    const tiers = m.slice(5).split(/\s*\/EID/)[0].replace(/\s+/g, ' ').trim()
    return { tiers, motif: '', beneficiaire: tiers }
  }
  if (m.includes('/MOTIF')) {
    const mo = m.match(/\/MOTIF\s*(.*?)(?:\s*\/BEN\s*(.*))?$/)
    const motif = (mo?.[1] || '').replace(/\s+/g, ' ').trim()
    const beneficiaire = (mo?.[2] || '').split(/\s*\/REF/)[0].replace(/\s+/g, ' ').trim()
    return { tiers: beneficiaire || motif, motif, beneficiaire }
  }
  if (/ ECH\//.test(m)) {
    const tiers = m.split(/ ECH\//)[0].trim()
    return { tiers, motif: '', beneficiaire: tiers }
  }
  const tiers = m.replace(/\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, '').replace(/\s+/g, ' ').trim()
  return { tiers, motif: m, beneficiaire: '' }
}

// ---------------------------------------------------------------------------
// Règles
// ---------------------------------------------------------------------------

export function preparerRegles(regles) {
  const groupeDe = {}
  for (const [groupe, sous] of Object.entries(regles.taxonomie)) {
    for (const s of sous) groupeDe[s] = groupe
  }
  for (const r of regles.regles) {
    if (!(r.categorie in groupeDe)) throw new Error(`Règle ${r.id} : catégorie inconnue « ${r.categorie} »`)
  }
  const rx = s => new RegExp(s, 'i')
  const liste = noms => noms.map(n => ({ nom: n, rx: new RegExp(`(?:^|[^A-Z])(?:${n})(?:$|[^A-Z])`, 'i') }))
  return {
    ...regles,
    groupeDe,
    _associes: Object.entries(regles.associes).map(([ini, pat]) => ({ initiales: ini, rx: rx(`(?:^|[^A-Z])(?:${pat})(?:$|[^A-Z])`) })),
    _cdi: liste(regles.iade_cdi),
    _cdd: liste(regles.iade_cdd),
    _mar: liste(regles.mar_remplacants),
    _caisses: rx(regles.caisses_tiers_payant),
    _carte: rx(regles.commercants_carte),
    _regles: regles.regles.map(r => ({
      ...r,
      _type: r.quand.type ? rx(r.quand.type) : null,
      _tiers: r.quand.tiers ? rx(r.quand.tiers) : null,
      _memo: r.quand.memo ? rx(r.quand.memo) : null,
      _ben: r.quand.beneficiaire ? rx(r.quand.beneficiaire) : null,
    })),
  }
}

const trouver = (liste, texte) => liste.find(x => x.rx.test(texte))
const associeDans = (R, texte) => trouver(R._associes, texte)?.initiales || null

function resultat(R, categorie, extra = {}) {
  return { groupe: R.groupeDe[categorie], categorie, associe: '', regle: '', alerte: '', ...extra }
}

export function classer(ligne, R) {
  const { tiers, motif, beneficiaire } = analyserLibelle(ligne.memo)
  const credit = ligne.montant > 0
  const texte = `${motif} | ${beneficiaire}`.toUpperCase()
  const type = ligne.type || ''

  // 1. Règles explicites (première qui matche gagne)
  for (const r of R._regles) {
    const q = r.quand
    if (q.fitid && q.fitid !== ligne.fitid) continue // règle posée sur une seule ligne
    if (q.sens === 'credit' && !credit) continue
    if (q.sens === 'debit' && credit) continue
    if (r._type && !r._type.test(type)) continue
    if (r._tiers && !r._tiers.test(tiers)) continue
    if (r._memo && !r._memo.test(ligne.memo)) continue
    if (r._ben && !r._ben.test(beneficiaire)) continue
    if (q.montant_min != null && Math.abs(ligne.montant) < q.montant_min) continue
    if (q.montant_max != null && Math.abs(ligne.montant) > q.montant_max) continue
    return resultat(R, r.categorie, { regle: r.id, alerte: r.alerte || '', associe: r.associe || '' })
  }

  const assoBen = associeDans(R, beneficiaire)
  const assoMotif = associeDans(R, motif)
  const mar = trouver(R._mar, texte)
  // Motifs saisis à la main à la banque : on tolère les coquilles vues sur les relevés
  // (RMPLA, REMOLA, REM0LA ; SALAIRZ, QALAIRE) et les heures sup payées à part.
  const estRempla = /\bR?E?M[P0O]LA(?:CANT|CEMENT)?\b/i.test(motif) || /REMPLA$/i.test(motif.trim())
  const estSalaire = /\b[SQ]ALAIR[EZS]?S?\b/i.test(motif) || /\bHEURES? SUP/i.test(motif)

  // 2. Virements reçus : tiers payant, remboursements
  if (credit) {
    if (R._caisses.test(tiers)) {
      if (ligne.montant <= R.tiers_payant_montant_max) return resultat(R, 'Tiers payant consultations', { regle: 'tiers-payant' })
      return resultat(R, A_ARBITRER, { regle: 'tiers-payant', alerte: `montant inhabituel pour un tiers payant (> ${R.tiers_payant_montant_max} €)` })
    }
    const assoRecu = assoBen || assoMotif
    if (assoRecu || /SELARL/i.test(tiers)) {
      return resultat(R, 'Remboursement reçu', {
        regle: 'remboursement-associe',
        associe: assoRecu || '?',
        alerte: assoRecu ? '' : 'associé indéterminable (libellé tronqué)',
      })
    }
    if (mar) return resultat(R, 'Remboursement reçu', { regle: 'remboursement-remplacant', alerte: `remboursement reçu d'un remplaçant MAR (${mar.nom})` })
    if (/\bREMB/i.test(motif)) return resultat(R, 'Remboursement reçu', { regle: 'remboursement-motif', alerte: 'remboursement reçu, émetteur à préciser' })
    return resultat(R, A_ARBITRER, { regle: '', alerte: 'virement reçu d\'un tiers inconnu' })
  }

  // 3. Salaires (avant les associés : « RELIQUAT SALAIRE » n'est pas un reliquat d'associé)
  if (estSalaire) {
    if (trouver(R._cdi, texte)) return resultat(R, 'Salaire IADE CDI', { regle: 'salaire-cdi' })
    if (trouver(R._cdd, texte)) return resultat(R, 'Remplaçant IADE (CDD)', { regle: 'salaire-cdd' })
    return resultat(R, A_ARBITRER, { regle: 'salaire', alerte: 'salarié inconnu : ajouter à iade_cdi ou iade_cdd' })
  }

  // 4. Remplaçants MAR
  if (estRempla && !assoBen) {
    if (/HOTEL/i.test(motif) && assoMotif) return resultat(R, 'Frais de remplaçant', { regle: 'frais-remplacant', associe: assoMotif })
    if (mar) return resultat(R, 'Remplaçant MAR', { regle: 'rempla-mar' })
    // « REMPLA » adressé à un IADE remplaçant connu : c'est son salaire de CDD
    if (trouver(R._cdd, texte)) return resultat(R, 'Remplaçant IADE (CDD)', { regle: 'salaire-cdd' })
    return resultat(R, A_ARBITRER, { regle: 'rempla', alerte: 'remplaçant inconnu : vérifier qu\'il est MAR puis l\'ajouter à mar_remplacants' })
  }

  // 5. Virements aux associés : le bénéficiaire fait foi, le motif donne la sous-catégorie
  if (assoBen || assoMotif) {
    const associe = assoBen || assoMotif
    let alerte = ''
    if (assoBen && assoMotif && assoBen !== assoMotif) alerte = `motif « ${assoMotif} » mais bénéficiaire « ${assoBen} » : imputé au bénéficiaire`
    if (!assoBen && !/SELARL|HATTERER/i.test(beneficiaire) && beneficiaire) alerte = 'bénéficiaire non reconnu, imputé d\'après le motif'
    const m = motif.toUpperCase()
    let cat
    if (/HOTEL/.test(m)) cat = 'Frais de remplaçant'
    else if (/RELIQUAT/.test(m)) cat = 'Reliquat exercice précédent'
    else if (/MOINS DONNE|MOINS VERSE|TROP PERCU|\bREGUL/.test(m)) cat = 'Régularisation'
    else if (/\bRCP\b/.test(m)) cat = 'Remboursement RCP'
    else if (/AVANCE|\bREMB/.test(m)) cat = 'Remboursement de frais avancés'
    else if (/COMPL|CLMPL|COMOL/.test(m)) cat = 'Complément d\'honoraires'
    else return resultat(R, A_ARBITRER, { regle: 'associe', associe, alerte: 'virement à un associé, motif non reconnu' })
    return resultat(R, cat, { regle: 'associe', associe, alerte })
  }

  // Associé non identifiable mais bénéficiaire SELARL tronqué : la catégorie reste lisible
  if (/^SELARL/i.test(beneficiaire)) {
    const m = motif.toUpperCase()
    const cat = /RELIQUAT/.test(m) ? 'Reliquat exercice précédent' : /COMPL/.test(m) ? 'Complément d\'honoraires' : null
    if (cat) return resultat(R, cat, { regle: 'associe', associe: '?', alerte: 'associé indéterminable (bénéficiaire tronqué, motif sans nom)' })
  }

  // 6. Cartes bancaires
  if (/^FACTURE CARTE/i.test(type)) {
    if (R._carte.test(ligne.memo)) return resultat(R, 'Vie du groupe et réceptions', { regle: 'carte-connue' })
    return resultat(R, A_ARBITRER, { regle: 'carte', alerte: 'commerçant inconnu : ajouter à commercants_carte si c\'est de la vie du groupe' })
  }

  return resultat(R, A_ARBITRER, { regle: '', alerte: 'aucune règle ne couvre ce libellé' })
}

export function classerTout(lignes, R) {
  return lignes.map(l => {
    const { tiers } = analyserLibelle(l.memo)
    return { ...l, tiers, ...classer(l, R) }
  })
}


// Solde du relevé (LEDGERBAL) : { date, solde } ou null.
export function lireSolde(texte) {
  const m = texte.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^\r\n<]*)[\s\S]*?<DTASOF>(\d{8})/)
  if (!m) return null
  const d = m[2]
  return { date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, solde: Number(m[1].trim()) }
}

// Un document de règles est-il bien formé ? Renvoie la liste des problèmes (vide si OK).
export function verifierRegles(doc) {
  const pb = []
  if (!doc || typeof doc !== 'object') return ['document absent']
  if (!doc.taxonomie || typeof doc.taxonomie !== 'object') pb.push('taxonomie absente')
  for (const k of ['iade_cdi', 'iade_cdd', 'mar_remplacants']) if (!Array.isArray(doc[k])) pb.push(`${k} absent`)
  if (!doc.associes || typeof doc.associes !== 'object') pb.push('associes absent')
  if (!Array.isArray(doc.regles)) pb.push('regles absent')
  if (pb.length) return pb
  try { preparerRegles(doc) } catch (e) { pb.push(e.message) }
  return pb
}
