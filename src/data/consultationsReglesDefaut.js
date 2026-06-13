/**
 * Règles de correction pré-chargées pour l'import CSV Doctolib.
 *
 * Ces règles sont fusionnées avec les règles mémorisées par l'utilisateur à chaque
 * démarrage (voir consultations.js → reglesInitiales()). Les règles manuelles de
 * l'utilisateur ont TOUJOURS la priorité en cas de conflit sur la même clé normalisée.
 *
 * Format de chaque règle :
 *   { cle, action: 'praticien'|'specialite'|'global'|'ignorer', specId?, pratId? }
 *
 * La clé est la valeur TELLE QU'ELLE APPARAÎT dans le CSV (ou une variante possible).
 * La normalisation (majuscules, sans accents, sans préfixes Dr/Pr) est appliquée au
 * moment de la comparaison — donc une seule entrée par variante suffit.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * À COMPLÉTER : ajouter ici les noms fournis par l'utilisateur pour :
 *   - Gastro-entérologues (specId: 'endoscopie', action: 'praticien', pratId: leur id)
 *   - Pneumologues (action: 'specialite', specId: 'pneumologie')
 *   - Éventuelles variantes d'orthographe manquantes
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Neurochirurgie ───────────────────────────────────────────────────────────
// Praticiens actuels : Nogues, Meyer-Bisch, Dran, Rolland (+ variantes courantes)

const NEURO_SPEC = 'neurochirurgie'

const REGLES_NEURO = [
  // Dr Nogues
  { cle: 'Dr Nogues',           action: 'praticien', specId: NEURO_SPEC, pratId: 'nogues' },
  { cle: 'Nogues',              action: 'praticien', specId: NEURO_SPEC, pratId: 'nogues' },
  { cle: 'NOGUES',              action: 'praticien', specId: NEURO_SPEC, pratId: 'nogues' },
  { cle: 'Dr NOGUES',           action: 'praticien', specId: NEURO_SPEC, pratId: 'nogues' },

  // Dr Meyer-Bisch
  { cle: 'Dr Meyer-Bisch',      action: 'praticien', specId: NEURO_SPEC, pratId: 'meyer-bisch' },
  { cle: 'Meyer-Bisch',         action: 'praticien', specId: NEURO_SPEC, pratId: 'meyer-bisch' },
  { cle: 'MEYER-BISCH',         action: 'praticien', specId: NEURO_SPEC, pratId: 'meyer-bisch' },
  { cle: 'Dr MEYER-BISCH',      action: 'praticien', specId: NEURO_SPEC, pratId: 'meyer-bisch' },
  { cle: 'Meyer Bisch',         action: 'praticien', specId: NEURO_SPEC, pratId: 'meyer-bisch' },
  { cle: 'MEYER BISCH',         action: 'praticien', specId: NEURO_SPEC, pratId: 'meyer-bisch' },

  // Dr Dran
  { cle: 'Dr Dran',             action: 'praticien', specId: NEURO_SPEC, pratId: 'dran' },
  { cle: 'Dran',                action: 'praticien', specId: NEURO_SPEC, pratId: 'dran' },
  { cle: 'DRAN',                action: 'praticien', specId: NEURO_SPEC, pratId: 'dran' },
  { cle: 'Dr DRAN',             action: 'praticien', specId: NEURO_SPEC, pratId: 'dran' },

  // Dr Rolland
  { cle: 'Dr Rolland',          action: 'praticien', specId: NEURO_SPEC, pratId: 'rolland' },
  { cle: 'Rolland',             action: 'praticien', specId: NEURO_SPEC, pratId: 'rolland' },
  { cle: 'ROLLAND',             action: 'praticien', specId: NEURO_SPEC, pratId: 'rolland' },
  { cle: 'Dr ROLLAND',          action: 'praticien', specId: NEURO_SPEC, pratId: 'rolland' },
]

// ─── Chirurgie viscérale ──────────────────────────────────────────────────────
// Praticiens actuels : Malgoire, Flamein, Pissas (+ variantes courantes)

const VISC_SPEC = 'viscerale'

const REGLES_VISC = [
  // Dr Malgoire
  { cle: 'Dr Malgoire',         action: 'praticien', specId: VISC_SPEC, pratId: 'malgoire' },
  { cle: 'Malgoire',            action: 'praticien', specId: VISC_SPEC, pratId: 'malgoire' },
  { cle: 'MALGOIRE',            action: 'praticien', specId: VISC_SPEC, pratId: 'malgoire' },
  { cle: 'Dr MALGOIRE',         action: 'praticien', specId: VISC_SPEC, pratId: 'malgoire' },

  // Dr Flamein
  { cle: 'Dr Flamein',          action: 'praticien', specId: VISC_SPEC, pratId: 'flamein' },
  { cle: 'Flamein',             action: 'praticien', specId: VISC_SPEC, pratId: 'flamein' },
  { cle: 'FLAMEIN',             action: 'praticien', specId: VISC_SPEC, pratId: 'flamein' },
  { cle: 'Dr FLAMEIN',          action: 'praticien', specId: VISC_SPEC, pratId: 'flamein' },

  // Dr Pissas
  { cle: 'Dr Pissas',           action: 'praticien', specId: VISC_SPEC, pratId: 'pissas' },
  { cle: 'Pissas',              action: 'praticien', specId: VISC_SPEC, pratId: 'pissas' },
  { cle: 'PISSAS',              action: 'praticien', specId: VISC_SPEC, pratId: 'pissas' },
  { cle: 'Dr PISSAS',           action: 'praticien', specId: VISC_SPEC, pratId: 'pissas' },
]

// ─── Gastro / Coloscopies ─────────────────────────────────────────────────────
// TODO — À compléter avec les noms des gastro-entérologues fournis par l'utilisateur.
// Format attendu (un bloc par praticien, avec l'id correspondant à celui de mockData.js) :
//   { cle: 'Dr Untel',   action: 'praticien', specId: 'endoscopie', pratId: 'untel' },
//   { cle: 'UNTEL',      action: 'praticien', specId: 'endoscopie', pratId: 'untel' },

const REGLES_GASTRO = [
  // ← À REMPLIR
]

// ─── Pneumologie ──────────────────────────────────────────────────────────────
// TODO — À compléter avec les noms des pneumologues fournis par l'utilisateur.
// Tous convergent vers la spécialité « pneumologie » (total, sans détail praticien) :
//   { cle: 'Dr Pneumo',  action: 'specialite', specId: 'pneumologie' },

const REGLES_PNEUMO = [
  // ← À REMPLIR
]

// ─── Règles globales (motifs à ignorer, etc.) ─────────────────────────────────
// TODO — À compléter avec les valeurs précises à ignorer dès que fournies.
// Exemples :
//   { cle: 'Bloc',       action: 'ignorer' },
//   { cle: 'Visite',     action: 'ignorer' },

const REGLES_GLOBALES = [
  // ← À REMPLIR
]

// ─── Export ───────────────────────────────────────────────────────────────────

export const REGLES_DEFAUT = [
  ...REGLES_NEURO,
  ...REGLES_VISC,
  ...REGLES_GASTRO,
  ...REGLES_PNEUMO,
  ...REGLES_GLOBALES,
]
