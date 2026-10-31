// Les postes de « Charges salariales » : ce que coûte le personnel, mois par mois.
// `serie` = clé de series (compta.js), `categories` = catégories des lignes du relevé
// (pour le détail et l'export). Les cotisations restent aussi visibles dans « Dépenses ».
import { TAXONOMIE } from './categories'

const COTISATIONS = TAXONOMIE.find(g => g.groupe === 'Charges sociales et fiscales').sous

export const POSTES = [
  { id: 'cdi', label: 'Salariés CDI', serie: 'SALAIRES_CDI', couleur: '#534AB7', categories: ['Salaire IADE CDI'] },
  { id: 'iade', label: 'Rempla IADE', serie: 'REMPL_IADE', couleur: '#EF9F27', categories: ['Remplaçant IADE (CDD)'] },
  { id: 'mar', label: 'Rempla MAR', serie: 'REMPL_MAR', couleur: '#D85A30', categories: ['Remplaçant MAR', 'Frais de remplaçant'] },
  { id: 'cot', label: 'Cotisations et charges', serie: 'COTISATIONS', couleur: '#0C447C', categories: COTISATIONS },
]

// Une ligne du relevé appartient-elle à l'un des postes ? (débits seulement, comme les séries)
export const dansPostes = (postes, t) => t.montant < 0 && postes.some(p => p.categories.includes(t.categorie))
