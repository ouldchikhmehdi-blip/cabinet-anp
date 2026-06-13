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
// 18 gastro-entérologues de la Clinique du Millénaire.
// La normaliserCle() gère déjà les accents et la casse — une entrée par
// graphie distincte (prénom inclus, prénom seul, avec/sans Dr) suffit.

const GASTRO = 'endoscopie'

const REGLES_GASTRO = [
  // Ayral Jean
  { cle: 'AYRAL Jean',         action: 'praticien', specId: GASTRO, pratId: 'ayral' },
  { cle: 'Dr AYRAL',           action: 'praticien', specId: GASTRO, pratId: 'ayral' },
  { cle: 'AYRAL',              action: 'praticien', specId: GASTRO, pratId: 'ayral' },

  // Blanc Christophe
  { cle: 'BLANC Christophe',   action: 'praticien', specId: GASTRO, pratId: 'blanc' },
  { cle: 'Dr BLANC',           action: 'praticien', specId: GASTRO, pratId: 'blanc' },
  { cle: 'BLANC',              action: 'praticien', specId: GASTRO, pratId: 'blanc' },

  // Charpy Flora
  { cle: 'CHARPY Flora',       action: 'praticien', specId: GASTRO, pratId: 'charpy' },
  { cle: 'Dr CHARPY',          action: 'praticien', specId: GASTRO, pratId: 'charpy' },
  { cle: 'CHARPY',             action: 'praticien', specId: GASTRO, pratId: 'charpy' },

  // Espérance Claire (Mme, sans Dr)
  { cle: 'ESPERANCE Claire',   action: 'praticien', specId: GASTRO, pratId: 'esperance' },
  { cle: 'Mme ESPERANCE',      action: 'praticien', specId: GASTRO, pratId: 'esperance' },
  { cle: 'ESPERANCE',          action: 'praticien', specId: GASTRO, pratId: 'esperance' },

  // Fedkovic Yvan
  { cle: 'FEDKOVIC Yvan',      action: 'praticien', specId: GASTRO, pratId: 'fedkovic' },
  { cle: 'Dr FEDKOVIC',        action: 'praticien', specId: GASTRO, pratId: 'fedkovic' },
  { cle: 'FEDKOVIC',           action: 'praticien', specId: GASTRO, pratId: 'fedkovic' },

  // Garcia Valérie
  { cle: 'GARCIA Valérie',     action: 'praticien', specId: GASTRO, pratId: 'garcia' },
  { cle: 'GARCIA Valerie',     action: 'praticien', specId: GASTRO, pratId: 'garcia' },
  { cle: 'Dr GARCIA',          action: 'praticien', specId: GASTRO, pratId: 'garcia' },
  { cle: 'GARCIA',             action: 'praticien', specId: GASTRO, pratId: 'garcia' },

  // Guillet Robert
  { cle: 'GUILLET Robert',     action: 'praticien', specId: GASTRO, pratId: 'guillet' },
  { cle: 'Dr GUILLET',         action: 'praticien', specId: GASTRO, pratId: 'guillet' },
  { cle: 'GUILLET',            action: 'praticien', specId: GASTRO, pratId: 'guillet' },

  // Hanslik Bertrand
  { cle: 'HANSLIK Bertrand',   action: 'praticien', specId: GASTRO, pratId: 'hanslik' },
  { cle: 'Dr HANSLIK',         action: 'praticien', specId: GASTRO, pratId: 'hanslik' },
  { cle: 'HANSLIK',            action: 'praticien', specId: GASTRO, pratId: 'hanslik' },

  // Lhote Camille (également Chirurgie viscérale — classé Gastro par défaut)
  { cle: 'LHOTE Camille',      action: 'praticien', specId: GASTRO, pratId: 'lhote' },
  { cle: 'Dr LHOTE',           action: 'praticien', specId: GASTRO, pratId: 'lhote' },
  { cle: 'LHOTE',              action: 'praticien', specId: GASTRO, pratId: 'lhote' },

  // Liautard Jacques
  { cle: 'LIAUTARD Jacques',   action: 'praticien', specId: GASTRO, pratId: 'liautard' },
  { cle: 'Dr LIAUTARD',        action: 'praticien', specId: GASTRO, pratId: 'liautard' },
  { cle: 'LIAUTARD',           action: 'praticien', specId: GASTRO, pratId: 'liautard' },

  // Louvety Stéphane
  { cle: 'LOUVETY Stéphane',   action: 'praticien', specId: GASTRO, pratId: 'louvety' },
  { cle: 'LOUVETY Stephane',   action: 'praticien', specId: GASTRO, pratId: 'louvety' },
  { cle: 'Dr LOUVETY',         action: 'praticien', specId: GASTRO, pratId: 'louvety' },
  { cle: 'LOUVETY',            action: 'praticien', specId: GASTRO, pratId: 'louvety' },

  // Monnin Jean-Luc
  { cle: 'MONNIN Jean-Luc',    action: 'praticien', specId: GASTRO, pratId: 'monnin' },
  { cle: 'MONNIN Jean Luc',    action: 'praticien', specId: GASTRO, pratId: 'monnin' },
  { cle: 'Dr MONNIN',          action: 'praticien', specId: GASTRO, pratId: 'monnin' },
  { cle: 'MONNIN',             action: 'praticien', specId: GASTRO, pratId: 'monnin' },

  // Rollin Nicolas
  { cle: 'ROLLIN Nicolas',     action: 'praticien', specId: GASTRO, pratId: 'rollin' },
  { cle: 'Dr ROLLIN',          action: 'praticien', specId: GASTRO, pratId: 'rollin' },
  { cle: 'ROLLIN',             action: 'praticien', specId: GASTRO, pratId: 'rollin' },

  // Rudler Franz
  { cle: 'RUDLER Franz',       action: 'praticien', specId: GASTRO, pratId: 'rudler' },
  { cle: 'Dr RUDLER',          action: 'praticien', specId: GASTRO, pratId: 'rudler' },
  { cle: 'RUDLER',             action: 'praticien', specId: GASTRO, pratId: 'rudler' },

  // Saloum Thierry
  { cle: 'SALOUM Thierry',     action: 'praticien', specId: GASTRO, pratId: 'saloum' },
  { cle: 'Dr SALOUM',          action: 'praticien', specId: GASTRO, pratId: 'saloum' },
  { cle: 'SALOUM',             action: 'praticien', specId: GASTRO, pratId: 'saloum' },

  // Suma Constance
  { cle: 'SUMA Constance',     action: 'praticien', specId: GASTRO, pratId: 'suma' },
  { cle: 'Dr SUMA',            action: 'praticien', specId: GASTRO, pratId: 'suma' },
  { cle: 'SUMA',               action: 'praticien', specId: GASTRO, pratId: 'suma' },

  // Valats Jean-Christophe
  { cle: 'VALATS Jean-Christophe', action: 'praticien', specId: GASTRO, pratId: 'valats' },
  { cle: 'VALATS Jean Christophe', action: 'praticien', specId: GASTRO, pratId: 'valats' },
  { cle: 'Dr VALATS',          action: 'praticien', specId: GASTRO, pratId: 'valats' },
  { cle: 'VALATS',             action: 'praticien', specId: GASTRO, pratId: 'valats' },

  // Vercambre Aufort Lucile
  { cle: 'VERCAMBRE AUFORT Lucile', action: 'praticien', specId: GASTRO, pratId: 'vercambre-aufort' },
  { cle: 'VERCAMBRE-AUFORT Lucile', action: 'praticien', specId: GASTRO, pratId: 'vercambre-aufort' },
  { cle: 'Dr VERCAMBRE AUFORT',     action: 'praticien', specId: GASTRO, pratId: 'vercambre-aufort' },
  { cle: 'Dr VERCAMBRE-AUFORT',     action: 'praticien', specId: GASTRO, pratId: 'vercambre-aufort' },
  { cle: 'VERCAMBRE AUFORT',        action: 'praticien', specId: GASTRO, pratId: 'vercambre-aufort' },
  { cle: 'VERCAMBRE-AUFORT',        action: 'praticien', specId: GASTRO, pratId: 'vercambre-aufort' },
]

// ─── Pneumologie ─────────────────────────────────────────────────────────────
// 6 pneumologues de la Clinique du Millénaire.
// Tous convergent vers la spécialité « pneumologie » (total uniquement,
// pas de détail par praticien).

const PNEUMO = 'pneumologie'

const REGLES_PNEUMO = [
  // Bughin François
  { cle: 'BUGHIN François',         action: 'specialite', specId: PNEUMO },
  { cle: 'BUGHIN Francois',         action: 'specialite', specId: PNEUMO },
  { cle: 'Dr BUGHIN',               action: 'specialite', specId: PNEUMO },
  { cle: 'BUGHIN',                  action: 'specialite', specId: PNEUMO },

  // Demazeau Clément
  { cle: 'DEMAZEAU Clément',        action: 'specialite', specId: PNEUMO },
  { cle: 'DEMAZEAU Clement',        action: 'specialite', specId: PNEUMO },
  { cle: 'Dr DEMAZEAU',             action: 'specialite', specId: PNEUMO },
  { cle: 'DEMAZEAU',                action: 'specialite', specId: PNEUMO },

  // Froment Catherine
  { cle: 'FROMENT Catherine',       action: 'specialite', specId: PNEUMO },
  { cle: 'Dr FROMENT',              action: 'specialite', specId: PNEUMO },
  { cle: 'FROMENT',                 action: 'specialite', specId: PNEUMO },

  // Gautier Dechaud Véronique (nom composé)
  { cle: 'GAUTIER DECHAUD Véronique', action: 'specialite', specId: PNEUMO },
  { cle: 'GAUTIER DECHAUD Veronique', action: 'specialite', specId: PNEUMO },
  { cle: 'GAUTIER-DECHAUD Véronique', action: 'specialite', specId: PNEUMO },
  { cle: 'GAUTIER-DECHAUD Veronique', action: 'specialite', specId: PNEUMO },
  { cle: 'Dr GAUTIER DECHAUD',      action: 'specialite', specId: PNEUMO },
  { cle: 'Dr GAUTIER-DECHAUD',      action: 'specialite', specId: PNEUMO },
  { cle: 'GAUTIER DECHAUD',         action: 'specialite', specId: PNEUMO },
  { cle: 'GAUTIER-DECHAUD',         action: 'specialite', specId: PNEUMO },

  // Maestre Corinne
  { cle: 'MAESTRE Corinne',         action: 'specialite', specId: PNEUMO },
  { cle: 'Dr MAESTRE',              action: 'specialite', specId: PNEUMO },
  { cle: 'MAESTRE',                 action: 'specialite', specId: PNEUMO },

  // Marcano Xavier
  { cle: 'MARCANO Xavier',          action: 'specialite', specId: PNEUMO },
  { cle: 'Dr MARCANO',              action: 'specialite', specId: PNEUMO },
  { cle: 'MARCANO',                 action: 'specialite', specId: PNEUMO },
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
