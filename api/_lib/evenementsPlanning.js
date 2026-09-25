// ============================================================
// evenementsPlanning.js — transforme les lignes du planning publié
// (`iade_planning`) en événements d'agenda, pour le flux iCal d'un IADE.
//
// Mêmes règles que l'extraction depuis un mois collé
// (`src/utils/planningColle.js` → `extraireEvenementsIade`), mais à partir de la
// base plutôt que d'un copier-coller : quand l'agent a désigné SA colonne, son
// agenda suit le planning publié chaque nuit, sans qu'il ait plus rien à faire.
//
// Forme d'un événement, identique à celle stockée dans `iade_agenda.data` :
//   { d:'YYYYMMDD', slot, titre, desc,
//     (à l'heure) ts:'HHMM', te:'HHMM' | (journée) allday:true, fin:'YYYYMMDD' }
// ============================================================

// « 8h-18h », « 7h30-17h30 », « 13-18h », « 13h30-17h30 »
const RE_PLAGE = /^\s*(\d{1,2})(?:h(\d{2})?)?\s*[-–]\s*(\d{1,2})(?:h(\d{2})?)?/
const RE_HS = /\+?\s*\d+\s*h/i
const POSTES_LONG = { A: 'Bloc A', B: 'Bloc B' }

const pad = (n) => String(n).padStart(2, '0')

// « 7h30 », « 8h », « 13h30 » — l'heure telle qu'on l'écrit sur le planning.
const heureFr = ([h, m]) => m ? `${h}h${pad(m)}` : `${h}h`

// Une CPRE qui ne commence pas à 8 h porte son heure DANS LE TITRE. Le jeudi,
// la personne en CPRE fait 7h30-17h30 ; l'événement était bien à 7h30 dans
// l'agenda, mais titré « CPRE » comme les autres jours, et dans les têtes
// « CPRE = 8 h ». Le titre est la seule chose qu'on lit dans une vue mois ou
// dans une liste : c'est là que l'heure doit être, avec un « ! » pour dire que
// ce n'est pas l'horaire habituel.
export function titreAvecHeure(label, debut) {
  if (!debut || label.toUpperCase() !== 'CPRE') return label
  if (debut[0] === 8 && debut[1] === 0) return label
  return `${label} ${heureFr(debut)} !`
}

const compact = (iso) => iso.replace(/-/g, '')

// Lendemain au format compact : une journée entière iCal se termine le jour d'après.
function lendemain(iso) {
  const [a, m, j] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, j + 1))
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
}

function parsePlage(txt) {
  const m = RE_PLAGE.exec(txt)
  if (!m) return { debut: null, arret: null, label: txt.trim() }
  const label = txt.slice(m[0].length).trim()
  return {
    debut: [Number(m[1]), Number(m[2] || 0)],
    arret: [Number(m[3]), Number(m[4] || 0)],
    label: label ? (POSTES_LONG[label.toUpperCase()] || label) : 'Poste',
  }
}

/**
 * @param {Array<{jour, matin, apres_midi, note}>} lignes du planning, triées ou non.
 * @returns {Array} événements prêts pour le .ics.
 */
export function evenementsDepuisPlanning(lignes) {
  const evenements = []

  for (const l of lignes ?? []) {
    if (!l?.jour) continue
    const d = compact(l.jour)
    const finJournee = lendemain(l.jour)
    const note = String(l.note ?? '').trim()

    // Un jour de congé n'affiche PAS le poste : celui du planning est là pour le
    // remplaçant, pas pour l'agent qui est absent.
    if (note.toLowerCase().includes('cong')) {
      evenements.push({
        d, slot: 'conge', allday: true, fin: finJournee,
        titre: note.charAt(0).toUpperCase() + note.slice(1),
        desc: '',
      })
      continue
    }

    const hs = (RE_HS.test(note) || note.toLowerCase() === 'hs') ? note : ''

    // Des heures sup un jour sans poste, ça existe (l'agent est venu en renfort
    // sur une journée marquée OFF). Sans ce cas, sa journée n'apparaîtrait nulle
    // part dans son agenda alors qu'il a travaillé.
    const aucunPoste = ['m', 'a'].every(k => {
      const t = String((k === 'm' ? l.matin : l.apres_midi) ?? '').trim()
      return !t || t.toUpperCase() === 'OFF'
    })
    if (hs && aucunPoste) {
      evenements.push({
        d, slot: 'hs', allday: true, fin: finJournee,
        titre: `Heures sup ${hs}`, desc: '',
      })
      continue
    }

    for (const [slot, brut] of [['m', l.matin], ['a', l.apres_midi]]) {
      const txt = String(brut ?? '').trim()
      if (!txt || txt.toUpperCase() === 'OFF') continue

      const { debut, arret, label } = parsePlage(txt)
      const desc = txt + (hs ? `  (HS ${hs})` : '')
      if (!debut) {
        evenements.push({ d, slot, allday: true, fin: finJournee, titre: label, desc })
      } else {
        const titre = titreAvecHeure(label, debut)
        evenements.push({
          d, slot,
          ts: `${pad(debut[0])}${pad(debut[1])}`,
          te: `${pad(arret[0])}${pad(arret[1])}`,
          titre,
          desc: titre === label ? desc : `Début à ${heureFr(debut)} (et non 8h). ${desc}`,
        })
      }
    }
  }

  return evenements
}

// Superpose aux lignes du miroir les cases modifiées depuis le dashboard
// (`iade_planning_modifs`, cf. IADE.md § 12 bis) — l'agenda de l'agent doit
// changer quand sa case change, pas au prochain passage de la chaîne. Une
// modification 'annulee' remet ce que le fichier disait. La note reste celle
// du miroir : congés et heures sup ont leurs propres circuits.
export function superposerModifs(lignes, modifs) {
  if (!modifs || modifs.length === 0) return lignes
  const parJour = new Map(modifs.map(m => [m.jour, m]))
  return (lignes ?? []).map(l => {
    const m = parJour.get(l?.jour)
    if (!m) return l
    const source = m.statut === 'annulee' ? (m.fichier ?? null) : m
    if (!source) return l
    return { ...l, matin: source.matin ?? null, apres_midi: source.apres_midi ?? null }
  })
}
