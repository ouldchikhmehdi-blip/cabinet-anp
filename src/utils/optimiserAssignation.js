// ============================================================
// optimiserAssignation.js — recherche locale DÉTERMINISTE pour une affectation « un associé par
// semaine » (utilisée par les optimiseurs week-ends et réa). À partir d'un état existant, on tente
// de RÉASSIGNER une semaine ou d'ÉCHANGER deux semaines pour améliorer un SCORE LEXICOGRAPHIQUE.
// Un mouvement n'est retenu que s'il (1) reste valide (règles dures via `eligible`) et (2) améliore
// strictement le score (1ʳᵉ composante non nulle négative). Déterministe et IDEMPOTENT.
// ============================================================
import { ASSOCIES } from '../data/associes'

// Comparaison lexicographique : a < b ?
function lexLt(a, b) {
  for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return true; if (a[i] > b[i]) return false }
  return false
}

// nums      : numéros de semaines de la plage (ordre quelconque, triés ici)
// etat0     : { num: ini } état de départ (plage)
// fixes     : Set(num) verrouillés (jamais modifiés)
// eligible  : (num, ini, etat) => bool — règle DURE, évaluée sur l'état APRÈS application du mouvement
// score     : (etat) => number[] — clé lexicographique (plus bas = meilleur)
// Renvoie { etat, avant: score(etat0), apres: score(etatFinal) }.
export function optimiserAssignation({ nums, etat0, fixes = new Set(), eligible, score }) {
  const ordre = [...nums].sort((a, b) => a - b)
  const etat = { ...etat0 }
  // Semaines modifiables : non verrouillées et déjà pourvues (on n'invente pas de couverture ici).
  const libres = ordre.filter(n => !fixes.has(n) && etat[n] != null)
  const avant = score(etat0)
  const maxPass = libres.length * 4 + 50

  for (let pass = 0; pass < maxPass; pass++) {
    const courant = score(etat)
    let meilleur = null // { apply, cle }

    // A) RÉASSIGNER une semaine à un autre associé.
    for (const num of libres) {
      const actuel = etat[num]
      for (const ini of ASSOCIES) {
        if (ini === actuel) continue
        etat[num] = ini
        if (eligible(num, ini, etat)) {
          const cle = score(etat)
          if (lexLt(cle, courant) && (!meilleur || lexLt(cle, meilleur.cle))) {
            meilleur = { apply: () => { etat[num] = ini }, cle }
          }
        }
        etat[num] = actuel
      }
    }

    // B) ÉCHANGER les associés de deux semaines.
    for (let i = 0; i < libres.length; i++) {
      for (let j = i + 1; j < libres.length; j++) {
        const n1 = libres[i], n2 = libres[j]
        const a = etat[n1], b = etat[n2]
        if (a === b) continue
        etat[n1] = b; etat[n2] = a
        if (eligible(n1, b, etat) && eligible(n2, a, etat)) {
          const cle = score(etat)
          if (lexLt(cle, courant) && (!meilleur || lexLt(cle, meilleur.cle))) {
            meilleur = { apply: () => { etat[n1] = b; etat[n2] = a }, cle }
          }
        }
        etat[n1] = a; etat[n2] = b
      }
    }

    if (!meilleur) break
    meilleur.apply()
  }

  return { etat, avant, apres: score(etat) }
}
