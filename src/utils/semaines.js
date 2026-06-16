// ============================================================
// semaines.js — modèle de l'étape « En semaine » (PLANNING.md §12.3) : quelle TRAME du catalogue
// est appliquée à chaque semaine. Par défaut, toutes les semaines suivent la trame PRINCIPALE ;
// le faiseur ne s'en écarte que sur des semaines précises (2+ vacances, ponts, remplaçants).
// On ne stocke QUE les choix explicites. Persistance dans semainesApi.js.
//
// data = { v, trameParSemaine: { <numSemaineISO>: <trameId> } }
// ============================================================

export const VERSION_SEMAINES = 1

export function semainesVide() {
  return { v: VERSION_SEMAINES, trameParSemaine: {} }
}

// Normalise un data stocké : clés → numéros de semaine, valeurs → id de trame entier.
export function normaliserSemaines(data) {
  const src = data?.trameParSemaine && typeof data.trameParSemaine === 'object' ? data.trameParSemaine : {}
  const trameParSemaine = {}
  for (const [num, id] of Object.entries(src)) {
    if (Number.isInteger(id)) trameParSemaine[Number(num)] = id
  }
  return { v: VERSION_SEMAINES, trameParSemaine }
}

// Trame appliquée à une semaine : le choix explicite, sinon la trame principale (peut être null).
export function trameEffective(data, num, principaleId) {
  return data?.trameParSemaine?.[num] ?? principaleId ?? null
}
