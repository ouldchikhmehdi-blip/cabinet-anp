// ============================================================
// comptaApi.js — accès Supabase de la comptabilité.
//
// Qui peut quoi est décidé par la RLS (supabase/compta.sql) : lecture pour tout
// associé actif en 2FA (acces_cabinet()), écriture pour les admins (is_admin()).
// Aucune fonction serverless : le navigateur lit l'OFX, classe avec le même moteur
// que le script local (compta/moteur.js) et écrit sous RLS.
// ============================================================
import { supabase } from '../lib/supabase'
import { parserOfx, classerTout, preparerRegles, lireSolde, A_ARBITRER } from '../../compta/moteur.js'

const CHAMPS = 'fitid, date, montant, type, libelle, tiers, groupe, categorie, associe, regle, alerte, manuel, fichier, importe_le, maj_le'
const PAGE = 1000

// ---- Règles (un seul document, id = 1) ----

export async function chargerDocRegles() {
  const { data, error } = await supabase.from('compta_regles').select('doc, maj_le').eq('id', 1).maybeSingle()
  if (error) throw error
  return data?.doc ?? null
}

export async function sauverDocRegles(doc) {
  const { error } = await supabase.from('compta_regles').upsert({ id: 1, doc }, { onConflict: 'id' })
  if (error) throw error
}

// ---- Transactions ----

export async function chargerTransactions() {
  const tout = []
  for (let depuis = 0; ; depuis += PAGE) {
    const { data, error } = await supabase
      .from('compta_transactions')
      .select(CHAMPS)
      .order('date')
      .order('fitid')
      .range(depuis, depuis + PAGE - 1)
    if (error) throw error
    tout.push(...(data ?? []).map(normaliser))
    if (!data || data.length < PAGE) break
  }
  return tout
}

const normaliser = (r) => ({ ...r, montant: Number(r.montant) })

export async function upsertTransactions(lignes) {
  for (let i = 0; i < lignes.length; i += 500) {
    const { error } = await supabase
      .from('compta_transactions')
      .upsert(lignes.slice(i, i + 500), { onConflict: 'fitid' })
    if (error) throw error
  }
}

// Catégorie posée à la main : `manuel` passe à true, le reclassement ne la touche plus.
export async function classerManuellement(fitid, { groupe, categorie, associe = '' }) {
  const { error } = await supabase
    .from('compta_transactions')
    .update({ groupe, categorie, associe, regle: 'manuel', alerte: '', manuel: true })
    .eq('fitid', fitid)
  if (error) throw error
}

export async function supprimerTransactions(fitids) {
  if (fitids.length === 0) return
  const { error } = await supabase.from('compta_transactions').delete().in('fitid', fitids)
  if (error) throw error
}

// ---- Soldes ----

export async function chargerSoldes() {
  const { data, error } = await supabase.from('compta_soldes').select('date, solde, fichier').order('date')
  if (error) throw error
  return (data ?? []).map(s => ({ ...s, solde: Number(s.solde) }))
}

export async function upsertSolde({ date, solde, fichier = '' }) {
  const { error } = await supabase.from('compta_soldes').upsert({ date, solde, fichier }, { onConflict: 'date' })
  if (error) throw error
}

// ---- Moteur appliqué aux lignes de la base ----

// Ligne de base → ligne moteur (le moteur parle `memo`, la base `libelle`)
const versMoteur = (t) => ({ date: t.date, montant: t.montant, type: t.type, memo: t.libelle, fitid: t.fitid })

// Ligne moteur classée → ligne de base
export function versBase(l, fichier = '') {
  return {
    fitid: l.fitid, date: l.date, montant: l.montant, type: l.type, libelle: l.memo, tiers: l.tiers,
    groupe: l.groupe, categorie: l.categorie, associe: l.associe, regle: l.regle, alerte: l.alerte,
    ...(fichier ? { fichier } : {}),
  }
}

/**
 * Importe un relevé OFX : lit, classe avec `doc`, écrit. Les lignes déjà classées à la
 * main (manuel = true) ne sont pas touchées. Enregistre le solde du relevé s'il y en a un.
 * Renvoie { total, nouvelles, aArbitrer, solde }.
 */
export async function importerOfx(texte, nomFichier, doc, { annee } = {}) {
  const R = preparerRegles(doc)
  let lignes = parserOfx(texte)
  if (annee) lignes = lignes.filter(l => l.date.startsWith(String(annee)))
  if (lignes.length === 0) throw new Error('Aucune ligne lue : est-ce bien un export OFX ?')
  const classees = classerTout(lignes, R)

  const { data: existantes, error } = await supabase
    .from('compta_transactions')
    .select('fitid, manuel')
    .in('fitid', classees.map(l => l.fitid))
  if (error) throw error
  const manuelles = new Set((existantes ?? []).filter(e => e.manuel).map(e => e.fitid))
  const connues = new Set((existantes ?? []).map(e => e.fitid))

  const aEcrire = classees.filter(l => !manuelles.has(l.fitid)).map(l => versBase(l, nomFichier))
  await upsertTransactions(aEcrire)

  const solde = lireSolde(texte)
  if (solde) await upsertSolde({ ...solde, fichier: nomFichier })

  return {
    total: classees.length,
    nouvelles: classees.filter(l => !connues.has(l.fitid)).length,
    aArbitrer: classees.filter(l => l.categorie === A_ARBITRER).length,
    solde,
  }
}

/**
 * Reclasse toutes les lignes non manuelles avec `doc` et n'écrit que celles qui changent.
 * Renvoie le nombre de lignes modifiées.
 */
export async function reclasserTout(doc, transactions) {
  const R = preparerRegles(doc)
  const candidates = transactions.filter(t => !t.manuel)
  const classees = classerTout(candidates.map(versMoteur), R)
  const changees = []
  classees.forEach((l, i) => {
    const t = candidates[i]
    if (l.groupe !== t.groupe || l.categorie !== t.categorie || l.associe !== t.associe || l.regle !== t.regle || l.alerte !== t.alerte || l.tiers !== t.tiers) {
      changees.push(versBase(l))
    }
  })
  await upsertTransactions(changees)
  return changees.length
}
