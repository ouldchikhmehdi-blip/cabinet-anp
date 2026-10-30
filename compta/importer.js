#!/usr/bin/env node
// Import d'un relevé (OFX ou CSV natif BNP) dans la base Supabase du dashboard, depuis le mini PC.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node compta/importer.js <fichier.ofx|.csv> [--annee 2025] [--regles-locales]
//   (ou : node --env-file=.env compta/importer.js … si le .env porte ces deux variables)
//
// Même moteur que le dashboard (compta/moteur.js). Les règles sont lues dans la table
// compta_regles (source de vérité une fois le dashboard branché) ; --regles-locales
// force compta/regles.json et le pousse en base d'abord (amorçage ou restauration).
// Fusion avec la base comme dans le dashboard (planifierImport) : pas de doublon quand un
// CSV recouvre un OFX, libellés tronqués complétés, lignes classées à la main préservées.
// Le solde du relevé (LEDGERBAL de l'OFX ou en-tête du CSV) est enregistré dans compta_soldes.
//
// Rien de ce script n'écrit de donnée bancaire dans le dépôt.

import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { parserReleve, classerTout, preparerRegles, planifierImport, A_ARBITRER } from './moteur.js'

const args = process.argv.slice(2)
const fichier = args.find(a => !a.startsWith('--'))
const opt = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined }
const annee = opt('annee')
const reglesLocales = args.includes('--regles-locales')

if (!fichier || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Usage : SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node compta/importer.js <fichier.ofx|.csv> [--annee AAAA] [--regles-locales]')
  process.exit(1)
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const ICI = dirname(fileURLToPath(import.meta.url))

async function chargerDoc() {
  if (reglesLocales) {
    const doc = JSON.parse(readFileSync(join(ICI, 'regles.json'), 'utf8'))
    const { error } = await sb.from('compta_regles').upsert({ id: 1, doc }, { onConflict: 'id' })
    if (error) throw error
    console.log('regles.json poussé dans compta_regles')
    return doc
  }
  const { data, error } = await sb.from('compta_regles').select('doc').eq('id', 1).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Aucun document de règles en base : relancer avec --regles-locales pour amorcer')
  return data.doc
}

const doc = await chargerDoc()
const R = preparerRegles(doc)
const brut = readFileSync(fichier)
let texte
try { texte = new TextDecoder('utf-8', { fatal: true }).decode(brut) } catch { texte = new TextDecoder('latin1').decode(brut) }
let { format, lignes, solde } = parserReleve(texte)
if (annee) lignes = lignes.filter(l => l.date.startsWith(annee))
if (lignes.length === 0) { console.error(`Aucune ligne lue (format détecté : ${format})`); process.exit(1) }
const classees = classerTout(lignes, R)

// Lignes déjà en base sur la période du relevé (paginé : PostgREST plafonne à 1000)
const dates = classees.map(l => l.date).sort()
const connues = []
for (let depuis = 0; ; depuis += 1000) {
  const { data, error } = await sb.from('compta_transactions').select('fitid, date, montant, libelle, manuel')
    .gte('date', dates[0]).lte('date', dates[dates.length - 1]).order('fitid').range(depuis, depuis + 999)
  if (error) throw error
  connues.push(...data.map(t => ({ fitid: t.fitid, date: t.date, montant: Number(t.montant), memo: t.libelle, manuel: t.manuel })))
  if (data.length < 1000) break
}
const plan = planifierImport(classees, connues)
const rows = plan.ecrire.map(l => ({
  fitid: l.fitid, date: l.date, montant: l.montant, type: l.type, libelle: l.memo, tiers: l.tiers,
  groupe: l.groupe, categorie: l.categorie, associe: l.associe, regle: l.regle, alerte: l.alerte, fichier: basename(fichier),
}))
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await sb.from('compta_transactions').upsert(rows.slice(i, i + 500), { onConflict: 'fitid' })
  if (error) throw error
}
for (const { fitid, memo, tiers } of plan.libelles) {
  const { error } = await sb.from('compta_transactions').update({ libelle: memo, tiers }).eq('fitid', fitid)
  if (error) throw error
}
if (solde) {
  const { error } = await sb.from('compta_soldes').upsert({ ...solde, fichier: basename(fichier) }, { onConflict: 'date' })
  if (error) throw error
}
const st = plan.stats
console.log(`${format} : ${st.lues} lignes lues, ${st.nouvelles} nouvelles, ${st.enrichies} complétées, ${st.manuellesPreservees} manuelles préservées, ${plan.ecrire.filter(l => l.categorie === A_ARBITRER).length} à arbitrer${solde ? `, solde au ${solde.date} enregistré` : ''}`)
