// Les 8 associés du SARM, désignés par leurs initiales (cf. PLANNING.md §2).
// Ordre = ordre d'affichage des colonnes dans tout le module planning.
//
// VALEUR PAR DÉFAUT / DE REPLI. La liste réelle est chargée depuis la base
// (table planning_associes) au démarrage de l'app via appliquerAssocies(), ce
// qui permet de remplacer un associé (départ en retraite) depuis l'écran admin
// SANS redéploiement (cf. PLANNING.md « Remplacer un associé »).
//
// ⚠️ ASSOCIES est MUTÉ EN PLACE (jamais réassigné) : tous les imports
//    `import { ASSOCIES } from ...` partagent la même référence et voient donc
//    la liste à jour. Ne pas copier ASSOCIES dans une const au niveau module —
//    toujours le lire à l'exécution (dans une fonction/un composant).
export const ASSOCIES = ['EH', 'MP', 'RC', 'FXD', 'BA', 'FF', 'YC', 'MOC']

// Remplace le contenu d'ASSOCIES EN PLACE (préserve la référence partagée).
// Ignoré si `liste` n'est pas un tableau non vide d'initiales exploitables.
export function appliquerAssocies(liste) {
  if (!Array.isArray(liste)) return
  const propres = liste.map(x => String(x ?? '').trim()).filter(Boolean)
  if (propres.length === 0) return
  ASSOCIES.length = 0
  ASSOCIES.push(...propres)
}
