// ============================================================
// iadeRempla.js — logique pure des remplaçants IADE (onglet « Rempla »).
//
// Un besoin = un remplaçant à trouver, sur un jour. Deux besoins sur le même
// jour quand il en faut deux (rang 1 et 2). Rien ici ne parle au réseau : cette
// couche calcule, l'API écrit (cf. iadeRemplaApi.js, supabase/iade_remplacements.sql).
//
// Le texte du mail est produit ici plutôt que dans le composant : c'est la partie
// qu'on relira le plus souvent, et la seule qu'on puisse tester sans navigateur.
// ============================================================
import { plages, seSuivent, jourSuivant } from './iadeConges'

export const MAX_PAR_JOUR = 2

export const STATUTS_REMPLA = {
  recherche: { label: 'À pourvoir', couleur: 'var(--color-amber)',   fond: 'var(--color-amber-light)' },
  pourvu:    { label: 'Pourvu',     couleur: 'var(--color-success)', fond: 'var(--color-success-light)' },
}

// Conditions annoncées dans le mail. Elles vivent ici, en clair : le texte
// généré reste modifiable avant l'envoi, mais le défaut doit être juste.
export const TAUX_HORAIRE_BRUT = 30
export const LIEU_VACATION = 'endoscopies digestives (gastroscopies et coloscopies)'

export function libelleStatutRempla(statut) {
  return STATUTS_REMPLA[statut]?.label ?? statut
}

// ── Dates en toutes lettres, pour le mail ────────────────────────────────────

// « lundi 14 septembre 2026 ». Découpage à la main de l'ISO puis UTC : passer par
// new Date('2026-09-14') affiché en local peut reculer d'un jour.
export function jourLong(iso) {
  const [a, m, j] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

// « lundi 14 septembre 2026 » ou « du lundi 14 au vendredi 18 septembre 2026 ».
export function periodeLongue(debut, fin) {
  return debut === fin ? jourLong(debut) : `du ${jourLong(debut)} au ${jourLong(fin)}`
}

// Tous les jours d'un intervalle, bornes comprises, dans l'ordre — quel que soit
// le sens du glissement (Maj + clic vers le passé compris). Borné : une plage
// aberrante ne doit pas ouvrir mille lignes.
export function joursEntre(isoA, isoB, maximum = 62) {
  const [debut, fin] = isoA <= isoB ? [isoA, isoB] : [isoB, isoA]
  const out = []
  let courant = debut
  while (courant <= fin && out.length < maximum) {
    out.push(courant)
    courant = jourSuivant(courant)
  }
  return out
}

// ── Besoins ──────────────────────────────────────────────────────────────────

// jour ISO → besoins de ce jour, triés par rang.
export function indexerBesoins(besoins) {
  const index = new Map()
  for (const b of besoins) {
    if (!index.has(b.jour)) index.set(b.jour, [])
    index.get(b.jour).push(b)
  }
  for (const liste of index.values()) liste.sort((x, y) => x.rang - y.rang)
  return index
}

// Le rang libre sur ce jour, ou null si le maximum est atteint.
export function prochainRang(besoinsDuJour = []) {
  for (let rang = 1; rang <= MAX_PAR_JOUR; rang++) {
    if (!besoinsDuJour.some(b => b.rang === rang)) return rang
  }
  return null
}

// Ce qu'un clic sur une case du calendrier doit faire. Un clic ajoute un besoin ;
// arrivé au maximum, il remet le jour à zéro — mais SANS jamais toucher un besoin
// déjà pourvu ou déjà nommé : on ne perd pas un nom trouvé par un clic de trop.
export function actionClicJour(besoinsDuJour = []) {
  const rang = prochainRang(besoinsDuJour)
  if (rang !== null) return { action: 'ajouter', rang }

  const effacables = besoinsDuJour.filter(b => b.statut === 'recherche' && !b.nom?.trim())
  if (effacables.length === 0) {
    return { action: 'rien', motif: 'Ce jour porte des remplaçants nommés : retirez-les à la main.' }
  }
  return { action: 'retirer', ids: effacables.map(b => b.id) }
}

// [{ jour, nb }] pour les jours qui portent au moins un besoin, triés.
export function besoinsParJour(besoins) {
  return [...indexerBesoins(besoins).entries()]
    .map(([jour, liste]) => ({ jour, nb: liste.length, besoins: liste }))
    .sort((a, b) => a.jour.localeCompare(b.jour))
}

// ── Suggestions d'après les congés ───────────────────────────────────────────

// Là où un IADE est absent, il faut le plus souvent quelqu'un pour le couvrir.
// On propose donc ses plages de congés — demandées comme validées, parce qu'on
// cherche un remplaçant avant de valider, pas après — en ne gardant que les jours
// qui ne portent encore AUCUN besoin.
export function suggestionsDepuisConges(conges, besoins = [], { nomDe = () => '—' } = {}) {
  const couverts = indexerBesoins(besoins)
  const retenus = conges.filter(c => c.statut === 'validee' || c.statut === 'en_attente')

  return plages(retenus, ['user_id', 'statut', 'type_conge'])
    .map(p => {
      const jours = p.jours.map(j => j.jour)
      const aCouvrir = jours.filter(iso => !couverts.has(iso))
      return {
        cle:        `${p.user_id}|${p.debut}|${p.statut}`,
        user_id:    p.user_id,
        nom:        nomDe(p.user_id),
        statut:     p.statut,
        type_conge: p.type_conge,
        debut:      p.debut,
        fin:        p.fin,
        nb:         p.nb,
        jours,
        aCouvrir,
      }
    })
    .filter(s => s.aCouvrir.length > 0)
    .sort((a, b) => a.debut.localeCompare(b.debut) || a.nom.localeCompare(b.nom, 'fr'))
}

// ── Texte du mail ────────────────────────────────────────────────────────────

// Regroupe les jours consécutifs demandant le MÊME nombre de remplaçants :
// « du 14 au 18 septembre » se lit mieux que cinq lignes.
export function grouperPourMail(besoins) {
  const parJour = besoinsParJour(besoins)
  const groupes = []
  for (const j of parJour) {
    const courant = groupes[groupes.length - 1]
    if (courant && courant.nb === j.nb && seSuivent(courant.fin, j.jour)) {
      courant.fin = j.jour
      courant.jours.push(j.jour)
      continue
    }
    groupes.push({ debut: j.jour, fin: j.jour, nb: j.nb, jours: [j.jour] })
  }
  return groupes
}

// Le mail qu'on copie-colle pour chercher des remplaçants. Aucune signature ni
// coordonnée : elles s'ajoutent à la main avant l'envoi (choix assumé — le texte
// est modifiable dans l'écran avant d'être copié).
export function texteMailRempla(besoins) {
  const aChercher = besoins.filter(b => b.statut === 'recherche')
  if (aChercher.length === 0) return ''

  const groupes = grouperPourMail(aChercher)
  const total = aChercher.length
  const nbJours = new Set(aChercher.map(b => b.jour)).size

  const lignes = groupes.map(g => {
    const periode = periodeLongue(g.debut, g.fin)
    const combien = g.jours.length > 1 ? ` (${g.jours.length} jours)` : ''
    const deux = g.nb > 1 ? ` — ${g.nb} remplaçants` : ''
    return `- ${periode}${combien}${deux}`
  })

  return `Bonjour,

Nous sommes le SARM (Service d'Anesthésie-Réanimation du Millénaire), l'équipe d'anesthésistes de la clinique du Millénaire à Montpellier.

Nous recherchons un(e) infirmier(ère) anesthésiste diplômé(e) d'État pour des remplacements sur ${nbJours > 1 ? `les ${nbJours} journées suivantes` : 'la journée suivante'} :

${lignes.join('\n')}

Les vacations se déroulent aux ${LIEU_VACATION}.
La rémunération est de ${TAUX_HORAIRE_BRUT} € brut de l'heure.

${total > 1
  ? 'Si une partie seulement de ces dates vous convient, n\'hésitez pas : précisez-nous les journées que vous pouvez couvrir.'
  : 'Si cette date vous convient, faites-le nous savoir.'}

Merci d'avance,`
}

// ── Contrôles de saisie ──────────────────────────────────────────────────────

export function verifierNom(nom) {
  const propre = (nom ?? '').trim()
  if (propre.length < 2) return 'Indiquez le nom du remplaçant (2 caractères au moins).'
  if (propre.length > 80) return 'Ce nom est trop long (80 caractères au maximum).'
  return null
}
