// Liste des initiales d'associés autorisées, dupliquée côté serveur pour que la
// validation des fonctions /api soit autonome (ne pas importer depuis src/).
//
// ⚠️ COPIE de src/data/associes.js (source de vérité). À garder STRICTEMENT
//    synchronisé : même contenu, même ordre. Pour remplacer un associé,
//    suivre la procédure « Remplacer un associé / changer une initiale »
//    de PLANNING.md (cf. PLANNING.md §2).
export const ASSOCIES = ['EH', 'MP', 'RC', 'FXD', 'BA', 'FF', 'YC', 'MOC']
