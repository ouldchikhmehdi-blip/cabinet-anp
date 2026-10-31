#!/usr/bin/env node
// Relevés BNP en PDF (« RELEVE DE VOTRE COMPTE COURANT EN EURO ») → CSV au format du CSV natif
// BNP, importable tel quel par la page « Règles virements » ou par compta/importer.js.
//
//   node compta/pdf-vers-csv.js <releves.pdf> [--avant 2024-11-30] [--sortie fichier.csv]
//
// Lit le texte du PDF avec `pdftotext -layout` (poppler-utils). Une opération = une ligne
// « date comptable · libellé · date de valeur · montant » ; le libellé continue sur les lignes
// suivantes alignées sur lui. Débit ou crédit selon la colonne du montant (repérée sur l'en-tête
// « DEBIT / CREDIT » de chaque page).
//
// CONTRÔLE : pour chaque relevé, somme des débits et des crédits lus = « TOTAL DES OPERATIONS »,
// solde de début + crédits − débits = solde de fin, et chaque relevé reprend le solde du
// précédent. Le CSV n'est écrit que si tout tombe juste au centime (sinon : rapport et code 1).
//
// --avant AAAA-MM-JJ : ne garde que les opérations antérieures (ex. la date où commence un OFX
// déjà importé, pour ne pas recouvrir des lignes déjà en base sous un autre libellé).
// En-tête du CSV sans solde : un relevé PDF ancien ne doit pas devenir l'ancre des soldes.
//
// Rien de ce script n'écrit de donnée bancaire dans le dépôt.

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { basename } from 'node:path'

// Libellé PDF → type court du CSV BNP (colonne 3), dans l'ordre du plus spécifique au plus général
const TYPES = [
  ['VIR SEPA RECU', 'VIREMENT'], ['VIR SCT INST RECU', 'VIREMENT'], ['VIR SEPA INST RECU', 'VIREMENT'], ['VIREMENT SEPA EMIS', 'VIREMENT'], ['VIR SCT INST EMIS', 'VIREMENT INSTANTANE EMIS'],
  ['VIR SEPA INST EMIS', 'VIREMENT INSTANTANE EMIS'], ['VIR CPTE A CPTE EMIS', 'VIREMENT INTERNE'], ['VIREMENT FAVEUR TIERS', 'VIREMENT'],
  ['PRLV SEPA B2B', 'PRLV SEPA B2B'], ['PRLV SEPA', 'PRELEVEMENT'], ['REMBT PRLV SEPA', 'REMBOURSEMENT PRELEVEMENT'],
  ['COMMISSIONS', 'COMMISSIONS'], ['INTERETS ET COMMISSIONS', 'INTERETS'], ['REMISE CHEQUES', 'REMISE CHEQUES'], ['CHEQUE', 'CHEQUE'],
]
const SECTION_CARTES = /PAIEMENTS PAR CARTES?/

const nombre = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.'))
const centimes = (x) => Math.round(x * 100)
const fr = (x) => x.toFixed(2).replace('.', ',')
const isoCourt = (d) => { const [j, m, a] = d.split('.'); return `20${a}-${m}-${j}` }
const frDate = (iso) => iso.split('-').reverse().join('/')

export function lirePdf(texte) {
  const pages = texte.split('\f')
  const releves = [] // { numero, debut, fin, soldeDebut, soldeFin, totalDebit, totalCredit, ops: [] }
  let rel = null, op = null, section = '', colCredit = null
  const MOIS = 'JANVIER|FÉVRIER|FEVRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AOÛT|AOUT|SEPTEMBRE|OCTOBRE|NOVEMBRE|DÉCEMBRE|DECEMBRE'

  for (const page of pages) {
    const lignes = page.split('\n')
    const ent = lignes.find(l => /D\s+EBIT\s+C\s*$/.test(l))
    if (ent) colCredit = ent.trimEnd().length - 1
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i]
      let m
      if ((m = l.match(/Relevé N° : (\d+)/))) {
        rel = { numero: m[1], ops: [], soldeDebut: null, soldeFin: null, totalDebit: null, totalCredit: null, soldeFinal: null }
        releves.push(rel); op = null; section = ''
        continue
      }
      if (!rel) continue
      // En-tête du relevé : « Solde au X : Crédit : A Solde au Y : » puis « ±S1 Débit : B ±S2 »
      if (rel.soldeDebut === null && new RegExp(`Solde au \\d+ (?:${MOIS})`).test(l) && /Crédit\s*:/.test(l)) {
        const suite = lignes.slice(i + 1).find(x => /Débit\s*:/.test(x)) || ''
        const credit = l.match(/Crédit\s*:\s*([\d\s]+,\d\d)/)
        const deb = suite.match(/^\s*([+-])\s*([\d\s]+,\d\d)\s+Débit\s*:\s*([\d\s]+,\d\d)\s+([+-])\s*([\d\s]+,\d\d)/)
        if (credit && deb) {
          rel.enteteCredit = nombre(credit[1]); rel.enteteDebit = nombre(deb[3])
          rel.soldeDebut = (deb[1] === '-' ? -1 : 1) * nombre(deb[2])
          rel.soldeFin = (deb[4] === '-' ? -1 : 1) * nombre(deb[5])
        }
        continue
      }
      if ((m = l.match(/TOTAL DES OPERATIONS\s+([\d\s]+,\d\d)\s+([\d\s]+,\d\d)\s*$/))) {
        rel.totalDebit = nombre(m[1]); rel.totalCredit = nombre(m[2]); op = null; continue
      }
      if ((m = l.match(/Solde (créditeur|débiteur) au \d\d\.\d\d\.\d{4}\s+([\d\s]+,\d\d)\s*$/))) {
        rel.soldeFinal = (m[1] === 'débiteur' ? -1 : 1) * nombre(m[2]); op = null; continue
      }
      if (/Sous total/.test(l)) { op = null; continue }
      // Opération
      if ((m = l.match(/^(\s+)(\d\d\.\d\d\.\d\d)\s{2,}(\S.*?)\s{2,}(\d\d\.\d\d\.\d\d)\s+(\d[\d ]*,\d\d)\s*$/))) {
        const colLib = m[1].length + m[2].length + l.slice(m[1].length + m[2].length).search(/\S/)
        const fin = l.trimEnd().length - 1
        const credit = colCredit != null ? fin >= colCredit : null
        op = { date: isoCourt(m[2]), valeur: isoCourt(m[4]), libelle: m[3].replace(/\s{2,}/g, ' ').trim(), montant: nombre(m[5]), credit, colLib, section }
        rel.ops.push(op)
        continue
      }
      const ind = l.search(/\S/)
      if (ind < 0) continue
      // Suite du libellé : alignée exactement sur le libellé de l'opération en cours
      if (op && ind === op.colLib) { op.libelle += ' ' + l.trim().replace(/\s{2,}/g, ' '); continue }
      // Titre de section (VIREMENTS RECUS, PAIEMENTS PAR CARTES…) : un cran à gauche du libellé
      if (/^[A-Z][A-Z ]+$/.test(l.trim()) && ind < 60) { section = l.trim(); op = null }
    }
  }
  return releves
}

export function controler(releves) {
  const erreurs = []
  releves.forEach((r, k) => {
    const sansCol = r.ops.filter(o => o.credit === null).length
    if (sansCol) erreurs.push(`${r.numero} : ${sansCol} montant(s) sans colonne débit/crédit repérée`)
    const deb = centimes(r.ops.filter(o => !o.credit).reduce((s, o) => s + o.montant, 0))
    const cre = centimes(r.ops.filter(o => o.credit).reduce((s, o) => s + o.montant, 0))
    if (r.totalDebit == null || deb !== centimes(r.totalDebit)) erreurs.push(`${r.numero} : débits lus ${fr(deb / 100)} ≠ total ${r.totalDebit}`)
    if (r.totalCredit == null || cre !== centimes(r.totalCredit)) erreurs.push(`${r.numero} : crédits lus ${fr(cre / 100)} ≠ total ${r.totalCredit}`)
    if (r.soldeDebut == null || r.soldeFin == null) erreurs.push(`${r.numero} : soldes d'en-tête illisibles`)
    else if (centimes(r.soldeDebut) + cre - deb !== centimes(r.soldeFin)) erreurs.push(`${r.numero} : solde ${fr(r.soldeDebut)} + crédits − débits ≠ ${fr(r.soldeFin)}`)
    if (r.soldeFinal != null && centimes(r.soldeFinal) !== centimes(r.soldeFin)) erreurs.push(`${r.numero} : solde de fin ${fr(r.soldeFinal)} ≠ en-tête ${fr(r.soldeFin)}`)
    const prec = releves[k - 1]
    if (prec && prec.soldeFin != null && r.soldeDebut != null && centimes(prec.soldeFin) !== centimes(r.soldeDebut)) erreurs.push(`${r.numero} : solde de début ${fr(r.soldeDebut)} ≠ fin du relevé précédent ${fr(prec.soldeFin)}`)
  })
  return erreurs
}

export function versCsv(releves, { avant } = {}) {
  const lignes = ['SDF;SDF;****;;;']
  let gardees = 0, ecartees = 0
  for (const r of releves) for (const o of r.ops) {
    if (avant && o.date >= avant) { ecartees++; continue }
    const carte = SECTION_CARTES.test(o.section)
    const lib = (carte ? `FACTURE CARTE ${o.libelle}` : o.libelle.replace(/^\*/, '')).replace(/;/g, ',')
    const t = carte ? ['FACTURE CARTE', 'PAIEMENT CB'] : (TYPES.find(([p]) => lib.startsWith(p + ' ') || lib === p) || [lib.split(' ').slice(0, 2).join(' '), 'AUTRE'])
    lignes.push([frDate(o.date), t[1], t[0], lib, frDate(o.valeur), fr(o.credit ? o.montant : -o.montant)].join(';'))
    gardees++
  }
  return { csv: '﻿' + lignes.join('\n') + '\n', gardees, ecartees }
}

// ---- Ligne de commande ----
if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  const args = process.argv.slice(2)
  const fichier = args.find(a => !a.startsWith('--'))
  const opt = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined }
  if (!fichier) { console.error('Usage : node compta/pdf-vers-csv.js <releves.pdf> [--avant AAAA-MM-JJ] [--sortie fichier.csv]'); process.exit(1) }
  const texte = execFileSync('pdftotext', ['-layout', fichier, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 })
  const releves = lirePdf(texte)
  const erreurs = controler(releves)
  const nbOps = releves.reduce((n, r) => n + r.ops.length, 0)
  console.log(`${releves.length} relevés, ${nbOps} opérations lues`)
  for (const r of releves) {
    const d = r.ops.filter(o => !o.credit).reduce((s, o) => s + o.montant, 0)
    const c = r.ops.filter(o => o.credit).reduce((s, o) => s + o.montant, 0)
    console.log(`  relevé ${r.numero} : ${String(r.ops.length).padStart(3)} op. · débits ${fr(d).padStart(12)} · crédits ${fr(c).padStart(12)} · solde ${fr(r.soldeDebut ?? NaN).padStart(12)} → ${fr(r.soldeFin ?? NaN).padStart(12)}`)
  }
  if (erreurs.length) { console.log(`\nCONTRÔLE ÉCHOUÉ (${erreurs.length}) :`); erreurs.forEach(e => console.log('  ' + e)); process.exit(1) }
  console.log('\nContrôle : chaque relevé tombe juste au centime (totaux, soldes, enchaînement).')
  const { csv, gardees, ecartees } = versCsv(releves, { avant: opt('avant') })
  const sortie = opt('sortie') || fichier.replace(/\.pdf$/i, '.csv')
  writeFileSync(sortie, csv)
  console.log(`${gardees} opérations écrites dans ${sortie}${ecartees ? ` (${ecartees} écartées, datées du ${opt('avant')} ou après)` : ''}`)
}
