// ============================================================
// iadePlanning.js — logique pure de l'onglet « Planning IADE » (lecture seule).
//
// Les données viennent des tables `iade_planning*`, miroir du fichier Excel
// publié chaque nuit sur Dropbox (cf. IADE.md § « Planning IADE »). Le fichier
// fait foi : rien ici ne calcule un planning, on ne fait que le mettre en forme.
//
// Les couleurs reprennent celles du fichier Excel, volontairement : l'équipe
// lit le même planning des deux côtés, il doit avoir la même tête.
// ============================================================

export const POSTES = {
  A:       { libelle: 'Bloc A',    couleur: '#3E7CB1' },
  B:       { libelle: 'Bloc B',    couleur: '#57A639' },
  CPRE:    { libelle: 'CPRE',      couleur: '#8E5AA8' },
  VISC:    { libelle: 'Viscérale', couleur: '#E07B22' },
  RENFORT: { libelle: 'Renfort',   couleur: '#1F9E9E' },
  OFF:     { libelle: 'OFF / repos', couleur: '#C9C7BF' },
}

export const COULEUR_CONGE = '#E24A3B'
export const COULEUR_HS = '#F4D8B8'
export const COULEUR_VACANCES = '#FFE800'

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

export function couleurPoste(poste) {
  return POSTES[poste]?.couleur ?? null
}

// « 2026-09-02 » → { iso, jour: 2, libelleJour: 'Mercredi', court: 'mer. 02/09' }
// Découpage à la main plutôt que new Date(iso) : pas de dérive de fuseau.
export function decrire(iso) {
  const [a, m, j] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, j))
  const libelleJour = JOURS_FR[d.getUTCDay()]
  return {
    iso,
    annee: a,
    mois: m,
    jour: j,
    libelleJour,
    court: `${libelleJour.slice(0, 3).toLowerCase()}. ${String(j).padStart(2, '0')}/${String(m).padStart(2, '0')}`,
  }
}

// Premier et dernier jour d'un mois, au format ISO — bornes d'une requête.
export function bornesDuMois(annee, mois) {
  const fin = new Date(Date.UTC(annee, mois, 0)).getUTCDate()
  const p = n => String(n).padStart(2, '0')
  return { debut: `${annee}-${p(mois)}-01`, fin: `${annee}-${p(mois)}-${p(fin)}` }
}

// Les colonnes du mois, dans l'ordre du fichier Excel (`rang`), pas alphabétique :
// l'équipe cherche « la colonne de Cathy » là où elle est dans le fichier.
export function colonnesDuMois(cases) {
  const parNom = new Map()
  for (const c of cases) {
    const vu = parNom.get(c.iade)
    if (vu === undefined || c.rang < vu) parNom.set(c.iade, c.rang)
  }
  return [...parNom.entries()]
    .sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0], 'fr'))
    .map(([nom]) => nom)
}

// { '2026-09-02': { infos, cases: Map(nom → case) } }, prêt pour l'affichage.
export function indexerParJour(cases, jours) {
  const index = new Map()
  for (const j of jours) index.set(j.jour, { infos: j, cases: new Map() })
  for (const c of cases) {
    if (!index.has(c.jour)) index.set(c.jour, { infos: { jour: c.jour, vacances: false, remplacants: [] }, cases: new Map() })
    index.get(c.jour).cases.set(c.iade, c)
  }
  return index
}

// Ce qu'on affiche dans une case : le poste reste visible même en congé, pour
// que le remplaçant sache où aller — c'est la règle du fichier Excel.
export function texteCase(c) {
  if (!c) return { haut: '', bas: '', pleine: true }
  if (c.kind === 'off' || c.poste === 'OFF') return { haut: 'OFF', bas: '', pleine: true }
  if (c.matin && c.apres_midi) return { haut: c.matin, bas: c.apres_midi, pleine: false }
  return { haut: c.matin || c.apres_midi || '', bas: '', pleine: true }
}

// Le jour à ouvrir par défaut : aujourd'hui s'il est dans le mois affiché,
// sinon le premier jour travaillé du mois.
export function jourParDefaut(index, aujourdHui) {
  if (index.has(aujourdHui)) return aujourdHui
  const cles = [...index.keys()].sort()
  return cles[0] ?? null
}
