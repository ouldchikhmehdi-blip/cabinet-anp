#!/usr/bin/env node
// Classement d'un relevé bancaire de la SARM (OFX ou CSV natif BNP) selon compta/regles.json.
//
//   node compta/classer.js <fichier.ofx|.csv> [--annee 2025] [--sortie ~/partage/compta/classe]
//
// Produit dans le dossier de sortie (hors dépôt git) :
//   - releve-<nom>-classe.csv : toutes les lignes avec groupe / catégorie / associé / règle / alerte
//   - a-arbitrer.csv          : les lignes qu'aucune règle sûre ne couvre
//   - rapport.md              : totaux, alertes, lignes à arbitrer, contrôle d'intégrité
//   - grand-livre.csv         : cumul de tous les imports, dédoublonné (FITID, ou date + montant
//                               + libellé quand un CSV recouvre un OFX) ; rapport-grand-livre.md
//
// Principe : une ligne qu'aucune règle ne couvre va dans « À arbitrer », jamais dans une
// catégorie par défaut. Pour un virement à un associé, le bénéficiaire fait foi sur le motif ;
// s'ils divergent, la ligne est classée d'après le bénéficiaire et mise en alerte.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { A_ARBITRER, parserOfx, parserReleve, fusionner, analyserLibelle, preparerRegles, classer, classerTout, lireSolde } from './moteur.js'

export { A_ARBITRER, parserOfx, analyserLibelle, preparerRegles, classer, classerTout, lireSolde }

// Les OFX BNP sont en Latin-1, les CSV en UTF-8 : on décode en UTF-8 si c'est valide, sinon Latin-1.
export function lireTexte(chemin) {
  const brut = readFileSync(chemin)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(brut) } catch { return new TextDecoder('latin1').decode(brut) }
}

const ICI = dirname(fileURLToPath(import.meta.url))
export const CHEMIN_REGLES = join(ICI, 'regles.json')

export function chargerRegles(chemin = CHEMIN_REGLES) {
  return preparerRegles(JSON.parse(readFileSync(chemin, 'utf8')))
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

// Grand livre : une ligne déjà connue (même FITID, ou même opération vue dans un autre
// format) garde son FITID d'origine ; elle prend le classement de l'import le plus récent,
// et son libellé le plus complet.
export function fusionnerGrandLivre(existant, nouvelles) {
  const { nouvelles: ajout, identiques, enrichies } = fusionner(existant, nouvelles)
  const parId = new Map(existant.map(l => [l.fitid, l]))
  for (const l of identiques) if (parId.has(l.fitid)) parId.set(l.fitid, l)
  for (const { existante, nouvelle } of enrichies) parId.set(existante.fitid, { ...nouvelle, fitid: existante.fitid })
  for (const l of ajout) parId.set(l.fitid, l)
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
    console.error('Usage : node compta/classer.js <fichier.ofx|.csv> [--annee 2025] [--sortie DOSSIER]')
    process.exit(1)
  }
  const annee = opt('annee')
  const sortie = opt('sortie') || join(homedir(), 'partage', 'compta', 'classe')
  const R = chargerRegles()

  let { format, lignes } = parserReleve(lireTexte(fichier))
  if (!lignes.length) { console.error(`Aucune ligne lue dans ${fichier} (format détecté : ${format})`); process.exit(1) }
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
  writeFileSync(join(sortie, 'rapport-grand-livre.md'), rapport(gl, R, { fichier: 'grand livre (tous imports)' }))

  const nbArb = classees.filter(l => l.categorie === A_ARBITRER).length
  console.log(`${classees.length} lignes classées (${nbArb} à arbitrer) → ${sortie}`)
  console.log(`grand-livre.csv : ${existant.length} → ${gl.length} lignes`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv)
