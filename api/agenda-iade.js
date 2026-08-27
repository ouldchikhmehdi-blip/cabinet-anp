import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { evenementsDepuisPlanning } from './_lib/evenementsPlanning.js'
import { calendrier, evenement, horodatage } from './_lib/ics.js'

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
 *
 * La conformité du .ics (DTSTAMP, repli des lignes, fuseau déclaré) est tenue par
 * `_lib/ics.js` : sans elle, Google et Outlook acceptaient l'abonnement puis
 * n'affichaient AUCUNE journée. Voir l'en-tête de ce fichier.
 */

const NOM_CALENDRIER = 'SARM — Mon planning IADE'
const PRODID = '-//SARM//Planning IADE//FR'

const vide = () => calendrier({ nom: NOM_CALENDRIER, prodid: PRODID, evenements: [] })

// Fenêtre publiée dans l'agenda : deux mois en arrière (le mois écoulé se consulte
// encore) jusqu'à la fin de l'année suivante (le planning se fait à l'année).
function fenetre() {
  const maintenant = new Date()
  return {
    debut: new Date(maintenant.getTime() - 62 * 86400000).toISOString().slice(0, 10),
    fin: `${maintenant.getUTCFullYear() + 1}-12-31`,
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, max-age=0')
  res.setHeader('Content-Disposition', 'inline; filename="sarm-planning-iade.ics"')

  const token = (req.query?.token ?? new URL(req.url, 'http://x').searchParams.get('token') ?? '').toString().trim()

  try {
    if (!token) return res.status(200).send(vide())

    const { data: ab } = await supabaseAdmin
      .from('iade_agenda')
      .select('user_id, actif, colonne, data, updated_at')
      .eq('token', token)
      .maybeSingle()
    if (!ab || !ab.actif) return res.status(200).send(vide())

    // UID stable par (jour, créneau, IADE) → mises à jour propres, purge des jours retirés.
    const base = String(ab.user_id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)

    let evts
    // DTSTAMP = date de la dernière écriture de la source, pas l'instant courant :
    // un DTSTAMP qui bouge à chaque requête ferait rejouer tout l'agenda à chaque
    // rafraîchissement, alors que rien n'a changé.
    let maj = ab.updated_at
    if (ab.colonne) {
      const { debut, fin } = fenetre()
      const { data: lignes } = await supabaseAdmin
        .from('iade_planning')
        .select('jour, matin, apres_midi, note, maj')
        .eq('iade', ab.colonne)
        .gte('jour', debut)
        .lte('jour', fin)
        .order('jour')
      evts = evenementsDepuisPlanning(lignes ?? [])
      for (const l of lignes ?? []) {
        if (l?.maj && (!maj || l.maj > maj)) maj = l.maj
      }
    } else {
      evts = Array.isArray(ab.data) ? ab.data : []
    }

    const dtstamp = horodatage(maj)
    const evenements = evts.map(e => {
      if (!e?.d || !e?.slot) return null
      return evenement({
        uid: `${e.d}-${base}-${e.slot}@sarm-iade`,
        dtstamp,
        jour: e.d,
        finJour: e.allday ? e.fin : null,
        debut: e.allday ? null : e.ts,
        fin: e.allday ? null : e.te,
        titre: e.titre,
        desc: e.desc,
      })
    })

    return res.status(200).send(calendrier({ nom: NOM_CALENDRIER, prodid: PRODID, evenements }))
  } catch {
    // En cas d'erreur, ne pas casser l'abonnement : renvoyer un calendrier vide.
    return res.status(200).send(vide())
  }
}
