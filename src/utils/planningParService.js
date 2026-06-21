// ============================================================
// planningParService.js — vue « Planning par service » (PLANNING.md §18 ter).
// Le faiseur COLLE une période de son propre tableur Excel (1ʳᵉ colonne = dates, colonnes suivantes =
// PERSONNES : en-tête = initiales d'un associé ou colonne remplaçant ; cellule = le POSTE du jour).
// On reconnaît les initiales (→ noms complets) et les colonnes remplaçant (nom dans l'en-tête, sinon
// « Remplaçant »), puis on TRANSPOSE en tableau jours × postes (export identique à l'ancien).
// ============================================================
import { ASSOCIES } from '../data/associes'
import { normaliserCle } from './importConsultations'
import { REMPLACANTS_CONNUS } from '../data/remplacants'

// Colonnes (postes) du tableau, dans l'ordre d'affichage.
export const POSTES_SERVICE = ['SARM 1', 'SARM 2', 'Bloc A viscéral', 'Bloc A NC', 'Bloc B', 'USC/Réa']

function nettoie(s) {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Libellé de poste (texte libre des trames) → poste canonique, ou null si vide / « VPA » seul / non reconnu.
// « VPA » (visite pré-anesthésique) est TOUJOURS retiré, quelle que soit la case.
// Tolérant aux suffixes de salle/groupe COLLÉS au code (« NC4 », « Réa3 », « NC G 2 », « SARM1 »…) :
// on exige un début de mot avant le code, mais pas de fin de mot après (un chiffre/lettre peut suivre).
export function normaliserPosteCanonique(libelle) {
  const t = nettoie(libelle).replace(/\bvpa\b/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (/\bsarm\s*1/.test(t)) return 'SARM 1'                  // SARM 1, SARM1, SARM 1 VPA
  if (/\bsarm\s*2/.test(t)) return 'SARM 2'                  // SARM 2, SARM 2 VPA
  if (/visc/.test(t)) return 'Bloc A viscéral'              // viscéral, viscérale CPRE…
  if (/\bnc/.test(t) || /neuro/.test(t)) return 'Bloc A NC'  // NC, NC4, NC A, NC G 2, neuro
  if (/bloc\s*b/.test(t) || /endosc/.test(t)) return 'Bloc B' // bloc B, endoscopie
  if (/\brea/.test(t) || /reanim/.test(t) || /usc/.test(t)) return 'USC/Réa' // réa, réa3, réanimation, USC
  return null
}

// En-tête de colonne remplaçant « générique » (pas un vrai nom) → on inscrira juste « Remplaçant ».
function enteteGenerique(header) {
  return /^remp/.test(nettoie(header).replace(/[^a-z]/g, ''))
}

// Nettoie une cellule pour en extraire un nom : retire les parenthèses « (Ok) » et les annotations (OK, fait).
function nettoyerNom(cellule) {
  return (cellule ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(ok|fait)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Forme normalisée d'un nom (minuscule, sans accents/ponctuation) pour comparaison.
function normNom(s) {
  return nettoie(s).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Cellule → nom d'affichage du remplaçant, ou null si ce n'est pas un nom.
// Si la cellule contient TOUS les mots d'un nom CONNU (REMPLACANTS_CONNUS), on renvoie CE nom canonique
// SEUL — peu importe l'ordre des mots et les mots autour (OK, fait, dates…). Sinon, repli sur tout
// « Dr … » / « Docteur … » (texte nettoyé). Appelée AVANT normaliserPosteCanonique (un nom n'est jamais un poste).
export function extraireNomRemplacant(cellule, connus = REMPLACANTS_CONNUS) {
  const brut = nettoyerNom(cellule)
  if (!brut) return null
  const norm = normNom(brut)
  const sansTitre = norm.replace(/\b(dr|docteur)\b/g, '').replace(/\s+/g, ' ').trim()
  const motsCellule = new Set(sansTitre.split(' ').filter(Boolean))
  for (const nom of connus) {
    const motsNom = normNom(nom).replace(/\b(dr|docteur)\b/g, '').split(' ').filter(Boolean)
    if (motsNom.length && motsNom.every(m => motsCellule.has(m))) return nom // nom canonique SEUL
  }
  if (/\b(dr|docteur)\b/.test(norm)) return brut
  return null
}

// Découpe un texte collé depuis Excel en matrice de cellules (lignes × colonnes), tabulations en séparateur.
// Les lignes entièrement vides sont retirées.
function enMatrice(texte) {
  return (texte ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.split('\t').map(c => c.trim()))
    .filter(ligne => ligne.some(c => c !== ''))
}

// Parse le collage du tableur du faiseur → { table, diag }.
//   table = { postes: POSTES_SERVICE, lignes: [{ iso, dateLabel, estWeekend:false, estFerie:false,
//             parPoste: { <service>: { texte, estRemplacant } } }] }  ← format attendu par l'export.
//   diag  = { associes:[{header,ini,nom}], remplacants:[{header,nom}], ignorees:[header],
//             nbJours, avert:[string] }  ← récapitulatif de reconnaissance affiché à l'écran.
// Options : nomParIni { ini: 'Dr Nom' } (repli sur l'initiale), associes (liste d'initiales),
//           remplacantsConnus (noms reconnus dans les cellules, en plus de l'auto « Dr … »).
export function parserCollageParService(texte, { nomParIni = {}, associes = ASSOCIES, remplacantsConnus = REMPLACANTS_CONNUS } = {}) {
  const vide = { table: { postes: POSTES_SERVICE, lignes: [] }, diag: { associes: [], remplacants: [], ignorees: [], nbJours: 0, avert: [] } }
  const matrice = enMatrice(texte)
  if (matrice.length < 2) return vide // besoin d'au moins l'en-tête + 1 jour

  const entetes = matrice[0]
  const corps = matrice.slice(1)
  const nbColonnes = matrice.reduce((m, l) => Math.max(m, l.length), 0)

  // Index → initiales d'associé (recherche tolérante : initiale exacte, sinon nom complet).
  const iniParCle = new Map()
  for (const ini of associes) iniParCle.set(normaliserCle(ini), ini)
  const iniParNom = new Map()
  for (const [ini, nom] of Object.entries(nomParIni)) if (nom) iniParNom.set(normaliserCle(nom), ini)

  // 1) Classement des colonnes (à partir de l'index 1 ; la colonne 0 = dates).
  const colonnes = [] // { c, type:'associe'|'remplacant', ini?, nom, estRemplacant, header }
  const diag = { associes: [], remplacants: [], ignorees: [], nbJours: 0, avert: [] }
  for (let c = 1; c < nbColonnes; c++) {
    const header = entetes[c] ?? ''
    const colVide = corps.every(l => !(l[c] ?? '').trim())
    const cle = normaliserCle(header)
    const ini = iniParCle.get(cle) ?? iniParNom.get(cle) ?? null
    if (ini) {
      const nom = nomParIni[ini] || ini
      colonnes.push({ c, type: 'associe', ini, nom, estRemplacant: false, header })
      diag.associes.push({ header, ini, nom })
    } else if (!header && colVide) {
      diag.ignorees.push(header)
    } else {
      // Nom initial = en-tête s'il est nommé, sinon « Remplaçant » (peut être remplacé par un nom lu
      // dans une cellule plus haut dans la colonne — cf. report ci-dessous).
      const nom = (header && !enteteGenerique(header)) ? header : 'Remplaçant'
      colonnes.push({ c, type: 'remplacant', nom, estRemplacant: true, header })
    }
  }

  // 2) Transposition jour par jour : pour chaque ligne, on lit le poste de chaque colonne personne.
  // Pour les colonnes remplaçant, le NOM courant est REPORTÉ vers le bas : un nom lu dans une cellule
  // (ex. dimanche « OK Dr Delbert Aurelie (Ok) ») vaut pour les jours suivants jusqu'au prochain nom.
  const nomCourantParCol = {}
  for (const col of colonnes) if (col.type === 'remplacant') nomCourantParCol[col.c] = col.nom
  const nomsRempl = new Set()
  const lignes = []
  const postesVus = new Set()
  for (let r = 0; r < corps.length; r++) {
    const ligne = corps[r]
    const dateLabel = (ligne[0] ?? '').trim()
    // parService[poste] = [{ nom, estRemplacant }] (dédoublonné par nom, ordre des colonnes).
    const parService = {}
    for (const col of colonnes) {
      let nom = col.nom
      if (col.type === 'remplacant') {
        const nomDetecte = extraireNomRemplacant(ligne[col.c], remplacantsConnus)
        if (nomDetecte) { nomCourantParCol[col.c] = nomDetecte; continue } // annotation : pas un poste
        nom = nomCourantParCol[col.c]
      }
      const service = normaliserPosteCanonique(ligne[col.c])
      if (!service) continue
      postesVus.add(`${col.c}`)
      if (col.type === 'remplacant') nomsRempl.add(nom)
      const items = (parService[service] ??= [])
      if (!items.some(it => it.nom === nom)) items.push({ nom, estRemplacant: col.estRemplacant })
    }
    const parPoste = {}
    for (const poste of POSTES_SERVICE) {
      const items = parService[poste]
      if (items?.length) {
        parPoste[poste] = {
          texte: items.map(it => it.nom).join(' / '),
          estRemplacant: items.every(it => it.estRemplacant),
        }
      }
    }
    lignes.push({ iso: `r${r}`, dateLabel, estWeekend: false, estFerie: false, parPoste })
  }
  diag.nbJours = lignes.length
  diag.remplacants = [...nomsRempl].map(nom => ({ nom }))

  // 3) Avertissements : colonnes non vides dont aucune cellule n'a donné un poste reconnu.
  for (const col of colonnes) {
    if (!postesVus.has(`${col.c}`)) {
      const colNonVide = corps.some(l => (l[col.c] ?? '').trim())
      if (colNonVide) diag.avert.push(`Colonne « ${col.header || (col.type === 'remplacant' ? 'Remplaçant' : col.ini)} » : aucun poste reconnu (vérifiez les libellés).`)
    }
  }

  return { table: { postes: POSTES_SERVICE, lignes }, diag }
}
