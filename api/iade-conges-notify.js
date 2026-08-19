import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { requireUser, sendError, setCorsHeaders } from './_lib/auth.js'
import { envoyerEmail } from './_lib/mailer.js'
import { emailCongesPoses, emailCongesRetires, emailCongesDecides } from './_lib/emails.js'

/**
 * POST /api/iade-conges-notify
 * Body : { type: 'pose' | 'retrait' | 'decision', lot?: string, ids?: string[] }
 *
 * Notifie par e-mail (best-effort) autour d'un mouvement de congé IADE :
 *   • pose / retrait → l'agent déclenche, on prévient le(s) gestionnaire(s) ;
 *   • decision       → la gestion déclenche, on prévient l'agent concerné.
 *
 * Sécurité : le serveur RELIT toujours les jours en base (jamais le contenu fourni
 * par le client) — ça valide l'appartenance (pose/retrait) et garantit que l'e-mail
 * reflète l'état réel. Les adresses des destinataires ne sont jamais renvoyées au client.
 * Ne bloque jamais l'action métier : renvoie 200 même si aucun e-mail n'est parti.
 *
 * Pour le RETRAIT, appeler CET endpoint AVANT la suppression des lignes (sinon elles
 * n'existent plus à relire) — cf. src/pages/IadeMesConges.jsx.
 */
const CHAMPS = 'id, user_id, jour, type_conge, lot, statut, motif_reponse'

function nomAgent(profil) {
  return profil?.nom_complet?.trim() || (profil?.email ? profil.email.split('@')[0] : 'Un agent')
}

async function emailsGestionnaires() {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('email')
    .eq('is_gestion_iade', true)
    .eq('status', 'active')
  return (data ?? []).map(p => p.email).filter(Boolean)
}

export default async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendError(res, 405, 'Méthode non autorisée.')

  let auth
  try {
    auth = await requireUser(req)
  } catch (err) {
    return sendError(res, err.status ?? 401, err.message)
  }
  const { user, profile } = auth

  const { type, lot, ids } = req.body ?? {}
  const lien = process.env.VITE_APP_URL ?? ''
  const idList = Array.isArray(ids) ? ids : []

  try {
    // ── L'agent pose ou retire : on prévient le(s) gestionnaire(s) ────────────
    if (type === 'pose' || type === 'retrait') {
      let requete = supabaseAdmin.from('iade_conges').select(CHAMPS).eq('user_id', user.id)
      requete = type === 'pose' ? requete.eq('lot', lot ?? '') : requete.in('id', idList)
      const { data: rows } = await requete

      if (!rows || rows.length === 0) {
        return res.status(200).json({ ok: true, notified: 0, note: 'Aucun jour correspondant.' })
      }

      const destinataires = await emailsGestionnaires()
      const agentNom = nomAgent(profile)
      const message = type === 'pose'
        ? emailCongesPoses({ agentNom, rows, lien })
        : emailCongesRetires({ agentNom, rows, lien })

      let notified = 0
      for (const to of destinataires) {
        const { sent } = await envoyerEmail({ to, subject: message.subject, html: message.html, text: message.text })
        if (sent) notified++
      }
      return res.status(200).json({ ok: true, notified })
    }

    // ── La gestion décide : on prévient l'agent concerné ──────────────────────
    if (type === 'decision') {
      const peutGerer = profile.is_gestion_iade || profile.is_faiseur || profile.role === 'admin'
      if (!peutGerer) return sendError(res, 403, 'Droits insuffisants.')

      const { data: rows } = await supabaseAdmin
        .from('iade_conges').select(CHAMPS).in('id', idList)

      if (!rows || rows.length === 0) {
        return res.status(200).json({ ok: true, notified: 0, note: 'Aucun jour correspondant.' })
      }

      // Regroupe par agent (en général un seul) : un e-mail par agent concerné.
      const parAgent = new Map()
      for (const r of rows) {
        if (!parAgent.has(r.user_id)) parAgent.set(r.user_id, [])
        parAgent.get(r.user_id).push(r)
      }

      let notified = 0
      for (const [agentId, agentRows] of parAgent) {
        const { data: agent } = await supabaseAdmin
          .from('profiles').select('email, nom_complet').eq('id', agentId).single()
        if (!agent?.email) continue
        const message = emailCongesDecides({
          agentNom: nomAgent(agent),
          rows:     agentRows,
          statut:   agentRows[0].statut,
          motif:    agentRows[0].motif_reponse,
          lien,
        })
        const { sent } = await envoyerEmail({ to: agent.email, subject: message.subject, html: message.html, text: message.text })
        if (sent) notified++
      }
      return res.status(200).json({ ok: true, notified })
    }

    return sendError(res, 400, 'Type de notification inconnu.')
  } catch (err) {
    // Une notification ne doit jamais faire échouer l'action métier.
    console.error('Erreur iade-conges-notify (non bloquante):', err)
    return res.status(200).json({ ok: false, notified: 0, error: 'Notification non envoyée.' })
  }
}
