import { supabaseAdmin } from './_lib/supabaseAdmin.js'

/**
 * GET /api/agenda-iade?token=<token> — flux iCalendar (.ics) PUBLIC d'un IADE, pour abonnement
 * (iPhone/Apple, Google, Outlook). Aucun JWT : protégé par le `token` non devinable (URL-capacité).
 *
 * Lit via le service_role : iade_agenda(token) → user_id + actif + data (événements cumulés).
 * data = [ { d:'YYYYMMDD', slot, titre, desc, (à l'heure) ts,te | (journée) allday, fin } ].
 * Token inconnu ou `actif=false` → calendrier VIDE (l'agenda abonné se vide au prochain rafraîchissement).
 */

function escTexte(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function calendrier(lignesEvenements) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SARM//Planning IADE//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:SARM — Mon planning IADE',
    'X-WR-TIMEZONE:Europe/Paris',
    'X-PUBLISHED-TTL:PT6H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    ...lignesEvenements,
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, max-age=0')
  res.setHeader('Content-Disposition', 'inline; filename="sarm-planning-iade.ics"')

  const token = (req.query?.token ?? new URL(req.url, 'http://x').searchParams.get('token') ?? '').toString().trim()

  try {
    if (!token) return res.status(200).send(calendrier([]))

    const { data: ab } = await supabaseAdmin
      .from('iade_agenda')
      .select('user_id, actif, data')
      .eq('token', token)
      .maybeSingle()
    if (!ab || !ab.actif) return res.status(200).send(calendrier([]))

    // UID stable par (jour, créneau, IADE) → mises à jour propres, purge des jours retirés.
    const base = String(ab.user_id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)
    const evts = Array.isArray(ab.data) ? ab.data : []
    const lignes = []
    for (const e of evts) {
      if (!e?.d || !e?.slot) continue
      lignes.push('BEGIN:VEVENT', `UID:${e.d}-${base}-${e.slot}@sarm-iade`)
      if (e.allday) {
        if (!e.fin) continue
        lignes.push(`DTSTART;VALUE=DATE:${e.d}`, `DTEND;VALUE=DATE:${e.fin}`)
      } else {
        if (!e.ts || !e.te) continue
        lignes.push(`DTSTART:${e.d}T${e.ts}00`, `DTEND:${e.d}T${e.te}00`)
      }
      lignes.push(`SUMMARY:${escTexte(e.titre || 'Planning')}`)
      if (e.desc) lignes.push(`DESCRIPTION:${escTexte(e.desc)}`)
      lignes.push('END:VEVENT')
    }
    return res.status(200).send(calendrier(lignes))
  } catch {
    // En cas d'erreur, ne pas casser l'abonnement : renvoyer un calendrier vide.
    return res.status(200).send(calendrier([]))
  }
}
