// ============================================================
// recettes.js — détail du chiffre d'affaires (page « Chiffre d'affaires ») : d'où vient chaque euro.
//
// Le CA (CAT_CA de compta.js) est découpé par source de versement :
//   - Clinique du Millénaire (compte médecins) et Clinique Clémentville (catégorie « Honoraires clinique »)
//   - Tiers payant (catégorie « Tiers payant consultations »), lui-même détaillé par caisse,
//     les caisses étant rangées par famille (CPAM, MSA, mutuelles et régimes spéciaux, autres)
//   - CPAM hors tiers payant (permanence des soins, forfaits)
// Tout est calculé depuis les lignes du relevé ; la somme des sources = series.CA.
// ============================================================
import { CAT_CA } from './compta'

export const SOURCES = [
  { id: 'millenaire', nom: 'Clinique du Millénaire', couleur: '#534AB7' },
  { id: 'clementville', nom: 'Clinique Clémentville', couleur: '#8F87D9' },
  { id: 'tiersPayant', nom: 'Tiers payant', couleur: '#1D9E75' },
  { id: 'cpamHorsTp', nom: 'CPAM hors tiers payant', couleur: '#EF9F27' },
]

export const FAMILLES_TP = [
  { id: 'cpam', nom: 'CPAM et caisses générales' },
  { id: 'msa', nom: 'MSA' },
  { id: 'speciaux', nom: 'Mutuelles et régimes spéciaux' },
  { id: 'autres', nom: 'Autres payeurs' },
]

const VIDE = () => Array(12).fill(0)
const arrondi = (v) => Math.round(v * 100) / 100
const mois = (t) => Number(t.date.slice(5, 7)) - 1

/** Source d'une ligne du relevé (id de SOURCES), ou null si elle n'est pas dans le CA. */
export function sourceDe(t) {
  if (!CAT_CA.includes(t.categorie)) return null
  if (t.categorie === 'Tiers payant consultations') return 'tiersPayant'
  if (t.categorie === 'Versements CPAM hors tiers payant') return 'cpamHorsTp'
  return /CLEMENTVILLE/i.test(`${t.tiers || ''} ${t.libelle || ''}`) ? 'clementville' : 'millenaire'
}

/** Nom de caisse stable : les variantes d'un même payeur (points, abréviations) sont regroupées. */
export function nomCaisse(tiers) {
  const s = String(tiers || '').toUpperCase().replace(/\./g, '').replace(/\bC P A M\b/g, 'CPAM').replace(/\s+/g, ' ').trim()
  if (!s) return 'Payeur non renseigné'
  if (/CPAM/.test(s) && /HERAU/.test(s)) return 'CPAM DE L HERAULT'
  if (/CPAM/.test(s) && /GARD/.test(s)) return 'CPAM DU GARD'
  if (/^MGEN$|MUTUELLE GENERALE EDUCATION NATIONALE/.test(s)) return 'MGEN'
  if (/CNMSS/.test(s)) return 'CNMSS'
  if (/^C ?R ?P ?C ?E ?N/.test(s)) return 'CRPCEN'
  if (/CCSS/.test(s) && /LOZERE/.test(s)) return 'CCSS DE LA LOZERE'
  return s
}

/** Famille d'une caisse de tiers payant (id de FAMILLES_TP). */
export function familleCaisse(nom) {
  const s = nomCaisse(nom)
  if (/\bMSA\b|MUTUALITE SOCIALE AGRICOLE/.test(s)) return 'msa'
  if (/MGEN|MUTUELLE|CAMIEG|CNMSS|^CPR\b|CRPCEN|CPRPF|ENIM|INTERIALE|SENAT|ASSEMBLEE NATIONALE|MINES|RATP|CAVIMAC|MGP|PREVOYANCE/.test(s)) return 'speciaux'
  if (/CPAM|CPCAM|CGSS|CCSS|SECURITE SOCIALE|ASSURANCE MALADIE/.test(s)) return 'cpam'
  return 'autres'
}

/**
 * Détail du CA d'une année : { parSource: {id: [12]}, total: [12], familles: [{ id, nom, mois: [12],
 * caisses: [{ nom, mois: [12], n }] }] } — familles et caisses triées par montant décroissant.
 */
export function detailRecettes(transactions, annee) {
  const parSource = Object.fromEntries(SOURCES.map(s => [s.id, VIDE()]))
  const caisses = new Map()
  for (const t of transactions) {
    if (!t.date.startsWith(`${annee}-`)) continue
    const src = sourceDe(t)
    if (!src) continue
    const m = mois(t)
    parSource[src][m] += t.montant
    if (src === 'tiersPayant') {
      const nom = nomCaisse(t.tiers)
      if (!caisses.has(nom)) caisses.set(nom, { nom, mois: VIDE(), n: 0 })
      const c = caisses.get(nom)
      c.mois[m] += t.montant; c.n += 1
    }
  }
  for (const id of Object.keys(parSource)) parSource[id] = parSource[id].map(arrondi)
  const total = VIDE().map((_, m) => arrondi(SOURCES.reduce((s, src) => s + parSource[src.id][m], 0)))
  const somme = (arr) => arr.reduce((s, v) => s + v, 0)
  const familles = FAMILLES_TP.map(f => {
    const cs = [...caisses.values()].filter(c => familleCaisse(c.nom) === f.id)
      .map(c => ({ ...c, mois: c.mois.map(arrondi) }))
      .sort((a, b) => somme(b.mois) - somme(a.mois) || a.nom.localeCompare(b.nom))
    return { ...f, caisses: cs, mois: VIDE().map((_, m) => arrondi(cs.reduce((s, c) => s + c.mois[m], 0))) }
  }).filter(f => f.caisses.length)
    .sort((a, b) => somme(b.mois) - somme(a.mois))
  return { parSource, total, familles }
}

/**
 * Lignes du relevé derrière une case du détail : année, mois (0-11) et soit une source, soit une
 * famille ou une caisse de tiers payant. Triées par date.
 */
export function versementsDe(transactions, { annee, mois: m, source = null, famille = null, caisse = null }) {
  return transactions.filter(t => {
    if (!t.date.startsWith(`${annee}-`) || mois(t) !== m) return false
    const src = sourceDe(t)
    if (!src) return false
    if (source) return src === source
    if (src !== 'tiersPayant') return false
    if (caisse) return nomCaisse(t.tiers) === caisse
    if (famille) return familleCaisse(t.tiers) === famille
    return true
  }).sort((a, b) => a.date.localeCompare(b.date) || b.montant - a.montant)
}
