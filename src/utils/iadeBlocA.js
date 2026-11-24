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
// connaît la CPRE et les opérateurs du bloc A ; un nom qu'elle ignore (un
// remplaçant, un nouvel arrivant) reste déduit de l'historique de ses absences
// (`momentHabituel`).
//
// ⚠️ ALTERNANCE UNE SEMAINE SUR DEUX (numéro de semaine ISO, comme au bloc B) :
// le jeudi est à Flamein les semaines PAIRES, à Malgoire et Pissas les IMPAIRES ;
// le vendredi, Flamein les IMPAIRES, Pissas les PAIRES (Malgoire tous les vendredis).
//
// Pas de compte de salles ici : au bloc A le planning affiche le NOM, avec
// « — matin » / « — après-midi » pour une demi-journée. Le script Excel
// (`convertir_mois.py`) n'en a donc pas besoin — il recopie le moment saisi.
//
// Source : Mehdi, le 2026-11-19 (CPRE) et le 2026-11-24 (opérateurs). Seul le
// lundi de Malgoire est précisé (l'après-midi) ; les autres jours sont notés à la
// journée, faute d'autre précision. Une demi-journée reste possible via « Quand ».
// POUR LA MODIFIER : ce fichier, et lui seul.
// ============================================================
import { normNom } from './iadeBlocB'
import { numeroSemaineISO } from './calendrier'

// Une semaine sur deux : le moment des semaines ISO impaires, puis des paires
// (null = il n'opère pas cette semaine-là).
const alterne = (impaire, paire) => ({ impaire, paire })
const J = 'journee'

/**
 * TRAME — nom → jour de la semaine (1 = lundi … 5 = vendredi) → moment, ou
 * alternance { impaire, paire }. Un jour absent = il ne tourne pas ce jour-là.
 */
export const TRAME_BLOC_A = {
  CPRE: { 1: J, 2: 'matin', 3: 'matin', 4: J, 5: 'matin' },
  Flamein: { 1: J, 2: J, 4: alterne(null, J), 5: alterne(J, null) },
  Malgoire: { 1: 'apres_midi', 4: alterne(J, null), 5: J },
  Pissas: { 3: J, 4: alterne(J, null), 5: alterne(null, J) },
  Nogues: { 1: J, 4: J },
  Rolland: { 1: J, 3: J },
  'Meyer-Bisch': { 2: J, 3: J },
  Dran: { 2: J, 5: J },
}

// Orthographes déjà saisies en base qu'aucune normalisation ne rapproche du nom
// de la trame (une lettre manque) : même personne.
const ALIAS = { 'meyer bish': 'Meyer-Bisch' }

const NOMS_JOURS = { 1: 'lundi', 2: 'mardi', 3: 'mercredi', 4: 'jeudi', 5: 'vendredi' }

function dateUTC(iso) {
  const [a, m, j] = String(iso).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j))
}

// La clé de la trame pour un nom tapé (« cpre », « Dr Flamein », « meyer bish »).
function cleTrame(nom) {
  const cible = normNom(nom)
  if (!cible) return null
  if (ALIAS[cible]) return ALIAS[cible]
  return Object.keys(TRAME_BLOC_A).find(k => normNom(k) === cible) ?? null
}

/** Le nom de la trame pour un nom tapé, ou le nom tel quel s'il lui est inconnu. */
export function nomCanoniqueA(nom) {
  return cleTrame(nom) ?? nom
}

function entree(nom) {
  const cle = cleTrame(nom)
  return cle ? TRAME_BLOC_A[cle] : null
}

// Le moment d'une case, alternance résolue pour la semaine du jour donné.
function resoudre(case_, iso) {
  if (!case_ || typeof case_ === 'string') return case_ ?? null
  return numeroSemaineISO(dateUTC(iso)) % 2 === 1 ? case_.impaire : case_.paire
}

/**
 * Le moment d'une fermeture au bloc A, d'après la trame.
 * → { moment, salles: [], source: 'trame' } ou null si la trame ne sait pas
 *   (nom inconnu, ou il ne tourne pas ce jour-là, cette semaine-là).
 * Même forme que `momentSelonTrame` du bloc B, pour `momentsDuLot`.
 */
export function momentSelonTrameA(nom, jourIso) {
  const e = entree(nom)
  const moment = e && jourIso ? resoudre(e[dateUTC(jourIso).getUTCDay()], jourIso) : null
  return moment ? { moment, salles: [], source: 'trame' } : null
}

/** Les noms de la trame du bloc A, proposés en tête à la frappe. */
export function operateursTrameA() {
  return Object.keys(TRAME_BLOC_A).sort((a, b) => a.localeCompare(b, 'fr'))
}

/**
 * La semaine type, en clair, pour l'afficher à la saisie.
 * Même forme que `semaineType` du bloc B (sans salles) ; `alterne` dit alors
 * 'impaires' ou 'paires' — les semaines où il opère ce jour-là.
 */
export function semaineTypeA(nom) {
  const e = entree(nom)
  if (!e) return []
  return [1, 2, 3, 4, 5]
    .filter(js => e[js])
    .map(js => {
      const c = e[js]
      if (typeof c === 'string') {
        return { jourSemaine: js, label: NOMS_JOURS[js], moment: c, salles: [], alterne: false }
      }
      const moment = c.impaire ?? c.paire
      const alterne = c.impaire && c.paire ? false : c.impaire ? 'impaires' : 'paires'
      return { jourSemaine: js, label: NOMS_JOURS[js], moment, salles: [], alterne }
    })
}
