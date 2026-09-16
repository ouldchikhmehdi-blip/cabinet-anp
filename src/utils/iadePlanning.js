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

// Poste lu dans le libellé d'une demi-journée : « 13h-18h B » → 'B'.
//
// Même ordre de détection que `detect_poste()` dans convertir_mois.py, le script
// qui peint le fichier Excel : les deux doivent lire le fichier de la même façon,
// sinon le dashboard et la Dropbox se contrediraient sur la couleur d'une case.
export function posteDepuisTexte(texte) {
  const u = (texte ?? '').toUpperCase()
  if (!u.trim()) return null
  if (u.includes('CPRE')) return 'CPRE'
  if (u.includes('VIS')) return 'VISC'
  if (u.includes('RENFOR')) return 'RENFORT'
  if (u.startsWith('OFF')) return 'OFF'
  if (/\bA\b/.test(u)) return 'A'
  if (/\bB\b/.test(u)) return 'B'
  return null
}

// Les moitiés colorées d'une case : une seule pour une journée pleine, deux pour
// une journée coupée.
//
// Une journée coupée porte souvent DEUX postes différents — « CPRE » le matin,
// « 13h-18h B » l'après-midi. Le miroir n'en retient qu'un (`poste`, celui du
// matin), alors que le fichier Excel peint bien deux cellules de deux couleurs.
// On relit donc le poste de chaque moitié dans son propre libellé, sans quoi le
// vendredi s'affiche violet CPRE toute la journée alors que l'après-midi est au
// Bloc B — et le dashboard contredit la Dropbox.
export function moitiesCase(c) {
  const t = texteCase(c)
  if (t.pleine) return [{ texte: t.haut, poste: posteDepuisTexte(t.haut) ?? c?.poste ?? null }]
  return [
    { texte: t.haut, poste: posteDepuisTexte(t.haut) },
    { texte: t.bas, poste: posteDepuisTexte(t.bas) },
  ]
}

// La note d'une case dit l'une des deux seules choses qui comptent en plus du
// poste : la personne est en congé, ou elle fait des heures supplémentaires.
// Le fichier Excel les écrit à sa façon (« Congé », « +10h », « HS ») ; on les
// range en deux natures pour pouvoir les afficher franchement.
export function natureNote(note) {
  const t = (note ?? '').trim().toLowerCase()
  if (!t) return null
  if (t.startsWith('cong')) return 'conge'          // « Congé », « Conge », « congés »
  return 'hs'
}

// Ce qu'on écrit dans la colonne « Congé / HS ». Le libellé du congé est gardé tel
// que le fichier l'écrit (« Congé », mais aussi « Congé CP », « Congé récup. »
// quand la nature est connue) : la colonne est assez large pour le dire.
// « +10h » devient « +10 h » : à cette taille, l'espace est ce qui empêche de
// lire « 10h » comme un horaire.
export function libelleNote(note) {
  const nature = natureNote(note)
  if (!nature) return ''
  const propre = (note ?? '').trim()
  if (nature === 'conge') return propre.charAt(0).toUpperCase() + propre.slice(1)
  const heures = propre.match(/^\+?\s*(\d+(?:[.,]\d+)?)\s*h/i)
  return heures ? `+${heures[1].replace(',', '.')} h` : propre.toUpperCase()
}

// Numéro de semaine ISO. Il sert à séparer visuellement les semaines dans la
// grille, comme le fichier Excel le fait avec une ligne vide : sans cette
// respiration, un mois entier se lit comme un seul bloc.
export function semaineISO(iso) {
  const [a, m, j] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, j))
  const jourSemaine = d.getUTCDay() || 7          // dimanche = 7, comme la norme ISO
  d.setUTCDate(d.getUTCDate() + 4 - jourSemaine)  // on se cale sur le jeudi de la semaine
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - debutAnnee) / 86400000 + 1) / 7)
}

// ── Cases modifiées depuis le dashboard ──────────────────────────────────────
// Depuis le 2026-09-16, la gestion IADE corrige une case (poste, horaires) dans
// l'onglet lui-même. Ces modifications vivent dans `iade_planning_modifs` et se
// SUPERPOSENT au miroir à l'affichage — le miroir reste ce que le fichier dit,
// et la chaîne du mini PC reporte la case modifiée dans le fichier Dropbox.
// Cf. supabase/iade_planning_modifs.sql et IADE.md § 12 bis.

// Le poste tel que le fichier l'écrit dans une case : « 8h-18h B », « CPRE »,
// « 10h-20h Viscérale ». C'est ce texte que `posteDepuisTexte` (et le script
// Excel) relit — écrire autre chose ferait une case sans couleur.
export const LIBELLE_POSTE_CASE = { A: 'A', B: 'B', CPRE: 'CPRE', VISC: 'Viscérale', RENFORT: 'Renfort' }

const compacter = (t) => (t ?? '').replace(/\s+/g, ' ').trim()

// Heures de début et de fin lues dans un texte : « 7h30-13h A » → [7, 13].
function heuresDe(texte) {
  const ms = [...(texte ?? '').matchAll(/(\d{1,2})h(\d{0,2})/g)]
  if (ms.length === 0) return [null, null]
  return [Number(ms[0][1]), Number(ms[ms.length - 1][1])]
}

// Retire le poste écrit dans le texte d'une demi-journée et pose le nouveau, en
// gardant les horaires : « 8h-18h B » + CPRE → « 8h-18h CPRE ».
export function remplacerPoste(texte, poste) {
  const sans = compacter(
    (texte ?? '')
      .replace(/\bCPRE\b/gi, ' ')
      .replace(/\bvisc\S*/gi, ' ')
      .replace(/\brenfor\S*/gi, ' ')
      .replace(/\bOFF\b/gi, ' ')
      .replace(/\b[AB]\b/g, ' ')
  )
  const libelle = LIBELLE_POSTE_CASE[poste]
  if (!libelle) return sans
  return sans ? `${sans} ${libelle}` : libelle
}

// Ce que le formulaire dit → la case à enregistrer, ou null s'il n'y a rien à
// enregistrer (journée coupée sans aucun texte, journée pleine vide).
// La forme (`kind`) suit convertir_mois.py : c'est elle qui décide, dans l'Excel,
// si les deux cellules sont fusionnées ou non.
export function composerCase({ mode, matin, apres_midi }) {
  if (mode === 'off') return { kind: 'off', matin: null, apres_midi: null, poste: 'OFF' }
  const m = compacter(matin)
  const a = compacter(apres_midi)
  if (mode === 'pleine') {
    if (!m) return null
    return { kind: 'full', matin: m, apres_midi: null, poste: posteDepuisTexte(m) }
  }
  if (m && a) return { kind: 'split', matin: m, apres_midi: a, poste: posteDepuisTexte(m) ?? posteDepuisTexte(a) }
  if (m) return { kind: 'matin', matin: m, apres_midi: null, poste: posteDepuisTexte(m) }
  if (a) return { kind: 'aprem', matin: null, apres_midi: a, poste: posteDepuisTexte(a) }
  return null
}

// La case affichée → ce que le formulaire ouvre. Le miroir ne garde pas la forme :
// une demi-journée seule y ressemble à une journée pleine. On la retrouve comme le
// fichier la lit (parse_trio) : commence à 12 h ou plus → après-midi ; finit avant
// 14 h → matin ; sinon journée pleine.
export function formulaireDeCase(c) {
  if (!c || c.poste === 'OFF' || c.kind === 'off') return { mode: 'off', matin: '', apres_midi: '' }
  const m = compacter(c.matin)
  const a = compacter(c.apres_midi)
  if (c.kind === 'split' || (m && a)) return { mode: 'coupee', matin: m, apres_midi: a }
  if (c.kind === 'matin') return { mode: 'coupee', matin: m, apres_midi: '' }
  if (c.kind === 'aprem' || (!m && a)) return { mode: 'coupee', matin: '', apres_midi: a }
  if (c.kind === 'full') return { mode: 'pleine', matin: m, apres_midi: '' }
  const [debut, fin] = heuresDe(m)
  if (debut !== null && debut >= 12) return { mode: 'coupee', matin: '', apres_midi: m }
  if (debut !== null && fin !== null && fin < 14) return { mode: 'coupee', matin: m, apres_midi: '' }
  return { mode: 'pleine', matin: m, apres_midi: '' }
}

// Deux cases disent-elles la même chose ? Sert à ne pas enregistrer (ni annoncer
// à l'agent) une modification qui ne change rien.
export function memeCase(a, b) {
  const off = (c) => !c || c.poste === 'OFF' || c.kind === 'off'
  if (off(a) || off(b)) return off(a) && off(b)
  return compacter(a.matin) === compacter(b.matin) && compacter(a.apres_midi) === compacter(b.apres_midi)
}

// Superpose au miroir les modifications du dashboard. Une modification 'active'
// remplace la case ; une modification 'annulee' (« Revenir au fichier ») remet
// dès maintenant ce que le fichier disait, sans attendre la republication.
// La note (congé, heures sup) n'est jamais touchée : elle a ses propres circuits.
export function appliquerModifs(cases, modifs) {
  if (!modifs || modifs.length === 0) return cases
  const index = new Map(modifs.map(m => [`${m.jour}|${m.iade}`, m]))
  return cases.map(c => {
    const m = index.get(`${c.jour}|${c.iade}`)
    if (!m) return c
    if (m.statut === 'annulee') {
      if (!m.fichier) return { ...c, modif: { ...m, retour: true } }
      const f = m.fichier
      return { ...c, matin: f.matin ?? null, apres_midi: f.apres_midi ?? null, poste: f.poste ?? null, modif: { ...m, retour: true } }
    }
    return { ...c, kind: m.kind, matin: m.matin ?? null, apres_midi: m.apres_midi ?? null, poste: m.poste ?? null, modif: m }
  })
}

// Une case en une ligne, pour les messages : « 8h-18h B », « CPRE / 13h-18h B »,
// « 7h30-13h A (matin) », « OFF », « — » si vide.
export function resumeCase(c) {
  if (!c) return '—'
  if (c.poste === 'OFF' || c.kind === 'off') return 'OFF'
  const m = compacter(c.matin)
  const a = compacter(c.apres_midi)
  if (m && a) return `${m} / ${a}`
  if (c.kind === 'matin' && m) return `${m} (matin)`
  if (c.kind === 'aprem' && a) return `${a} (après-midi)`
  return m || a || '—'
}
