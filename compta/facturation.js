#!/usr/bin/env node
// Facturé / réglé par mois et facturé par chirurgien, depuis les justificatifs d'honoraires
// de la clinique (dossier Syncthing ~/partage/Facturés réglés/<année>/<année>.<mois>/*.xlsx)
// et les exports d'actes des associés (~/partage/*.xls, colonnes sejo.sejo_num_sej / med0.*).
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node compta/facturation.js --annee 2026 [--mois 2026.09]
//       [--dossier "~/partage/Facturés réglés"] [--actes ~/partage] [--sortie ~/partage/facturation] [--sans-base]
//   (ou : node --env-file=.env compta/facturation.js … si le .env porte les deux variables)
//
// Ces fichiers portent des NOMS DE PATIENTS : ils ne quittent jamais le mini PC. Seuls des
// agrégats (mois × associé × établissement ; mois × chirurgien) partent en base. Les lignes mises
// de côté (séjour non retrouvé, sans chirurgien, à arbitrer) et les chirurgiens hors de
// src/data/facturationChirurgiens.js sont écrits dans un classeur local, hors dépôt, pour arbitrage.
// Un mois rejoué est effacé puis réécrit (les deux tables).

import { readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import { nomFichier, lireJustificatif, lireActes, indexerSejours, agreger, estBucket } from './facturationMoteur.js'
import { praticienDe, nomFamille } from '../src/data/facturationChirurgiens.js'

const args = process.argv.slice(2)
const opt = (n, def) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : def }
const tilde = (p) => p.replace(/^~(?=$|\/)/, homedir())
const annee = Number(opt('annee'))
const moisSeul = opt('mois')                      // ex. 2026.09
const dossier = tilde(opt('dossier', '~/partage/Facturés réglés'))
const dossierActes = tilde(opt('actes', '~/partage'))
const sortie = tilde(opt('sortie', '~/partage/facturation'))
const sansBase = args.includes('--sans-base')

if (!annee || (!sansBase && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY))) {
  console.error('Usage : SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node compta/facturation.js --annee AAAA [--mois AAAA.MM] [--dossier …] [--actes …] [--sortie …] [--sans-base]')
  process.exit(1)
}

const feuille = (chemin) => {
  const wb = XLSX.readFile(chemin, { cellDates: true })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
}

// ---- 1. Index séjour → chirurgien, depuis tous les exports d'actes du dossier ----
const actes = []
for (const f of readdirSync(dossierActes).filter(f => /\.xlsx?$/i.test(f) && !nomFichier(f))) {
  const rows = feuille(join(dossierActes, f))
  const lus = lireActes(rows)
  if (lus.length) { actes.push(...lus); console.log(`actes : ${f} → ${lus.length} lignes`) }
}
const index = indexerSejours(actes)
console.log(`${index.size} séjours indexés`)

// ---- 2. Justificatifs du ou des mois ----
const dossierAnnee = join(dossier, String(annee))
if (!existsSync(dossierAnnee)) { console.error(`Dossier introuvable : ${dossierAnnee}`); process.exit(1) }
const moisDispos = readdirSync(dossierAnnee).filter(m => /^\d{4}\.\d{2}$/.test(m) && (!moisSeul || m === moisSeul)).sort()
const justificatifs = []
for (const m of moisDispos) {
  for (const f of readdirSync(join(dossierAnnee, m)).sort()) {
    const info = nomFichier(f)
    if (!info) continue
    try {
      const j = lireJustificatif(feuille(join(dossierAnnee, m, f)), { type: info.type })
      if (j.annee !== annee || `${j.annee}.${String(j.mois).padStart(2, '0')}` !== m) throw new Error(`période ${j.annee}-${j.mois} ≠ dossier ${m}`)
      justificatifs.push({ ...j, ...info, fichier: f })
    } catch (e) { console.error(`${m}/${f} : ${e.message}`); process.exit(1) }
  }
}
if (justificatifs.length === 0) { console.error('Aucun justificatif lu'); process.exit(1) }

const r = agreger(justificatifs, index)

// ---- 3. Rapport (agrégats seulement) + classeur des lignes mises de côté (local, hors dépôt) ----
mkdirSync(sortie, { recursive: true })
const eur = (v) => Math.round(v).toLocaleString('fr-FR') + ' €'
const pct = (a, b) => b ? Math.round(a / b * 100) + ' %' : '–'
const lignesRapport = [`# Facturation ${annee} — rapport du ${new Date().toISOString().slice(0, 10)}`, '',
  `${justificatifs.length} fichiers lus (${justificatifs.filter(j => j.type === 'FAC').length} FAC, ${justificatifs.filter(j => j.type === 'RED').length} RED), ${index.size} séjours indexés.`, '',
  '| Mois | Facturé | Réglé | Redevance TTC | Attribué | Consultations | Sans chirurgien | Séjour inconnu | À arbitrer |', '|---|---|---|---|---|---|---|---|---|']
for (const c of r.controle) {
  const [y, m] = c.mois.split('-').map(Number)
  const men = r.mensuel.filter(x => x.annee === y && x.mois === m)
  const regle = men.reduce((s, x) => s + x.regle_total, 0), redev = men.reduce((s, x) => s + x.redevance_ttc, 0)
  const b = c.buckets
  lignesRapport.push(`| ${y}-${String(m).padStart(2, '0')} | ${eur(c.facture)} | ${eur(regle)} | ${eur(redev)} | ${eur(c.attribue)} (${pct(c.attribue, c.facture)}) | ${eur(b.__consultations || 0)} | ${eur(b.__sans_chirurgien || 0)} | ${eur(b.__sejour_inconnu || 0)} | ${eur(b.__a_arbitrer || 0)} |`)
}
const cumul = {}
for (const c of r.chirurgiens) if (!estBucket(c.chirurgien)) cumul[c.chirurgien] = (cumul[c.chirurgien] || 0) + c.montant
const horsTable = Object.entries(cumul).filter(([k]) => !praticienDe(k)).sort((a, b) => b[1] - a[1])
lignesRapport.push('', `## Chirurgiens hors de facturationChirurgiens.js (${horsTable.length}) — à classer`, '')
for (const [k, v] of horsTable) lignesRapport.push(`- ${k} : ${eur(v)}`)
lignesRapport.push('', '## Facturé par chirurgien (cumul de l\'année)', '')
for (const [k, v] of Object.entries(cumul).sort((a, b) => b[1] - a[1])) lignesRapport.push(`- ${k}${praticienDe(k) ? '' : ' (à classer)'} : ${eur(v)}`)
writeFileSync(join(sortie, `${annee}-rapport.md`), lignesRapport.join('\n') + '\n')

const wb = XLSX.utils.book_new()
const colonnes = (l) => ({ Mois: `${l.annee}-${String(l.mois).padStart(2, '0')}`, Associé: l.associe, Établissement: l.etablissement, Motif: l.motif, 'N° séjour': l.sejour, Nom: l.nom, Prénom: l.prenom, 'Code acte': l.code, 'Date acte': l.dateActe, 'Date facture': l.date, 'Mt DH': l.dh, 'Mt AMO': l.amo, 'Mt AMC': l.amc, 'Mt Pat': l.pat, 'Mt Total': l.total })
const feuilles = [['Séjour non retrouvé', '__sejour_inconnu'], ['Sans chirurgien', '__sans_chirurgien'], ['À arbitrer', '__a_arbitrer']]
for (const [nom, bucket] of feuilles) {
  const lignes = r.misDeCote.filter(l => l.bucket === bucket).map(colonnes)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes.length ? lignes : [{ Info: 'aucune ligne' }]), nom)
}
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(horsTable.length ? horsTable.map(([k, v]) => ({ Chirurgien: k, 'Nom de famille': nomFamille(k), 'Facturé (année)': v })) : [{ Info: 'aucun' }]), 'Chirurgiens à classer')
XLSX.writeFile(wb, join(sortie, `${annee}-mis-de-cote.xlsx`))
console.log(lignesRapport.slice(0, 6 + r.controle.length).join('\n'))
console.log(`\n${r.misDeCote.length} lignes mises de côté, ${horsTable.length} chirurgiens à classer → ${sortie}/${annee}-mis-de-cote.xlsx et ${annee}-rapport.md`)

// ---- 4. Base : un mois rejoué est effacé puis réécrit ----
if (sansBase) { console.log('--sans-base : rien n\'est écrit en base'); process.exit(0) }
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const moisTouches = [...new Set(r.mensuel.map(x => x.mois))]
for (const table of ['facturation_mensuelle', 'facturation_chirurgiens']) {
  const { error } = await sb.from(table).delete().eq('annee', annee).in('mois', moisTouches)
  if (error) throw error
}
const importe_le = new Date().toISOString()
for (const [table, rows] of [['facturation_mensuelle', r.mensuel], ['facturation_chirurgiens', r.chirurgiens]]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(table).insert(rows.slice(i, i + 500).map(x => ({ ...x, importe_le })))
    if (error) throw error
  }
  console.log(`${table} : ${rows.length} lignes écrites (${moisTouches.length} mois)`)
}
