// ============================================================
// iadeCompteurConges.js — le bloc « CONGES » du bulletin de paie, recopié par
// la gestion et lu par l'agent (fonctions pures, sans réseau).
//
// MODÈLE : une ligne = UN AGENT, les chiffres d'UN bulletin (cf.
// supabase/iade_compteur_conges.sql). Trois lignes (En-cours, N, N-1) ×
// Acquis / Pris / Solde, avec Solde = Acquis − Pris — vérifié sur bulletin :
// 15 − 8 = 7.
//
// Deux conventions du bulletin, reproduites telles quelles :
//   • le Solde n'est pas imprimé quand il vaut 0 ;
//   • une ligne non concernée (N-1, le plus souvent) reste VIDE, pas à 0,00.
// D'où des valeurs nullables de bout en bout : null = « le bulletin ne dit
// rien », 0 = « le bulletin dit zéro ». Les confondre ferait dire au dashboard
// ce que la paie n'a pas dit.
//
// Les nombres s'écrivent et se lisent à la française (« 15,00 ») : la gestion
// recopie ce qu'elle a sous les yeux, pas une traduction.
//
// Accès Supabase : iadeCompteurCongesApi.js
// Schéma + RLS   : supabase/iade_compteur_conges.sql
// ============================================================

// ⚠️ Doit rester aligné sur la contrainte iade_compteur_conges_bornes —
// supabase/iade_compteur_conges.sql.
export const MAX_JOURS = 999.99

// Les trois lignes du bloc, dans l'ordre du bulletin. `acquis` / `pris` sont les
// noms de colonnes en base ; `label` est l'intitulé imprimé.
export const LIGNES = [
  { cle: 'encours', label: 'En-cours', acquis: 'encours_acquis', pris: 'encours_pris' },
  { cle: 'n',       label: 'N',        acquis: 'n_acquis',       pris: 'n_pris' },
  { cle: 'n1',      label: 'N-1',      acquis: 'n1_acquis',      pris: 'n1_pris' },
]

// Les six colonnes chiffrées, dans l'ordre d'affichage.
export const CHAMPS_JOURS = LIGNES.flatMap(l => [l.acquis, l.pris])

// ── Écriture / lecture à la française ────────────────────────────────────────

// « 15,00 » — deux décimales et la virgule, comme sur le bulletin.
// null / undefined / illisible → chaîne vide : le bulletin laisse la case vide.
export function formatJours(n) {
  if (n === null || n === undefined || n === '') return ''
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Lit une case saisie à la main : « 15,00 », « 15.00 », « 15 », « 1 234,5 ».
//   case vide      → null  (« le bulletin ne dit rien »)
//   case illisible → NaN   (verifierCompteur s'en charge)
// On exige la forme attendue AVANT de convertir : Number('') vaut 0 et
// Number('12abc') vaut NaN — sans ce garde-fou, une case vide deviendrait un 0.
export function parseJours(texte) {
  if (texte === null || texte === undefined) return null
  const propre = String(texte).replace(/[\s\u00A0]/g, '').replace(',', '.')
  if (propre === '') return null
  if (!/^\d*\.?\d*$/.test(propre) || propre === '.') return NaN
  return Number(propre)
}

// ── Solde ────────────────────────────────────────────────────────────────────

// Solde = Acquis − Pris. Une case vide compte pour 0 quand l'autre est
// renseignée. Les DEUX vides, en revanche, c'est une ligne non concernée : il
// n'y a pas de solde à annoncer, on ne répond pas « 0 ».
export function solde(acquis, pris) {
  const a = acquis === null || acquis === undefined ? null : Number(acquis)
  const p = pris === null || pris === undefined ? null : Number(pris)
  if (a === null && p === null) return null
  if (!Number.isFinite(a ?? 0) || !Number.isFinite(p ?? 0)) return null
  return (a ?? 0) - (p ?? 0)
}

// Le solde tel qu'il s'imprime : le bulletin ne met rien quand il vaut 0.
export function formatSolde(acquis, pris) {
  const s = solde(acquis, pris)
  if (s === null || s === 0) return ''
  return formatJours(s)
}

// ── Contrôles de saisie ──────────────────────────────────────────────────────

// `saisie` : { encours_acquis: '15,00', … } — des CHAÎNES, telles que tapées.
// Renvoie un message en français, ou null si tout va bien.
export function verifierCompteur(saisie = {}) {
  for (const champ of CHAMPS_JOURS) {
    const brut = saisie[champ]
    const v = parseJours(brut)
    if (v === null) continue
    if (Number.isNaN(v)) return `« ${String(brut).trim()} » n'est pas un nombre de jours.`
    if (v < 0) return 'Un nombre de jours ne peut pas être négatif.'
    if (v > MAX_JOURS) return `Un nombre de jours ne peut pas dépasser ${formatJours(MAX_JOURS)}.`
  }
  return null
}

// Les six cases vides → il n'y a rien à enregistrer. La ligne doit être
// SUPPRIMÉE, pas écrite : la contrainte iade_compteur_conges_non_vide refuse
// une ligne de blancs, et c'est l'absence de ligne qui dit « aucun bulletin ».
export function estVide(saisie = {}) {
  return CHAMPS_JOURS.every(champ => parseJours(saisie[champ]) === null)
}

// La saisie (chaînes) → les colonnes de la base (nombres ou null).
export function versColonnes(saisie = {}) {
  const out = {}
  for (const champ of CHAMPS_JOURS) out[champ] = parseJours(saisie[champ])
  return out
}

// Une ligne de la base → la saisie affichée dans la grille (chaînes).
export function versSaisie(ligne) {
  const out = {}
  for (const champ of CHAMPS_JOURS) out[champ] = formatJours(ligne?.[champ])
  return out
}

// Deux saisies disent-elles la même chose ? Sert à n'enregistrer QUE les agents
// touchés : réécrire tout le monde remettrait maj_par / maj_le à jour pour des
// bulletins que personne n'a relus, et c'est la seule trace de qui a recopié quoi.
export function memeSaisie(a = {}, b = {}) {
  return CHAMPS_JOURS.every(champ => {
    const x = parseJours(a[champ])
    const y = parseJours(b[champ])
    if (x === null || y === null) return x === y
    if (Number.isNaN(x) || Number.isNaN(y)) return String(a[champ]) === String(b[champ])
    return x === y
  })
}

// ── Mois de référence ────────────────────────────────────────────────────────

// « YYYY-MM-01 » : le bulletin d'un mois, ramené au 1er (cf. la contrainte
// iade_compteur_conges_mois_ref_premier). ⚠️ `mois` est 0-indexé, comme partout
// dans IadeGestion (Date.getMonth()).
export function moisRef(annee, mois) {
  const d = new Date(Date.UTC(annee, mois, 1))
  const p = n => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-01`
}

// « octobre 2026 » à partir d'un mois_ref « 2026-10-01 ».
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]
export function libelleMoisRef(moisRefIso) {
  if (!moisRefIso) return ''
  const [a, m] = String(moisRefIso).split('-').map(Number)
  if (!a || !m || m < 1 || m > 12) return ''
  return `${MOIS[m - 1]} ${a}`
}
