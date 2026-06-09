import * as XLSX from 'xlsx'

// lignes = tableau d'objets ; les clés deviennent les en-têtes de colonnes
export function exporterExcel(nomFichier, lignes, feuille = 'Données') {
  const ws = XLSX.utils.json_to_sheet(lignes)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, feuille)
  XLSX.writeFile(wb, nomFichier)
}
