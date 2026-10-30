#!/usr/bin/env node
// Classement d'un relevé bancaire OFX de la SARM selon compta/regles.json.
//
//   node compta/classer.js <fichier.ofx> [--annee 2025] [--sortie ~/partage/compta/classe]
//
// Produit dans le dossier de sortie (hors dépôt git) :
//   - releve-<nom>-classe.csv : toutes les lignes avec groupe / catégorie / associé / règle / alerte
//   - a-arbitrer.csv          : les lignes qu'aucune règle sûre ne couvre
//   - rapport.md              : totaux, alertes, lignes à arbitrer, contrôle d'intégrité
//   - grand-livre.csv         : cumul de tous les imports, dédoublonné par FITID
//
// Principe : une ligne qu'aucune règle ne couvre va dans « À arbitrer », jamais dans une
// catégorie par défaut. Pour un virement à un associé, le bénéficiaire fait foi sur le motif ;
// s'ils divergent, la ligne est classée d'après le bénéficiaire et mise en alerte.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ICI = dirname(fileURLToPath(import.meta.url))
export const CHEMIN_REGLES = join(ICI, 'regles.json')
const A_ARBITRER = 'À arbitrer'

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

export function chargerRegles(chemin = CHEMIN_REGLES) {
  const regles = JSON.parse(readFileSync(chemin, 'utf8'))
  return preparerRegles(regles)
}

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
    return resultat(R, r.categorie, { regle: r.id, alerte: r.alerte || '' })
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

// ---------------------------------------------------------------------------
// Sorties
// ---------------------------------------------------------------------------

export const COLONNES = ['date', 'montant', 'type', 'libelle', 'tiers', 'groupe', 'categorie', 'associe', 'regle', 'alerte', 'fitid']

const fr = n => n.toFixed(2).replace('.', ',')
const csvCell = v => {
  const s = String(v ?? '')
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function versCsv(lignes) {
  const entete = COLONNES.join(';')
  const corps = lignes.map(l => COLONNES.map(c => {
    if (c === 'montant') return fr(l.montant)
    if (c === 'libelle') return csvCell(l.memo)
    return csvCell(l[c])
  }).join(';'))
  return '\uFEFF' + [entete, ...corps].join('\n') + '\n'
}

export function depuisCsv(texte) {
  const lignes = texte.replace(/^\uFEFF/, '').split('\n').filter(Boolean)
  const cols = lignes.shift().split(';')
  return lignes.map(ligne => {
    const cells = []
    let cur = '', q = false
    for (let i = 0; i < ligne.length; i++) {
      const ch = ligne[i]
      if (q) {
        if (ch === '"' && ligne[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false
        else cur += ch
      } else if (ch === '"') q = true
      else if (ch === ';') { cells.push(cur); cur = '' } else cur += ch
    }
    cells.push(cur)
    const o = {}
    cols.forEach((c, i) => { o[c] = cells[i] ?? '' })
    o.montant = Number(String(o.montant).replace(',', '.'))
    o.memo = o.libelle
    return o
  })
}

const eur = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

export function rapport(lignes, R, meta = {}) {
  const L = []
  const dates = lignes.map(l => l.date).sort()
  const credits = lignes.filter(l => l.montant > 0).reduce((s, l) => s + l.montant, 0)
  const debits = lignes.filter(l => l.montant < 0).reduce((s, l) => s + l.montant, 0)
  const total = lignes.reduce((s, l) => s + l.montant, 0)
  const arbitrer = lignes.filter(l => l.categorie === A_ARBITRER)
  const alertes = lignes.filter(l => l.alerte && l.categorie !== A_ARBITRER)

  L.push(`# Rapport de classement — ${meta.fichier || ''}`, '')
  L.push(`- Période : ${dates[0]} → ${dates[dates.length - 1]} (${lignes.length} lignes)`)
  if (meta.annee) L.push(`- Filtre : année ${meta.annee}`)
  L.push(`- Crédits : ${eur(credits)} · Débits : ${eur(debits)} · Solde du relevé : ${eur(total)}`)
  const dernier = dates[dates.length - 1]
  if (dernier && !/-(28|29|30|31)$/.test(dernier)) L.push(`- ⚠️ Le mois ${dernier.slice(0, 7)} est incomplet (dernière ligne le ${dernier})`)
  L.push(`- Lignes à arbitrer : **${arbitrer.length}** (${eur(arbitrer.reduce((s, l) => s + l.montant, 0))})`)
  L.push(`- Lignes classées avec alerte : ${alertes.length}`)

  // Intégrité : somme par groupe = somme totale
  const parCat = {}
  for (const l of lignes) {
    const k = `${l.groupe} › ${l.categorie}`
    parCat[k] = parCat[k] || { n: 0, total: 0 }
    parCat[k].n++; parCat[k].total += l.montant
  }
  const sommeCats = Object.values(parCat).reduce((s, c) => s + c.total, 0)
  L.push(`- Contrôle d'intégrité : somme des catégories ${eur(sommeCats)} ${Math.abs(sommeCats - total) < 0.005 ? '= total ✓' : '≠ total ✗'}`)

  L.push('', '## Totaux par catégorie', '', '| Groupe › Catégorie | Lignes | Total |', '|---|---:|---:|')
  const ordre = Object.entries(R.taxonomie).flatMap(([g, sous]) => sous.map(s => `${g} › ${s}`))
  for (const k of ordre) if (parCat[k]) L.push(`| ${k} | ${parCat[k].n} | ${eur(parCat[k].total)} |`)

  // Par mois × groupe
  const mois = [...new Set(lignes.map(l => l.date.slice(0, 7)))].sort()
  const groupes = Object.keys(R.taxonomie)
  L.push('', '## Par mois et par groupe', '', `| Mois | ${groupes.join(' | ')} |`, `|---|${groupes.map(() => '---:').join('|')}|`)
  for (const m of mois) {
    const cells = groupes.map(g => eur(lignes.filter(l => l.date.startsWith(m) && l.groupe === g).reduce((s, l) => s + l.montant, 0)))
    L.push(`| ${m} | ${cells.join(' | ')} |`)
  }

  // Par associé
  const assos = [...new Set(lignes.map(l => l.associe).filter(Boolean))].sort()
  if (assos.length) {
    const cats = [...new Set(lignes.filter(l => l.associe).map(l => l.categorie))]
    L.push('', '## Par associé', '', `| Associé | ${cats.join(' | ')} | Total |`, `|---|${cats.map(() => '---:').join('|')}|---:|`)
    for (const a of assos) {
      const mine = lignes.filter(l => l.associe === a)
      const cells = cats.map(c => eur(mine.filter(l => l.categorie === c).reduce((s, l) => s + l.montant, 0)))
      L.push(`| ${a} | ${cells.join(' | ')} | ${eur(mine.reduce((s, l) => s + l.montant, 0))} |`)
    }
  }

  if (alertes.length) {
    L.push('', '## Lignes classées mais à vérifier', '', '| Date | Montant | Catégorie | Associé | Libellé | Alerte |', '|---|---:|---|---|---|---|')
    for (const l of alertes) L.push(`| ${l.date} | ${eur(l.montant)} | ${l.categorie} | ${l.associe} | ${l.memo.replace(/\|/g, '/')} | ${l.alerte} |`)
  }

  if (arbitrer.length) {
    const parTiers = {}
    for (const l of arbitrer) {
      const k = l.tiers || l.memo
      parTiers[k] = parTiers[k] || { n: 0, total: 0, alerte: l.alerte, exemple: l }
      parTiers[k].n++; parTiers[k].total += l.montant
    }
    L.push('', '## À arbitrer (regroupé par tiers)', '', '| Tiers | Lignes | Total | Première date | Pourquoi |', '|---|---:|---:|---|---|')
    for (const [k, v] of Object.entries(parTiers).sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total))) {
      L.push(`| ${k.replace(/\|/g, '/')} | ${v.n} | ${eur(v.total)} | ${v.exemple.date} | ${v.alerte} |`)
    }
  }
  return L.join('\n') + '\n'
}

export function fusionnerGrandLivre(existant, nouvelles) {
  const parId = new Map(existant.map(l => [l.fitid, l]))
  for (const l of nouvelles) parId.set(l.fitid, l)
  return [...parId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.fitid.localeCompare(b.fitid))
}

// ---------------------------------------------------------------------------
// Ligne de commande
// ---------------------------------------------------------------------------

function main(argv) {
  const args = argv.slice(2)
  const fichier = args.find(a => !a.startsWith('--'))
  const opt = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined }
  if (!fichier) {
    console.error('Usage : node compta/classer.js <fichier.ofx> [--annee 2025] [--sortie DOSSIER]')
    process.exit(1)
  }
  const annee = opt('annee')
  const sortie = opt('sortie') || join(homedir(), 'partage', 'compta', 'classe')
  const R = chargerRegles()

  let lignes = parserOfx(readFileSync(fichier, 'latin1'))
  if (!lignes.length) {
    // Certains exports sont en UTF-8 ; on retente si rien n'a été lu
    lignes = parserOfx(readFileSync(fichier, 'utf8'))
  }
  if (annee) lignes = lignes.filter(l => l.date.startsWith(annee))
  const classees = classerTout(lignes, R)

  mkdirSync(sortie, { recursive: true })
  const nom = basename(fichier).replace(/\.[^.]+$/, '')
  writeFileSync(join(sortie, `releve-${nom}-classe.csv`), versCsv(classees))
  writeFileSync(join(sortie, 'a-arbitrer.csv'), versCsv(classees.filter(l => l.categorie === A_ARBITRER)))
  writeFileSync(join(sortie, 'rapport.md'), rapport(classees, R, { fichier: basename(fichier), annee }))

  const cheminGL = join(sortie, 'grand-livre.csv')
  const existant = existsSync(cheminGL) ? depuisCsv(readFileSync(cheminGL, 'utf8')) : []
  const gl = fusionnerGrandLivre(existant, classees)
  writeFileSync(cheminGL, versCsv(gl))

  const nbArb = classees.filter(l => l.categorie === A_ARBITRER).length
  console.log(`${classees.length} lignes classées (${nbArb} à arbitrer) → ${sortie}`)
  console.log(`grand-livre.csv : ${existant.length} → ${gl.length} lignes`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv)
