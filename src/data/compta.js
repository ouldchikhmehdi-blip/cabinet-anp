// ============================================================
// compta.js — les séries mensuelles des pages finance, calculées depuis les lignes
// bancaires classées (table compta_transactions), plus un petit magasin partagé.
//
// CONTRAT DES SÉRIES (ce que les pages consomment, même forme que l'ancien mock) :
//   series.ANNEES                 années disponibles, décroissantes, toujours ≥ 2
//   series.CA[y][m]               recettes d'activité : honoraires clinique + tiers payant + CPAM hors TP
//   series.CHARGES[y][m]          charges (positives) : remplaçants + salariés + charges sociales/fiscales + fonctionnement
//   series.RETRO_FIXE[y][m]       reversement mensuel / associé (total ÷ nombre d'associés)
//   series.RETRO_VARIABLE[y][m]   (complément + reliquat + régularisation) / associé
//   series.RETRO_PAR_ASSOCIE[y]   { [initiales]: { fixe, complement, reliquat, regularisation, rcp, frais, recu, total } }
//   series.REMPL_IADE[y][m]       remplaçants IADE (CDD), positif
//   series.REMPL_MAR[y][m]        remplaçants MAR + frais de remplaçant, positif
//   series.ENTREES[y][m]          tous les crédits
//   series.SORTIES[y][m]          tous les débits, positif
//   series.SOLDES[y][m]           solde en fin de mois (ancré sur compta_soldes), null si inconnu
//   series.NON_CLASSE[y][m]       débits « À arbitrer », positif
//   series.PAR_CATEGORIE[y][cat]  [12] signé (crédits +, débits −)
//   series.SALARIES               [{ id, initiales, nom, poste, type, couts: {y}, mensuel: {y: [12]} }]
//   series.DEPENSES               [{ id, nom, groupe, couleur, montants: {y: [12]} }]
//   series.moisActuel(y)          dernier mois (0-11) ayant des lignes pour l'année y
// ============================================================
import { useEffect, useReducer } from 'react'
import { chargerDocRegles, chargerTransactions, chargerSoldes } from './comptaApi'
import { groupeDe, TAXONOMIE } from './categories'

const VIDE = () => Array(12).fill(0)
const CAT_CA = ['Honoraires clinique', 'Tiers payant consultations', 'Versements CPAM hors tiers payant']
const GROUPES_CHARGES = ['Remplaçants', 'Salariés', 'Charges sociales et fiscales', 'Fonctionnement']
const PALETTE = ['#534AB7', '#1D9E75', '#D85A30', '#EF9F27', '#0C447C', '#712B13', '#633806', '#3C3489', '#085041', '#A32D2D', '#444441', '#8C8C86', '#2B7FB8']

const titre = (s) => s.toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase())
const nomDepuisMotif = (pat) => titre(pat.replace(/\[.*?\]\??|\?|\(|\)|\^|\$/g, '').replace(/\|.*$/, ''))

export function calculerSeries(transactions, soldes = [], doc = null) {
  const parAnnee = {}
  for (const t of transactions) (parAnnee[t.date.slice(0, 4)] ||= []).push(t)
  let annees = Object.keys(parAnnee).map(Number).sort((a, b) => b - a)
  if (annees.length === 0) annees = [new Date().getFullYear()]
  if (annees.length === 1) annees = [annees[0], annees[0] - 1]

  const serie = (y, filtre, signe = 1) => {
    const s = VIDE()
    for (const t of parAnnee[y] || []) if (filtre(t)) s[Number(t.date.slice(5, 7)) - 1] += signe * t.montant
    return s.map(v => Math.round(v * 100) / 100)
  }
  const nbAssocies = Object.keys(doc?.associes || {}).length || 8

  const CA = {}, CHARGES = {}, RETRO_FIXE = {}, RETRO_VARIABLE = {}, RETRO_PAR_ASSOCIE = {}, REMPL_IADE = {}, REMPL_MAR = {}
  const ENTREES = {}, SORTIES = {}, SOLDES = {}, NON_CLASSE = {}, PAR_CATEGORIE = {}
  for (const y of annees) {
    CA[y] = serie(y, t => CAT_CA.includes(t.categorie))
    CHARGES[y] = serie(y, t => GROUPES_CHARGES.includes(t.groupe) && t.montant < 0, -1)
    RETRO_FIXE[y] = serie(y, t => t.categorie === 'Reversement mensuel', -1).map(v => Math.round(v / nbAssocies))
    RETRO_VARIABLE[y] = serie(y, t => ["Complément d'honoraires", 'Reliquat exercice précédent', 'Régularisation'].includes(t.categorie), -1).map(v => Math.round(v / nbAssocies))
    REMPL_IADE[y] = serie(y, t => t.categorie === 'Remplaçant IADE (CDD)', -1)
    REMPL_MAR[y] = serie(y, t => t.categorie === 'Remplaçant MAR' || t.categorie === 'Frais de remplaçant', -1)
    ENTREES[y] = serie(y, t => t.montant > 0)
    SORTIES[y] = serie(y, t => t.montant < 0, -1)
    NON_CLASSE[y] = serie(y, t => t.groupe === 'À arbitrer' && t.montant < 0, -1)
    PAR_CATEGORIE[y] = {}
    for (const g of TAXONOMIE) for (const c of g.sous) {
      const s = serie(y, t => t.categorie === c)
      if (s.some(v => v !== 0)) PAR_CATEGORIE[y][c] = s
    }
    const assos = {}
    for (const t of parAnnee[y] || []) {
      if (!t.associe || t.associe === '?') continue
      const a = (assos[t.associe] ||= { fixe: 0, complement: 0, reliquat: 0, regularisation: 0, rcp: 0, frais: 0, recu: 0, total: 0 })
      const v = -t.montant
      if (t.categorie === "Complément d'honoraires") a.complement += v
      else if (t.categorie === 'Reliquat exercice précédent') a.reliquat += v
      else if (t.categorie === 'Régularisation') a.regularisation += v
      else if (t.categorie === 'Remboursement RCP') a.rcp += v
      else if (t.categorie === 'Remboursement de frais avancés' || t.categorie === 'Frais de remplaçant') a.frais += v
      else if (t.categorie === 'Remboursement reçu') a.recu += v
      a.total += v
    }
    const fixeParAssocie = RETRO_FIXE[y].reduce((s, v) => s + v, 0)
    for (const ini of Object.keys(doc?.associes || assos)) {
      const a = (assos[ini] ||= { fixe: 0, complement: 0, reliquat: 0, regularisation: 0, rcp: 0, frais: 0, recu: 0, total: 0 })
      a.fixe = fixeParAssocie
      a.total += fixeParAssocie
    }
    RETRO_PAR_ASSOCIE[y] = assos
    SOLDES[y] = soldesFinDeMois(y, transactions, soldes)
  }

  // Salariés CDI : une carte par nom de iade_cdi, coût = virements « Salaire IADE CDI »
  const SALARIES = (doc?.iade_cdi || []).map((pat, i) => {
    const rx = new RegExp(`(?:^|[^A-Z])(?:${pat})(?:$|[^A-Z])`, 'i')
    const nom = nomDepuisMotif(pat)
    const mensuel = {}, couts = {}
    for (const y of annees) {
      mensuel[y] = serie(y, t => t.categorie === 'Salaire IADE CDI' && (rx.test(t.libelle) || rx.test(t.tiers)), -1)
      couts[y] = Math.round(mensuel[y].reduce((s, v) => s + v, 0))
    }
    return { id: `cdi-${i}`, initiales: nom.slice(0, 2).toUpperCase(), nom, poste: 'IADE', type: 'CDI', couts, mensuel }
  })

  // Dépenses : une série par sous-catégorie de charges sociales/fiscales et de fonctionnement
  const DEPENSES = []
  let k = 0
  for (const g of TAXONOMIE.filter(g => ['Charges sociales et fiscales', 'Fonctionnement'].includes(g.groupe))) {
    for (const c of g.sous) {
      const montants = {}
      for (const y of annees) montants[y] = serie(y, t => t.categorie === c && t.montant < 0, -1)
      if (Object.values(montants).some(s => s.some(v => v !== 0))) {
        DEPENSES.push({ id: c, nom: c, groupe: g.groupe, couleur: PALETTE[k++ % PALETTE.length], montants })
      }
    }
  }

  const moisActuel = (y) => {
    const lignes = parAnnee[y] || []
    if (lignes.length === 0) return Math.max(0, new Date().getMonth() - 1)
    return Math.max(...lignes.map(t => Number(t.date.slice(5, 7)) - 1))
  }

  return { ANNEES: annees, CA, CHARGES, RETRO_FIXE, RETRO_VARIABLE, RETRO_PAR_ASSOCIE, REMPL_IADE, REMPL_MAR, ENTREES, SORTIES, SOLDES, NON_CLASSE, PAR_CATEGORIE, SALARIES, DEPENSES, moisActuel, nbAssocies, groupeDe }
}

// Solde en fin de chaque mois de l'année y, à partir de l'ancre la plus récente
// (LEDGERBAL d'un relevé) et des mouvements. null quand aucune ancre n'existe.
export function soldesFinDeMois(y, transactions, soldes) {
  if (!soldes || soldes.length === 0) return Array(12).fill(null)
  const ancre = soldes[soldes.length - 1]
  const tri = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  const soldeA = (jour) => {
    if (jour >= ancre.date) {
      return ancre.solde + tri.filter(t => t.date > ancre.date && t.date <= jour).reduce((s, t) => s + t.montant, 0)
    }
    return ancre.solde - tri.filter(t => t.date > jour && t.date <= ancre.date).reduce((s, t) => s + t.montant, 0)
  }
  const premiere = tri[0]?.date
  return Array.from({ length: 12 }, (_, m) => {
    const fin = `${y}-${String(m + 1).padStart(2, '0')}-31`
    // Pas de solde avant la première ligne connue : on ne sait pas
    if (premiere && fin < premiere.slice(0, 7) + '-01') return null
    return Math.round(soldeA(fin) * 100) / 100
  })
}

// ---- Magasin partagé : chargé une fois, partagé par toutes les pages ----

let etat = { statut: 'vide', transactions: [], soldes: [], doc: null, series: calculerSeries([]), erreur: null }
const abonnes = new Set()
const publier = () => abonnes.forEach(f => f())

export function etatCompta() { return etat }

export async function rechargerCompta() {
  etat = { ...etat, statut: 'chargement', erreur: null }
  publier()
  try {
    const [doc, transactions, soldes] = await Promise.all([chargerDocRegles(), chargerTransactions(), chargerSoldes()])
    etat = { statut: 'pret', doc, transactions, soldes, series: calculerSeries(transactions, soldes, doc), erreur: null }
  } catch (e) {
    etat = { ...etat, statut: 'erreur', erreur: e?.message || String(e) }
  }
  publier()
  return etat
}

// Après une écriture locale (règles sauvées, ligne classée) : recalcule sans refaire tout le réseau
export function majComptaLocale({ doc, transactions, soldes } = {}) {
  etat = {
    ...etat,
    doc: doc ?? etat.doc,
    transactions: transactions ?? etat.transactions,
    soldes: soldes ?? etat.soldes,
  }
  etat.series = calculerSeries(etat.transactions, etat.soldes, etat.doc)
  publier()
}

export function useCompta() {
  const [, forcer] = useReducer(x => x + 1, 0)
  useEffect(() => {
    abonnes.add(forcer)
    if (etat.statut === 'vide') rechargerCompta()
    return () => abonnes.delete(forcer)
  }, [])
  return etat
}
