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
    weekendsVeilleIndispo: [],   // sous-ensemble de weekendsIndispo : week-ends où l'associé ne veut
                                 // NI garde NI astreinte le VENDREDI qui précède (la veille du WE bloqué)
    noel: '',                    // texte libre : préférences fêtes de fin d'année (réparties à la main)
    colonnesSouhaitees: {},      // { <numSemaineISO>: <index de colonne> } sur la trame principale
    colonnesEte: { prioritaires: [], possibles: [], refusees: [] }, // choix de colonnes pour l'été (clés de colonne)
    commentaire: '',
  }
}

// Vrai si la date ISO 'YYYY-MM-DD' tombe un samedi ou un dimanche.
function estWeekendISO(iso) {
  const j = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return j === 0 || j === 6
}

// Fusionne une donnée stockée (potentiellement partielle) avec le modèle vide.
// Les jours off tombant un week-end sont écartés : non sélectionnables dans l'UI,
// on nettoie aussi côté données (défense contre une saisie forgée) car un off le
// week-end entrerait en conflit avec l'attribution des week-ends.
export function normaliser(data) {
  const fusion = { ...desiderataVide(), ...(data ?? {}) }
  fusion.joursOffSouhaites = (fusion.joursOffSouhaites ?? []).filter(iso => !estWeekendISO(iso))
  fusion.colonnesEte = { prioritaires: [], possibles: [], refusees: [], ...(fusion.colonnesEte ?? {}) }
  // La veille bloquée n'a de sens que pour un week-end effectivement indisponible.
  fusion.weekendsVeilleIndispo = (fusion.weekendsVeilleIndispo ?? []).filter(n => (fusion.weekendsIndispo ?? []).includes(n))
  return fusion
}

// Score de « demande » d'un associé = volume de desiderata formulés (jours off + vacances souhaitées +
// week-ends indisponibles + souhaits de colonne). Sert d'arbitrage d'équité : qui demande le plus absorbe
// les rapprochements inévitables (week-ends/vacances trop proches, gardes collées), donc le moins-demandeur
// est protégé. Utilisé identiquement par les étapes Week-ends, Vacances et En semaine.
export function scoreDemande(d) {
  return (d?.joursOffSouhaites?.length ?? 0)
    + (d?.vacancesSouhaitees?.length ?? 0)
    + (d?.weekendsIndispo?.length ?? 0)
    + Object.keys(d?.colonnesSouhaitees ?? {}).length
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
    (d.noel ?? '').trim() !== '' ||
    Object.keys(d.colonnesSouhaitees ?? {}).length > 0 ||
    (d.colonnesEte?.prioritaires?.length ?? 0) > 0 ||
    (d.colonnesEte?.possibles?.length ?? 0) > 0 ||
    (d.colonnesEte?.refusees?.length ?? 0) > 0 ||
    d.commentaire.trim() !== ''
  )
}
