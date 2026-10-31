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
 * Détail du CA d'une année : { parSource: {id: [12]}, nbParSource: {id: [12]}, total: [12],
 * familles: [{ id, nom, mois: [12], nb: [12], caisses: [{ nom, mois: [12], nb: [12], n }] }] }
 * — familles et caisses triées par montant décroissant ; `nb` = nombre de virements.
 */
export function detailRecettes(transactions, annee) {
  const parSource = Object.fromEntries(SOURCES.map(s => [s.id, VIDE()]))
  const nbParSource = Object.fromEntries(SOURCES.map(s => [s.id, VIDE()]))
  const caisses = new Map()
  for (const t of transactions) {
    if (!t.date.startsWith(`${annee}-`)) continue
    const src = sourceDe(t)
    if (!src) continue
    const m = mois(t)
    parSource[src][m] += t.montant
    nbParSource[src][m] += 1
    if (src === 'tiersPayant') {
      const nom = nomCaisse(t.tiers)
      if (!caisses.has(nom)) caisses.set(nom, { nom, mois: VIDE(), nb: VIDE(), n: 0 })
      const c = caisses.get(nom)
      c.mois[m] += t.montant; c.nb[m] += 1; c.n += 1
    }
  }
  for (const id of Object.keys(parSource)) parSource[id] = parSource[id].map(arrondi)
  const total = VIDE().map((_, m) => arrondi(SOURCES.reduce((s, src) => s + parSource[src.id][m], 0)))
  const somme = (arr) => arr.reduce((s, v) => s + v, 0)
  const familles = FAMILLES_TP.map(f => {
    const cs = [...caisses.values()].filter(c => familleCaisse(c.nom) === f.id)
      .map(c => ({ ...c, mois: c.mois.map(arrondi) }))
      .sort((a, b) => somme(b.mois) - somme(a.mois) || a.nom.localeCompare(b.nom))
    return { ...f, caisses: cs, mois: VIDE().map((_, m) => arrondi(cs.reduce((s, c) => s + c.mois[m], 0))), nb: VIDE().map((_, m) => cs.reduce((s, c) => s + c.nb[m], 0)) }
  }).filter(f => f.caisses.length)
    .sort((a, b) => somme(b.mois) - somme(a.mois))
  return { parSource, nbParSource, total, familles }
}

/**
 * Série mensuelle d'une cible du détail : { mois: [12], nb: [12] }. `cible` = 'source:<id>',
 * 'famille:<id>' ou 'caisse:<nom>' ; une cible absente de l'année donne des zéros.
 */
export function serieDe(detail, cible) {
  const [type, ...reste] = String(cible).split(':')
  const id = reste.join(':')
  if (type === 'source' && detail.parSource[id]) return { mois: detail.parSource[id], nb: detail.nbParSource[id] }
  if (type === 'famille') { const f = detail.familles.find(x => x.id === id); if (f) return { mois: f.mois, nb: f.nb } }
  if (type === 'caisse') { for (const f of detail.familles) { const c = f.caisses.find(x => x.nom === id); if (c) return { mois: c.mois, nb: c.nb } } }
  return { mois: VIDE(), nb: VIDE() }
}

/**
 * Ce qui a bougé dans le tiers payant entre deux années, mois de..a : une ligne par caisse présente
 * l'une ou l'autre année { nom, famille, a, b, nbA, nbB, ecart } (a = année principale, b = référence),
 * triée par écart absolu décroissant.
 */
export function ecartsCaisses(detailA, detailB, de, a) {
  const tranche = (arr) => arr.slice(de, a + 1).reduce((s, v) => s + v, 0)
  const lignes = new Map()
  const lire = (detail, cote) => {
    for (const f of detail.familles) for (const c of f.caisses) {
      if (!lignes.has(c.nom)) lignes.set(c.nom, { nom: c.nom, famille: f.id, a: 0, b: 0, nbA: 0, nbB: 0 })
      const l = lignes.get(c.nom)
      l[cote] = arrondi(tranche(c.mois)); l[cote === 'a' ? 'nbA' : 'nbB'] = tranche(c.nb)
    }
  }
  lire(detailA, 'a'); lire(detailB, 'b')
  return [...lignes.values()].map(l => ({ ...l, ecart: arrondi(l.a - l.b) }))
    .filter(l => l.a !== 0 || l.b !== 0)
    .sort((x, y) => Math.abs(y.ecart) - Math.abs(x.ecart) || x.nom.localeCompare(y.nom))
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
