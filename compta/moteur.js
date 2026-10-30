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
  const estRempla = /\b(?:R?E?MPLA(?:CANT|CEMENT)?)\b/i.test(motif) || /REMPLA$/i.test(motif.trim())
  const estSalaire = /\bSALAIRE?S?\b|\bSALAIR\b/i.test(motif)

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
    else if (/MOINS DONNE|MOINS VERSE|TROP PERCU/.test(m)) cat = 'Régularisation'
    else if (/\bRCP\b/.test(m)) cat = 'Remboursement RCP'
    else if (/AVANCE|\bREMB/.test(m)) cat = 'Remboursement de frais avancés'
    else if (/COMPL|CLMPL/.test(m)) cat = 'Complément d\'honoraires'
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
