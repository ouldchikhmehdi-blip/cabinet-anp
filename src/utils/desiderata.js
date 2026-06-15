// ============================================================
// desiderata.js — modèle de données des desiderata (cf. PLANNING.md §11B).
// La persistance est dans desiderataApi.js (Supabase).
// Ici uniquement la forme de l'objet `data` (jsonb) et les helpers de lecture.
// ============================================================

export const ANNEE_DEFAUT = 2026

// Sous-semaine d'une période de vacances scolaires (qui dure 2 semaines).
// On ne prend jamais les deux : soit la 1ʳᵉ, soit la 2ᵉ, soit peu importe.
export const SOUS_SEMAINES = [
  { val: 's1', lib: '1ʳᵉ semaine' },
  { val: 's2', lib: '2ᵉ semaine' },
  { val: 'indifferent', lib: 'Peu importe (1ʳᵉ ou 2ᵉ)' },
]
export function labelSousSemaine(v) {
  return SOUS_SEMAINES.find(s => s.val === v)?.lib ?? null
}

// Objet desiderata vide — tous facultatifs. `soumis`/`updated_at` sont des
// colonnes SQL, hors de cet objet `data`.
export function desiderataVide() {
  return {
    rienASignaler: false,
    vacancesSouhaitees: [],      // numéros de semaine ISO
    vacancesRefusees: [],        // numéros de semaine ISO (contrainte négative)
    joursOffSouhaites: [],       // dates 'YYYY-MM-DD'
    preferenceVacancesScolaires: null, // 'paques' | 'fevrier' | null (exclusivité §8)
    prefVacancesSemaine: null,   // 's1' | 's2' | 'les-deux' | null (quelle semaine des vacances)
    toussaintSouhaitee: null,    // true | false | null
    toussaintSemaine: null,      // 's1' | 's2' | 'les-deux' | null
    weekendsIndispo: [],         // numéros de semaine ISO des week-ends indisponibles
    demandeColonneSemaineType: '',
    commentaire: '',
  }
}

// Fusionne une donnée stockée (potentiellement partielle) avec le modèle vide.
export function normaliser(data) {
  return { ...desiderataVide(), ...(data ?? {}) }
}

// Un associé est « rempli » (🟢) s'il a transmis (soumis), coché « rien à
// signaler », ou renseigné au moins un champ.
export function estRempli(d, soumis = false) {
  if (!d) return false
  if (soumis || d.rienASignaler) return true
  return (
    d.vacancesSouhaitees.length > 0 ||
    d.vacancesRefusees.length > 0 ||
    d.joursOffSouhaites.length > 0 ||
    d.preferenceVacancesScolaires !== null ||
    d.toussaintSouhaitee !== null ||
    d.weekendsIndispo.length > 0 ||
    d.demandeColonneSemaineType.trim() !== '' ||
    d.commentaire.trim() !== ''
  )
}
