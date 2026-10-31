#!/usr/bin/env node
// Facturé / réglé par mois et facturé par chirurgien, depuis les justificatifs d'honoraires
// de la clinique (dossier Syncthing ~/partage/Facturés réglés/<année>/<année>.<mois>/*.xlsx)
// et les exports d'actes des associés (~/partage/*.xls, colonnes sejo.sejo_num_sej / med0.*).
// Quand un séjour n'est pas dans ces exports (2025, actes de l'année précédente), le chirurgien est
// cherché dans les exports Diane des CPA déposés au même endroit (feuille « Résultats », colonnes
// nom / nom marital / prénom / date bloc / Chirurgien) : même patient, date de bloc dans le séjour.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node compta/facturation.js --annee 2026 [--mois 2026.09]
//       [--dossier "~/partage/Facturés réglés"] [--actes ~/partage] [--sortie ~/partage/facturation] [--sans-base]
//   (ou : node --env-file=.env compta/facturation.js … si le .env porte les deux variables ;
//    ou encore --sql <fichier.sql> pour obtenir les mêmes écritures à coller dans le SQL Editor)
//
// Ces fichiers portent des NOMS DE PATIENTS : ils ne quittent jamais le mini PC. Seuls des
// agrégats (mois × associé × établissement ; mois × chirurgien) partent en base. Les lignes mises
// de côté (séjour non retrouvé, sans chirurgien, à arbitrer) et les chirurgiens hors de
// src/data/facturationChirurgiens.js sont écrits dans un classeur local, hors dépôt, pour arbitrage.
// Un mois rejoué est effacé puis réécrit (les deux tables). En --sql : insertion ou mise à jour,
// et mise à zéro des chirurgiens du mois qui ont disparu (aucun delete, accepté par le connecteur).

import { readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import { nomFichier, lireJustificatif, lireActes, indexerSejours, agreger, estBucket, lireCpa, construireAnnuaire, completerParCpa, historiquePatients } from './facturationMoteur.js'
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
const sqlFichier = opt('sql') ? tilde(opt('sql')) : null

if (!annee || (!sansBase && !sqlFichier && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY))) {
  console.error('Usage : SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node compta/facturation.js --annee AAAA [--mois AAAA.MM] [--dossier …] [--actes …] [--sortie …] [--sans-base | --sql <fichier.sql>]')
  process.exit(1)
}

const feuilles = (chemin) => {
  const wb = XLSX.readFile(chemin, { cellDates: true })
  return wb.SheetNames.map(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null }))
}
const feuille = (chemin) => feuilles(chemin)[0]

// ---- 1. Index séjour → chirurgien (exports d'actes) et consultations d'anesthésie (exports CPA) ----
const actes = [], cpas = []
for (const f of readdirSync(dossierActes).filter(f => /\.xlsx?$/i.test(f) && !nomFichier(f))) {
  for (const rows of feuilles(join(dossierActes, f))) {
    const lus = lireActes(rows)
    if (lus.length) { actes.push(...lus); console.log(`actes : ${f} → ${lus.length} lignes`); continue }
    const c = lireCpa(rows)
    if (c.length) { cpas.push(...c); console.log(`CPA : ${f} → ${c.length} consultations`) }
  }
}
const indexActes = indexerSejours(actes)
console.log(`${indexActes.size} séjours indexés par les exports d'actes`)

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

// Séjours absents des exports d'actes : rattachement par la CPA (nom, prénom, date de bloc)
const annuaire = construireAnnuaire(actes.map(a => ({ nom: a.nom, prenom: a.prenom })), cpas.map(c => c.chirurgien))
const lignesFac = justificatifs.filter(j => j.type === 'FAC').flatMap(j => j.lignes)
const { index, viaCpa } = completerParCpa(indexActes, lignesFac, cpas, annuaire)
console.log(`${viaCpa.size} séjours rattachés par la CPA`)

// YYYY400 : spécialité par l'acte du même jour, praticien par les autres séjours et CPA du patient.
// Un bucket de spécialité (Léon, Warthmann) n'est ni gardé comme « gastro » ni proposé comme candidat.
const historique = historiquePatients(actes, cpas, annuaire)
const specDe = (cle) => { const p = praticienDe(cle); return p && !p.bucket ? p.spec : null }
const r = agreger(justificatifs, index, { viaCpa, historique, specDe })

// ---- 3. Rapport (agrégats seulement) + classeur des lignes mises de côté (local, hors dépôt) ----
mkdirSync(sortie, { recursive: true })
const eur = (v) => Math.round(v).toLocaleString('fr-FR') + ' €'
const pct = (a, b) => b ? Math.round(a / b * 100) + ' %' : '–'
const lignesRapport = [`# Facturation ${annee} — rapport du ${new Date().toISOString().slice(0, 10)}`, '',
  `${justificatifs.length} fichiers lus (${justificatifs.filter(j => j.type === 'FAC').length} FAC, ${justificatifs.filter(j => j.type === 'RED').length} RED), ${indexActes.size} séjours dans les exports d'actes, ${cpas.length} CPA, ${viaCpa.size} séjours rattachés par la CPA.`, '',
  '| Mois | Facturé | Réglé | Redevance TTC | Attribué | dont par la CPA | Consultations | Réanimation / USC | Séjour inconnu | À arbitrer | Spécialité sans praticien |', '|---|---|---|---|---|---|---|---|---|---|---|']
for (const c of r.controle) {
  const [y, m] = c.mois.split('-').map(Number)
  const men = r.mensuel.filter(x => x.annee === y && x.mois === m)
  const regle = men.reduce((s, x) => s + x.regle_total, 0), redev = men.reduce((s, x) => s + x.redevance_ttc, 0)
  const b = c.buckets
  lignesRapport.push(`| ${y}-${String(m).padStart(2, '0')} | ${eur(c.facture)} | ${eur(regle)} | ${eur(redev)} | ${eur(c.attribue)} (${pct(c.attribue, c.facture)}) | ${eur(c.parCpa)} | ${eur(b.__consultations || 0)} | ${eur(b.__reanimation || 0)} | ${eur(b.__sejour_inconnu || 0)} | ${eur(b.__a_arbitrer || 0)} | ${eur(Object.entries(b).filter(([k]) => k.startsWith('__spec_')).reduce((s, [, v]) => s + v, 0))} |`)
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
const ongletsMisDeCote = [['Séjour non retrouvé', '__sejour_inconnu'], ['À arbitrer', '__a_arbitrer']]
for (const [nom, bucket] of ongletsMisDeCote) {
  const lignes = r.misDeCote.filter(l => l.bucket === bucket).map(colonnes)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes.length ? lignes : [{ Info: 'aucune ligne' }]), nom)
}
const rattaches = r.rattachements.map(l => ({ ...colonnes(l), 'Rattaché à': l.chirurgien }))
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rattaches.length ? rattaches : [{ Info: 'aucune ligne' }]), 'YYYY400 rattachés')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(horsTable.length ? horsTable.map(([k, v]) => ({ Chirurgien: k, 'Nom de famille': nomFamille(k), 'Facturé (année)': v })) : [{ Info: 'aucun' }]), 'Chirurgiens à classer')
XLSX.writeFile(wb, join(sortie, `${annee}-mis-de-cote.xlsx`))
console.log(lignesRapport.slice(0, 6 + r.controle.length).join('\n'))
console.log(`\n${r.misDeCote.length} lignes mises de côté, ${horsTable.length} chirurgiens à classer → ${sortie}/${annee}-mis-de-cote.xlsx et ${annee}-rapport.md`)

// ---- 4. Base : un mois rejoué est effacé puis réécrit ----
const moisTouches = [...new Set(r.mensuel.map(x => x.mois))]
// --sql <fichier> : mêmes écritures, en SQL à coller dans le SQL Editor (quand la clé service role manque)
if (sqlFichier) {
  const q = (v) => (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
  // Insertion ou mise à jour (pas de delete : le connecteur Supabase les refuse), puis mise à zéro
  // des lignes du mois absentes du nouveau calcul (chirurgien disparu après un meilleur rattachement).
  const lignes = [`-- Facturation ${annee}, généré le ${new Date().toISOString().slice(0, 10)} par compta/facturation.js`]
  const tables = [
    ['facturation_mensuelle', r.mensuel, ['annee', 'mois', 'associe', 'etablissement']],
    ['facturation_chirurgiens', r.chirurgiens, ['annee', 'mois', 'chirurgien']],
  ]
  for (const [table, rows, pk] of tables) {
    const cols = Object.keys(rows[0])
    const maj = [...cols.filter(c => !pk.includes(c)).map(c => `${c} = excluded.${c}`), 'importe_le = now()'].join(', ')
    for (let i = 0; i < rows.length; i += 200) {
      lignes.push(`insert into public.${table} (${cols.join(', ')}) values\n` + rows.slice(i, i + 200).map(x => `(${cols.map(c => q(x[c])).join(', ')})`).join(',\n') + `\non conflict (${pk.join(', ')}) do update set ${maj};`)
    }
  }
  for (const mois of moisTouches) {
    const cles = r.chirurgiens.filter(x => x.mois === mois).map(x => q(x.chirurgien))
    lignes.push(`update public.facturation_chirurgiens set montant = 0, nb_lignes = 0, nb_sejours = 0, importe_le = now() where annee = ${annee} and mois = ${mois} and chirurgien not in (${cles.join(', ')});`)
    const ae = r.mensuel.filter(x => x.mois === mois).map(x => `(${q(x.associe)}, ${q(x.etablissement)})`)
    lignes.push(`update public.facturation_mensuelle set facture_total = 0, facture_dh = 0, facture_amo = 0, facture_amc = 0, facture_pat = 0, regle_total = 0, regle_conv = 0, regle_dh = 0, redevance_ttc = 0, nb_lignes_fac = 0, nb_lignes_red = 0, importe_le = now() where annee = ${annee} and mois = ${mois} and (associe, etablissement) not in (${ae.join(', ')});`)
  }
  writeFileSync(sqlFichier, lignes.join('\n') + '\n')
  console.log(`SQL écrit dans ${sqlFichier} (${r.mensuel.length} + ${r.chirurgiens.length} lignes)`)
  process.exit(0)
}
if (sansBase) { console.log('--sans-base : rien n\'est écrit en base'); process.exit(0) }
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
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
