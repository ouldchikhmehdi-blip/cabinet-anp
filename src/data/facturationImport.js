// ============================================================
// facturationImport.js — import des justificatifs FAC / RED d'un mois depuis le site
// (bouton « Importer » de l'onglet Facturé → Facturé / réglé). Module pur, testé sur
// des justificatifs INVENTÉS (facturationImport.test.js).
//
// Les fichiers portent des NOMS DE PATIENTS : ils sont lus dans le navigateur et n'en
// sortent jamais. Seule part en base une ligne d'agrégats par associé × établissement
// (table facturation_mensuelle, même calcul que compta/facturation.js sur le mini PC,
// via le moteur partagé compta/facturationMoteur.js).
//
// Le facturé par chirurgien n'est PAS calculé ici : il faut les exports d'actes et les
// CPA, qui restent sur le mini PC. Le script le complète au passage suivant.
// ============================================================
import { nomFichier, lireJustificatif, agreger } from '../../compta/facturationMoteur.js'

export const MOIS_NOMS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export const libelleMois = (annee, mois) => `${MOIS_NOMS[mois - 1]} ${annee}`

// Colonnes envoyées en base : les agrégats, rien d'autre (aucune ligne de patient).
export const CHAMPS_MENSUEL = [
  'annee', 'mois', 'associe', 'etablissement',
  'facture_total', 'facture_dh', 'facture_amo', 'facture_amc', 'facture_pat',
  'regle_total', 'regle_conv', 'regle_dh', 'redevance_ttc',
  'nb_lignes_fac', 'nb_lignes_red', 'fichier_fac', 'fichier_red',
]

const cle = (r) => `${r.associe}|${r.etablissement}`

/**
 * Lit les fichiers déposés : `fichiers` = [{ nom, rows }] (rows = cellules brutes de la
 * première feuille). Renvoie { annee, mois, mensuel, ignores, erreurs }.
 *   • ignores : fichiers dont le nom n'est pas un justificatif (…&OULD010&MIL&FAC.xlsx) ;
 *   • erreurs : tout ce qui interdit l'import (fichier illisible, totaux qui ne recollent pas,
 *     deux mois mélangés, deux FAC pour le même associé…). Rien n'est importé s'il y en a une.
 */
export function lireFichiersFacturation(fichiers) {
  const ignores = [], erreurs = [], justificatifs = []
  for (const { nom, rows } of fichiers) {
    const info = nomFichier(nom)
    if (!info) { ignores.push(nom); continue }
    try {
      const j = lireJustificatif(rows, { type: info.type })
      if (j.associe && j.associe !== info.associe) throw new Error(`le fichier est au nom de ${j.associe}, pas de ${info.associe}`)
      justificatifs.push({ ...j, ...info, fichier: nom })
    } catch (e) {
      erreurs.push(`${nom} : ${e.message}`)
    }
  }
  const periodes = [...new Set(justificatifs.map(j => `${j.annee}-${j.mois}`))]
  if (periodes.length > 1) {
    const detail = periodes.map(p => { const [a, m] = p.split('-').map(Number); return libelleMois(a, m) }).join(', ')
    erreurs.push(`Les fichiers couvrent plusieurs mois (${detail}) : un import = un seul mois.`)
  }
  if (justificatifs.length === 0 && erreurs.length === 0) erreurs.push('Aucun justificatif FAC ou RED parmi les fichiers choisis.')
  if (erreurs.length) return { annee: null, mois: null, mensuel: [], ignores, erreurs }

  let mensuel
  try {
    // Index de séjours vide : seul `mensuel` sert ici, l'attribution par chirurgien est ignorée.
    mensuel = agreger(justificatifs, new Map()).mensuel
  } catch (e) {
    return { annee: null, mois: null, mensuel: [], ignores, erreurs: [e.message] }
  }
  const { annee, mois } = justificatifs[0]
  return {
    annee, mois, ignores, erreurs: [],
    mensuel: mensuel.map(r => Object.fromEntries(CHAMPS_MENSUEL.map(k => [k, r[k]]))),
  }
}

/**
 * Ce que l'import va faire, face à ce qui est déjà en base (`base` = lignes de
 * facturation_mensuelle, tous mois). Pour l'écran de confirmation :
 *   • remplaces : associé × établissement du mois déjà en base, que l'import réécrit ;
 *   • conserves : déjà en base pour ce mois, absents de l'import → laissés tels quels ;
 *   • manquants : présents le mois précédent, absents de l'import et de la base pour ce
 *     mois — sans doute un fichier oublié ;
 *   • partiels  : lignes de l'import qui n'ont que le FAC ou que le RED (l'autre moitié,
 *     déjà en base, est gardée).
 */
export function comparerAvecBase({ annee, mois, mensuel }, base = []) {
  const duMois = base.filter(r => Number(r.annee) === annee && Number(r.mois) === mois)
  const importes = new Set(mensuel.map(cle))
  const enBase = new Set(duMois.map(cle))
  const precedent = mois === 1 ? { annee: annee - 1, mois: 12 } : { annee, mois: mois - 1 }
  const duPrecedent = base.filter(r => Number(r.annee) === precedent.annee && Number(r.mois) === precedent.mois)
  return {
    dejaImporte: duMois.length > 0,
    remplaces: mensuel.filter(r => enBase.has(cle(r))).map(cle),
    conserves: duMois.filter(r => !importes.has(cle(r))).map(cle),
    manquants: [...new Set(duPrecedent.map(cle))].filter(k => !importes.has(k) && !enBase.has(k)),
    partiels: mensuel.filter(r => !r.fichier_fac || !r.fichier_red).map(r => ({ cle: cle(r), manque: r.fichier_fac ? 'RED' : 'FAC' })),
    precedent,
  }
}

/** Totaux d'un import, pour l'aperçu. */
export function totauxImport(mensuel) {
  const s = (k) => Math.round(mensuel.reduce((t, r) => t + (r[k] || 0), 0) * 100) / 100
  return { facture: s('facture_total'), regle: s('regle_total'), redevance: s('redevance_ttc'), dh: s('facture_dh') }
}
