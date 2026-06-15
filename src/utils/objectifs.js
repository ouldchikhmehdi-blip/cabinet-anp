// ============================================================
// objectifs.js — modèle des objectifs annuels par associé (cf. PLANNING.md §16).
// La persistance est dans objectifsApi.js (Supabase).
// Ici uniquement la forme de l'objet `data` (jsonb) et les helpers.
//
// data = {
//   v,                                  // version du schéma
//   lignes:  [{ id, label, supprimable }],  // paramètres suivis (4 par défaut + libres)
//   valeurs: { <associe>: { <ligneId>: number } },
// }
// ============================================================

export const VERSION_OBJ = 1

// Les 4 paramètres par défaut (photo « Objectifs 2025 », hors Joker).
// `supprimable: false` → non retirables (mais leur valeur reste facultative).
export const LIGNES_DEFAUT = [
  { id: 'g_weekend', label: 'G week-end', supprimable: false },
  { id: 'a_vendredi', label: 'A vendredi', supprimable: false },
  { id: 'g_vendredi', label: 'G vendredi', supprimable: false },
  { id: 'rea', label: 'Réa', supprimable: false },
]

export function objectifsVide() {
  return {
    v: VERSION_OBJ,
    lignes: LIGNES_DEFAUT.map(l => ({ ...l })),
    valeurs: {},
  }
}

// Fusionne un data stocké (potentiellement partiel) avec la base par défaut.
// - garantit la présence des 4 lignes par défaut, en tête, dans le bon ordre ;
// - conserve les lignes personnalisées (id commençant par « custom- ») ;
// - `valeurs` repris tel quel (objet vide par défaut).
export function normaliserObjectifs(data) {
  const stockees = Array.isArray(data?.lignes) ? data.lignes : []
  const persos = stockees.filter(l => l && l.supprimable && !LIGNES_DEFAUT.some(d => d.id === l.id))
  const lignes = [
    ...LIGNES_DEFAUT.map(l => ({ ...l })),
    ...persos.map(l => ({ id: l.id, label: l.label, supprimable: true })),
  ]
  return {
    v: VERSION_OBJ,
    lignes,
    valeurs: data?.valeurs && typeof data.valeurs === 'object' ? data.valeurs : {},
  }
}
