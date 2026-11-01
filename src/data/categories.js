// Taxonomie des lignes bancaires, validée le 2026-10-30 (complétée le même jour :
// « Autres cotisations patronales » pour l'ADSPL, groupe « Investissements »). Miroir d'affichage de
// `taxonomie` dans le document de règles (compta/regles.json → table compta_regles) :
// le moteur refuse une règle dont la catégorie n'est pas dans le document, et le
// dashboard n'affiche que celles d'ici. Toute évolution se fait aux deux endroits.
export const TAXONOMIE = [
  { groupe: 'Recettes', sous: ['Honoraires clinique', 'Tiers payant consultations', 'Versements CPAM hors tiers payant', 'Remboursement reçu'] },
  { groupe: 'Associés', sous: ['Reversement mensuel', "Complément d'honoraires", 'Reliquat exercice précédent', 'Régularisation', 'Remboursement RCP', 'Remboursement de frais avancés', 'Prévoyance associés'] },
  { groupe: 'Remplaçants', sous: ['Remplaçant MAR', 'Remplaçant IADE (CDD)', 'Frais de remplaçant'] },
  { groupe: 'Salariés', sous: ['Salaire IADE CDI'] },
  { groupe: 'Charges sociales et fiscales', sous: ['URSSAF', 'Retraite complémentaire', 'Prévoyance et mutuelle salariés', 'Épargne salariale', 'Médecine du travail', 'Autres cotisations patronales', 'Impôts et taxes'] },
  { groupe: 'Fonctionnement', sous: ['Expert-comptable', 'AGA', 'Banque', 'Logiciels et abonnements', 'Parking et locaux', 'Impression et fournitures', 'Vie du groupe et réceptions'] },
  { groupe: 'Investissements', sous: ['Acquisition immobilière'] },
  { groupe: 'À arbitrer', sous: ['À arbitrer'] },
]

export const TOUTES_SOUS = TAXONOMIE.flatMap(g => g.sous)
export const GROUPES = TAXONOMIE.map(g => g.groupe)

// Catégories qu'on peut imputer à un associé (colonne `associe` renseignée)
export const CATEGORIES_ASSOCIE = TAXONOMIE.find(g => g.groupe === 'Associés').sous.filter(s => s !== 'Reversement mensuel' && s !== 'Prévoyance associés').concat(['Remboursement reçu', 'Frais de remplaçant'])

// Catégories qu'on choisit à la main : tout sauf « À arbitrer »
export const CATEGORIES_CHOISISSABLES = TOUTES_SOUS.filter(s => s !== 'À arbitrer')

const GROUPE_DE = Object.fromEntries(TAXONOMIE.flatMap(g => g.sous.map(s => [s, g.groupe])))

// Mappe une sous-catégorie vers son groupe
export const groupeDe = (cat) => GROUPE_DE[cat] || 'À arbitrer'

const COULEURS = {
  'Recettes':                     { background: '#E1F5EE', color: '#085041' },
  'Associés':                     { background: '#EEEDFE', color: '#3C3489' },
  'Remplaçants':                  { background: '#FAEEDA', color: '#633806' },
  'Salariés':                     { background: '#E6F1FB', color: '#0C447C' },
  'Charges sociales et fiscales': { background: '#FAECE7', color: '#712B13' },
  // Groupe d'affichage de la page Dépenses (salariés + remplaçants + charges sociales et fiscales)
  'Charges ressources humaines':  { background: '#FAECE7', color: '#712B13' },
  'Fonctionnement':               { background: '#F1EFE8', color: '#444441' },
  'Investissements':              { background: '#E8EEF8', color: '#24406B' },
  'À arbitrer':                   { background: '#FBE9E9', color: '#A32D2D' },
}

export const couleurGroupe = (groupe) => COULEURS[groupe] || COULEURS['Fonctionnement']
export const catColor = (cat) => couleurGroupe(groupeDe(cat))
