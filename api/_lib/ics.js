// ============================================================
// ics.js — fabrique de flux iCalendar (RFC 5545), partagée par les DEUX
// abonnements du site : `api/agenda.js` (associés) et `api/agenda-iade.js` (IADE).
//
// POURQUOI une brique commune plutôt que deux assemblages de chaînes à la main :
// Apple Calendar pardonne à peu près tout, Google Agenda et Outlook non. Un flux
// qu'Apple affiche parfaitement peut être ajouté sans la moindre erreur chez eux,
// puis rester DÉSESPÉRÉMENT VIDE — l'abonnement apparaît, les journées jamais.
// C'est exactement le symptôme constaté le 2026-08-27. Trois causes, toutes ici :
//
//   1. **DTSTAMP absent.** Propriété OBLIGATOIRE d'un VEVENT (RFC 5545 § 3.6.1).
//      Apple la supplée, Google et Outlook jettent l'événement en silence — donc
//      les 119 événements du flux, un par un, sans un seul message d'erreur.
//   2. **Ligne de plus de 75 octets non repliée** (RFC 5545 § 3.1). Aucune note du
//      planning ne dépasse aujourd'hui, mais une seule un peu longue suffirait à
//      faire dérailler l'analyse — chez Outlook, tout le calendrier avec elle.
//   3. **Heure « flottante »** (`DTSTART:20260629T080000`, sans fuseau) : chaque
//      client l'interprète dans SON fuseau. Un agent en déplacement voyait ses
//      postes glisser. On déclare Europe/Paris une fois, dans un VTIMEZONE.
//
// Et un quatrième piège, structurel celui-là : `evenement()` renvoie un VEVENT
// ENTIER ou `null`. Impossible d'émettre un `BEGIN:VEVENT` sans son `END:VEVENT`
// — un seul bloc non refermé invalide le calendrier COMPLET, pas juste sa journée.
// ============================================================

export const TZID = 'Europe/Paris'

const OCTETS = new TextEncoder()
const pad = (n) => String(n).padStart(2, '0')

/** Échappe une valeur TEXT iCalendar (RFC 5545 § 3.3.11). */
export function escTexte(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Repli de ligne (RFC 5545 § 3.1) : 75 OCTETS maximum, la suite sur une ligne
 * commençant par une espace. On compte en octets et on itère par point de code :
 * un « é » pèse 2 octets et ne doit jamais être coupé en deux.
 */
export function plier(ligne) {
  const texte = String(ligne)
  if (OCTETS.encode(texte).length <= 75) return texte
  const morceaux = []
  let courant = ''
  let taille = 0
  for (const c of texte) {
    const n = OCTETS.encode(c).length
    // Les lignes de continuation portent une espace en tête : 74 octets utiles.
    const max = morceaux.length === 0 ? 75 : 74
    if (taille + n > max) {
      morceaux.push(courant)
      courant = ''
      taille = 0
    }
    courant += c
    taille += n
  }
  if (courant) morceaux.push(courant)
  return morceaux.map((m, i) => (i === 0 ? m : ` ${m}`)).join('\r\n')
}

/**
 * Horodatage UTC `YYYYMMDDTHHMMSSZ`. Sans argument (ou avec une date illisible),
 * l'instant courant : DTSTAMP dit quand l'objet iCalendar a été fabriqué, une
 * valeur toujours acceptable pour un flux publié.
 */
export function horodatage(quand) {
  let d = quand ? new Date(quand) : new Date()
  if (Number.isNaN(d.getTime())) d = new Date()
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

// Europe/Paris avec ses règles d'heure d'été : les clients qui ne connaissent pas
// la base tzdata (Outlook classique, entre autres) refusent un TZID non défini.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'X-LIC-LOCATION:Europe/Paris',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

/**
 * Un VEVENT complet, ou `null` si l'événement est incomplet — JAMAIS un fragment.
 *
 * Deux formes, exclusives :
 *   • journée entière : { jour:'YYYYMMDD', finJour:'YYYYMMDD' }  (fin exclusive)
 *   • à l'heure       : { jour:'YYYYMMDD', debut:'HHMM', fin:'HHMM' }
 *
 * @returns {string[]|null} les lignes du bloc.
 */
export function evenement({ uid, dtstamp, jour, finJour, debut, fin, titre, desc, transparent = false }) {
  if (!uid || !jour || !dtstamp) return null

  const lignes = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dtstamp}`]
  if (finJour) {
    lignes.push(`DTSTART;VALUE=DATE:${jour}`, `DTEND;VALUE=DATE:${finJour}`)
  } else if (debut && fin) {
    lignes.push(`DTSTART;TZID=${TZID}:${jour}T${debut}00`, `DTEND;TZID=${TZID}:${jour}T${fin}00`)
  } else {
    return null
  }
  lignes.push(`SUMMARY:${escTexte(titre || 'Planning')}`)
  if (desc) lignes.push(`DESCRIPTION:${escTexte(desc)}`)
  if (transparent) lignes.push('TRANSP:TRANSPARENT')
  lignes.push('END:VEVENT')
  return lignes
}

/**
 * Assemble le VCALENDAR. `evenements` = la sortie de `evenement()`, les `null`
 * étant simplement ignorés.
 *
 * @param {{nom: string, prodid: string, evenements?: Array<string[]|null>}} opts
 * @returns {string} le corps du `.ics`, lignes repliées, en CRLF.
 */
export function calendrier({ nom, prodid, evenements = [] }) {
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodid}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escTexte(nom)}`,
    `X-WR-TIMEZONE:${TZID}`,
    'X-PUBLISHED-TTL:PT6H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    ...VTIMEZONE,
    ...evenements.filter(Boolean).flat(),
    'END:VCALENDAR',
  ]
  return `${lignes.map(plier).join('\r\n')}\r\n`
}
