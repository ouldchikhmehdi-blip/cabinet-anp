// Liste des initiales d'associés autorisées, dupliquée côté serveur pour que la
// validation des fonctions /api soit autonome (ne pas importer depuis src/).
// Doit rester synchronisée avec src/data/associes.js (cf. PLANNING.md §2).
export const ASSOCIES = ['EH', 'MP', 'RC', 'FXD', 'BA', 'FF', 'YC', 'MOC']
