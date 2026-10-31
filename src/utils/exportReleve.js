import { feuillesReleve } from '../data/compta'
import { MOIS_COURT } from '../data/mockData'

// Entrée de menu BoutonExport : les lignes du relevé de la page, une feuille par année cochée.
// `filtre(t)` choisit les lignes (ex. catégories du CA) ; sans filtre, tout le relevé.
export function entreeReleve({ label = 'Lignes du relevé (une feuille par année)', page, transactions, years, de, a, filtre }) {
  return {
    label,
    build: () => ({
      nomFichier: `releve_${page}_${MOIS_COURT[de]}-${MOIS_COURT[a]}_${[...years].sort((x, y) => x - y).join('-')}.xlsx`,
      feuilles: feuillesReleve(transactions, { years, de, a, filtre }),
    }),
  }
}
