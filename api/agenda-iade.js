import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { evenementsDepuisPlanning } from './_lib/evenementsPlanning.js'

/**
 * GET /api/agenda-iade?token=<token> — flux iCalendar (.ics) PUBLIC d'un IADE, pour abonnement
 * (iPhone/Apple, Google, Outlook). Aucun JWT : protégé par le `token` non devinable (URL-capacité).
 *
 * Lit via le service_role : iade_agenda(token) → user_id + actif + colonne + data.
 * data = [ { d:'YYYYMMDD', slot, titre, desc, (à l'heure) ts,te | (journée) allday, fin } ].
 *
 * DEUX sources possibles, et `colonne` l'emporte :
 *   • `colonne` renseignée → les événements sont RECALCULÉS à chaque appel depuis le
 *     planning publié (`iade_planning`, colonne `iade`). L'agent a désigné sa colonne une
 *     fois ; son agenda suit ensuite la republication nocturne, sans plus rien coller.
 *   • sinon → `data`, les événements figés qu'il a poussés en collant des mois.
 * Laisser les deux vivantes en même temps mettrait deux vérités dans le même agenda.
 *
 * Token inconnu ou `actif=false` → calendrier VIDE (l'agenda abonné se vide au prochain rafraîchissement).
 */

// Fenêtre publiée dans l'agenda : deux mois en arrière (le mois écoulé se consulte
// encore) jusqu'à la fin de l'année suivante (le planning se fait à l'année).
function fenetre() {
  const maintenant = new Date()
  return {
    debut: new Date(maintenant.getTime() - 62 * 86400000).toISOString().slice(0, 10),
    fin: `${maintenant.getUTCFullYear() + 1}-12-31`,
  }
}

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
      .select('user_id, actif, colonne, data')
      .eq('token', token)
      .maybeSingle()
    if (!ab || !ab.actif) return res.status(200).send(calendrier([]))

    // UID stable par (jour, créneau, IADE) → mises à jour propres, purge des jours retirés.
    const base = String(ab.user_id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)

    let evts
    if (ab.colonne) {
      const { debut, fin } = fenetre()
      const { data: lignes } = await supabaseAdmin
        .from('iade_planning')
        .select('jour, matin, apres_midi, note')
        .eq('iade', ab.colonne)
        .gte('jour', debut)
        .lte('jour', fin)
        .order('jour')
      evts = evenementsDepuisPlanning(lignes ?? [])
    } else {
      evts = Array.isArray(ab.data) ? ab.data : []
    }
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
