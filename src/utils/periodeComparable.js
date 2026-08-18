/**
 * Périodes comparables sur des séries mensuelles PARTIELLES.
 *
 * Les consultations sont importées mois par mois : l'année en cours s'arrête au dernier export
 * Doctolib intégré (cf. CONSULTATIONS.md §5). Un mois pas encore importé vaut 0 dans la série —
 * indiscernable, sans précaution, d'un vrai mois à zéro.
 *
 * Conséquences observées avant correction (juin 2026 importé, période Jan → Jul) :
 *   • moyenne mensuelle 920 alors qu'aucun mois n'était sous 935 (divisée par un mois inexistant) ;
 *   • écart 2026 vs 2025 affiché à −8,2 %, en opposant 6 mois de 2026 à 7 mois de 2025,
 *     alors que la comparaison honnête Jan → Jun donne +4,3 %.
 *
 * D'où ces helpers : on ne compare QUE les mois où l'année principale a réellement des données.
 */

/**
 * Indices des mois porteurs de données dans `serie`, restreints à la fenêtre [de, a].
 *
 * @param {number[]} serie — 12 valeurs mensuelles (peut être creuse / undefined)
 * @param {number}   de    — premier mois de la période (0-11)
 * @param {number}   a     — dernier mois de la période (0-11, inclus)
 * @returns {number[]} indices croissants ; vide si aucun mois renseigné
 */
export function moisRenseignes(serie, de, a) {
  const s = serie || []
  const idx = []
  for (let m = de; m <= a; m++) if (s[m]) idx.push(m)
  return idx
}

/**
 * Somme d'une série sur les seuls mois indiqués — sert à ramener l'année de RÉFÉRENCE
 * sur la même fenêtre que l'année principale.
 *
 * @param {number[]} serie      — 12 valeurs mensuelles
 * @param {number[]} moisPleins — indices renvoyés par moisRenseignes()
 */
export function sommeComparable(serie, moisPleins) {
  const s = serie || []
  return (moisPleins || []).reduce((total, m) => total + (s[m] ?? 0), 0)
}

/**
 * Dernier mois renseigné sur l'année entière — pour un cumul « à ce jour » déduit des DONNÉES
 * et non d'une constante de calendrier (`MOIS_ACTUEL` est figé et partagé avec les onglets
 * financiers : en août il vaut 8, soit septembre).
 *
 * @returns {number} indice 0-11, ou -1 si l'année est vide
 */
export function dernierMoisRenseigne(serie) {
  return (serie || []).reduce((acc, v, m) => (v ? m : acc), -1)
}
