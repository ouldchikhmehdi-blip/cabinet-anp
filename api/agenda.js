import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { calendrier as batirCalendrier, evenement, horodatage } from './_lib/ics.js'

/**
 * GET /api/agenda?token=<token>  — flux iCalendar (.ics) PUBLIC d'un associé, pour abonnement
 * (iPhone/Apple, Google, Outlook). Aucun JWT : protégé par le `token` non devinable (URL-capacité).
 *
 * Lit via le service_role :
 *   planning_agenda(token) → user_id + actif ; profiles(initiales) ; planning_agenda_evenements (tiers validés).
 * Renvoie les événements « journée entière » de CET associé (gardes/astreintes/réa/vacances/récup).
 * Token inconnu ou `actif=false` → calendrier VIDE (l'agenda abonné se vide au prochain rafraîchissement).
 * Aucune donnée sensible : uniquement des rôles + initiales.
 *
 * La conformité du .ics est tenue par `_lib/ics.js` : DTSTAMP notamment, sans lequel
 * Google et Outlook acceptent l'abonnement puis n'affichent aucune journée (Apple, lui,
 * s'en passait — d'où un défaut longtemps invisible). Voir l'en-tête de ce fichier.
 */

const TITRES = { garde: 'Garde', astreinte: 'Astreinte', rea: 'Réanimation', vacances: 'Vacances', recup: 'Récup jour férié' }

const NOM_CALENDRIER = 'SARM — Mon planning'
const PRODID = '-//SARM//Planning anesthésie//FR'

function compact(iso) {
  return String(iso).replace(/-/g, '')
}

function calendrier(evenements) {
  return batirCalendrier({ nom: NOM_CALENDRIER, prodid: PRODID, evenements })
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
      .select('user_id, actif, exclus, source, updated_at')
      .eq('token', token)
      .maybeSingle()
    if (!ab || !ab.actif) return res.status(200).send(calendrier([]))
    const exclus = new Set(Array.isArray(ab.exclus) ? ab.exclus : [])

    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('initiales')
      .eq('id', ab.user_id)
      .maybeSingle()
    const ini = prof?.initiales
    if (!ini) return res.status(200).send(calendrier([]))

    // Source MANUEL : l'associé a collé sa colonne du planning Excel (table planning_agenda_manuel).
    // On sert directement ces événements journée-entière (le titre porte le poste), sans passer par
    // les archives / le planning validé.
    if (ab.source === 'manuel') {
      const { data: man } = await supabaseAdmin
        .from('planning_agenda_manuel')
        .select('data, updated_at')
        .eq('user_id', ab.user_id)
        .maybeSingle()
      const evts = Array.isArray(man?.data) ? man.data : []
      const dtstamp = horodatage(man?.updated_at ?? ab.updated_at)
      return res.status(200).send(calendrier(evts.map(e => evenement({
        // UID stable par (associé, jour de début) : mises à jour propres, purge des jours retirés.
        uid: `${ini}-manuel-${compact(e?.d)}@cabinet-anp`,
        dtstamp,
        jour: e?.d ? compact(e.d) : null,
        finJour: e?.fin ? compact(e.fin) : null,
        titre: e?.titre,
        transparent: true,
      }))))
    }

    // Source de vérité = les ARCHIVES vivantes (planning Excel validé, reçu par l'associé).
    // Un tiers = (année, plage de semaines) ; on ne retient que l'archive la PLUS RÉCENTE de chaque
    // tiers → son recueil_id. Une archive supprimée par le faiseur disparaît donc du flux ; s'il n'y a
    // aucune archive, rien n'est synchronisé. Cela donne au plus un agenda par tiers (3 max/an : 1, 2, 3).
    const { data: archs } = await supabaseAdmin
      .from('planning_archives')
      .select('recueil_id, annee, semaine_debut, semaine_fin, created_at')
    const meilleureParTiers = new Map() // "annee|deb|fin" → { recueil_id, t }
    for (const a of (archs ?? [])) {
      if (!a?.recueil_id) continue
      const cle = `${a.annee}|${a.semaine_debut}|${a.semaine_fin}`
      const t = Date.parse(a.created_at ?? '') || 0
      const cur = meilleureParTiers.get(cle)
      if (!cur || t >= cur.t) meilleureParTiers.set(cle, { recueil_id: a.recueil_id, t })
    }
    const recueilsValides = new Set([...meilleureParTiers.values()].map(v => v.recueil_id))

    const { data: rows } = await supabaseAdmin
      .from('planning_agenda_evenements')
      .select('recueil_id, data, updated_at')

    let maj = ab.updated_at
    for (const row of (rows ?? [])) {
      if (row?.updated_at && (!maj || row.updated_at > maj)) maj = row.updated_at
    }
    const dtstamp = horodatage(maj)

    const evenements = []
    for (const row of (rows ?? [])) {
      if (!recueilsValides.has(row?.recueil_id)) continue // pas d'archive vivante (supprimée / remplacée)
      if (exclus.has(row?.recueil_id)) continue // tiers désynchronisé par l'associé
      const evts = row?.data?.[ini]
      if (!Array.isArray(evts)) continue
      for (const e of evts) {
        if (!e?.type) continue
        evenements.push(evenement({
          // UID stable (même (associé, type, jour) → même UID) pour des mises à jour propres, pas de doublon.
          uid: `${ini}-${e.type}-${compact(e?.d)}@cabinet-anp`,
          dtstamp,
          jour: e?.d ? compact(e.d) : null,
          finJour: e?.fin ? compact(e.fin) : null,
          titre: e.titre || TITRES[e.type] || e.type,
          transparent: true,
        }))
      }
    }
    return res.status(200).send(calendrier(evenements))
  } catch {
    // En cas d'erreur, ne pas casser l'abonnement : renvoyer un calendrier vide.
    return res.status(200).send(calendrier([]))
  }
}
