// ============================================================
// iadeBlocA.js — LA TRAME DU BLOC A : les vacations du bloc A dont l'horaire
// est fixe, jour de la semaine par jour de la semaine.
//
// À quoi elle sert : comme au bloc B (`iadeBlocB.js`), quand la gestion ferme
// un créneau, le moment (journée / matin / après-midi) est DÉJÀ rempli. On ne
// demande plus ce que la trame sait.
//
// Au bloc A, une ligne de `iade_creneaux_fermes` porte dans `absent` le nom de
// ce qui ne tourne pas — un opérateur, ou une activité comme « CPRE ». La trame
// ne connaît que les activités à horaire fixe ; les opérateurs du bloc A restent
// déduits de l'historique de leurs absences (`momentHabituel`).
//
// Pas de compte de salles ici : au bloc A le planning affiche le NOM, avec
// « — matin » / « — après-midi » pour une demi-journée. Le script Excel
// (`convertir_mois.py`) n'en a donc pas besoin — il recopie le moment saisi.
//
// Source : Mehdi, le 2026-11-19.
// POUR LA MODIFIER : ce fichier, et lui seul.
// ============================================================
import { normNom } from './iadeBlocB'

/**
 * TRAME — activité → jour de la semaine (1 = lundi … 5 = vendredi) → moment.
 * Un jour absent = l'activité ne tourne pas ce jour-là.
 */
export const TRAME_BLOC_A = {
  CPRE: { 1: 'journee', 2: 'matin', 3: 'matin', 4: 'journee', 5: 'matin' },
}

const NOMS_JOURS = { 1: 'lundi', 2: 'mardi', 3: 'mercredi', 4: 'jeudi', 5: 'vendredi' }

function jourSemaine(iso) {
  const [a, m, j] = String(iso).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j)).getUTCDay()
}

// L'entrée de la trame pour un nom tapé (« cpre », « CPRE » → CPRE).
function entree(nom) {
  const cible = normNom(nom)
  if (!cible) return null
  const cle = Object.keys(TRAME_BLOC_A).find(k => normNom(k) === cible)
  return cle ? TRAME_BLOC_A[cle] : null
}

/**
 * Le moment d'une fermeture au bloc A, d'après la trame.
 * → { moment, salles: [], source: 'trame' } ou null si la trame ne sait pas
 *   (nom inconnu, ou l'activité ne tourne pas ce jour-là).
 * Même forme que `momentSelonTrame` du bloc B, pour `momentsDuLot`.
 */
export function momentSelonTrameA(nom, jourIso) {
  const e = entree(nom)
  const moment = e && jourIso ? e[jourSemaine(jourIso)] : null
  return moment ? { moment, salles: [], source: 'trame' } : null
}

/** Les noms de la trame du bloc A, proposés en tête à la frappe. */
export function operateursTrameA() {
  return Object.keys(TRAME_BLOC_A).sort((a, b) => a.localeCompare(b, 'fr'))
}

/**
 * La semaine type, en clair, pour l'afficher à la saisie.
 * Même forme que `semaineType` du bloc B (sans salles ni alternance).
 */
export function semaineTypeA(nom) {
  const e = entree(nom)
  if (!e) return []
  return [1, 2, 3, 4, 5]
    .filter(js => e[js])
    .map(js => ({ jourSemaine: js, label: NOMS_JOURS[js], moment: e[js], salles: [], alterne: false }))
}
