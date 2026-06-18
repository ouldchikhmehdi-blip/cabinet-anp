import { supabaseAdmin } from './_lib/supabaseAdmin.js'

/**
 * GET /api/agenda?token=<token>  — flux iCalendar (.ics) PUBLIC d'un associé, pour abonnement
 * (iPhone/Apple, Google, Outlook). Aucun JWT : protégé par le `token` non devinable (URL-capacité).
 *
 * Lit via le service_role :
 *   planning_agenda(token) → user_id + actif ; profiles(initiales) ; planning_agenda_evenements (tiers validés).
 * Renvoie les événements « journée entière » de CET associé (gardes/astreintes/réa/vacances/récup).
 * Token inconnu ou `actif=false` → calendrier VIDE (l'agenda abonné se vide au prochain rafraîchissement).
 * Aucune donnée sensible : uniquement des rôles + initiales.
 */

const TITRES = { garde: 'Garde', astreinte: 'Astreinte', rea: 'Réanimation', vacances: 'Vacances', recup: 'Récup jour férié' }

function escTexte(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function compact(iso) {
  return String(iso).replace(/-/g, '')
}

function calendrier(lignesEvenements) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SARM//Planning anesthésie//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:SARM — Mon planning',
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
  res.setHeader('Content-Disposition', 'inline; filename="sarm-planning.ics"')

  const token = (req.query?.token ?? new URL(req.url, 'http://x').searchParams.get('token') ?? '').toString().trim()

  try {
    if (!token) return res.status(200).send(calendrier([]))

    const { data: ab } = await supabaseAdmin
      .from('planning_agenda')
      .select('user_id, actif')
      .eq('token', token)
      .maybeSingle()
    if (!ab || !ab.actif) return res.status(200).send(calendrier([]))

    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('initiales')
      .eq('id', ab.user_id)
      .maybeSingle()
    const ini = prof?.initiales
    if (!ini) return res.status(200).send(calendrier([]))

    const { data: rows } = await supabaseAdmin
      .from('planning_agenda_evenements')
      .select('data')

    const lignes = []
    for (const row of (rows ?? [])) {
      const evts = row?.data?.[ini]
      if (!Array.isArray(evts)) continue
      for (const e of evts) {
        if (!e?.d || !e?.fin || !e?.type) continue
        lignes.push(
          'BEGIN:VEVENT',
          // UID stable (même (associé, type, jour) → même UID) pour des mises à jour propres, pas de doublon.
          `UID:${ini}-${e.type}-${compact(e.d)}@cabinet-anp`,
          `DTSTART;VALUE=DATE:${compact(e.d)}`,
          `DTEND;VALUE=DATE:${compact(e.fin)}`,
          `SUMMARY:${escTexte(e.titre || TITRES[e.type] || e.type)}`,
          'TRANSP:TRANSPARENT',
          'END:VEVENT',
        )
      }
    }
    return res.status(200).send(calendrier(lignes))
  } catch {
    // En cas d'erreur, ne pas casser l'abonnement : renvoyer un calendrier vide.
    return res.status(200).send(calendrier([]))
  }
}
