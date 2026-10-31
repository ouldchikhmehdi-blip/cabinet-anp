import * as XLSX from 'xlsx'

// lignes = tableau d'objets ; les clés deviennent les en-têtes de colonnes
export function exporterExcel(nomFichier, lignes, feuille = 'Données') {
  const ws = XLSX.utils.json_to_sheet(lignes)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, feuille)
  XLSX.writeFile(wb, nomFichier)
}

// Nom de feuille Excel valide : 31 caractères max, sans [ ] : * ? / \
const nomFeuille = (n) => String(n).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Feuille'

// Classeur à plusieurs feuilles : feuilles = [{ nom, lignes }] (lignes = tableau d'objets).
// Largeur de chaque colonne ajustée à son contenu le plus long (bornée), pour un libellé lisible.
export function exporterClasseur(nomFichier, feuilles) {
  const wb = XLSX.utils.book_new()
  for (const { nom, lignes } of feuilles) {
    const ws = XLSX.utils.json_to_sheet(lignes.length ? lignes : [{ '': 'Aucune ligne sur la période' }])
    const cles = Object.keys(lignes[0] || {})
    ws['!cols'] = cles.map(k => ({ wch: Math.min(60, Math.max(k.length, ...lignes.map(l => String(l[k] ?? '').length)) + 2) }))
    XLSX.utils.book_append_sheet(wb, ws, nomFeuille(nom))
  }
  XLSX.writeFile(wb, nomFichier)
}
