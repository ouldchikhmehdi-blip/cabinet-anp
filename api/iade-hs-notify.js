import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { requireUser, sendError, setCorsHeaders } from './_lib/auth.js'
import { envoyerEmail } from './_lib/mailer.js'
import { emailHsDeclarees, emailHsDecidees, emailHsAjoutees } from './_lib/emails.js'

/**
 * POST /api/iade-hs-notify
 * Body : { type: 'declaration' | 'decision' | 'ajout', ids: string[] }
 *
 * Notifie par e-mail (best-effort) autour d'une heure supplémentaire IADE :
 *   • declaration → l'agent déclare, on prévient le MAR qu'il a désigné ;
 *   • decision    → le MAR désigné (ou la gestion en secours) a tranché,
 *                   on prévient l'agent ;
 *   • ajout       → la gestion a ajouté des heures déjà validées,
 *                   on prévient l'agent (information, rien à approuver).
 *
 * Sécurité : le serveur RELIT toujours les lignes en base (jamais le contenu
 * fourni par le client) — ça valide l'appartenance et garantit que l'e-mail
 * reflète l'état réel. Les adresses des destinataires ne sont jamais renvoyées
 * au client. Ne bloque jamais l'action métier : renvoie 200 même si aucun e-mail
 * n'est parti.
 */
// `jeton` sert à fabriquer les boutons Valider / Refuser de l'e-mail du MAR.
// Il ne sort JAMAIS vers le client : seul ce serverless le lit, pour l'écrire
// dans un message adressé au MAR désigné.
const CHAMPS = 'id, user_id, jour, heures, origine, mar_id, commentaire, statut, motif_reponse, jeton'

function nomAgent(profil) {
  return profil?.nom_complet?.trim() || (profil?.email ? profil.email.split('@')[0] : 'Un agent')
}

async function profil(id) {
  const { data } = await supabaseAdmin
    .from('profiles').select('email, nom_complet').eq('id', id).single()
  return data ?? null
}

// Prévient l'agent concerné par chaque ligne (un e-mail par agent).
async function prevenirAgents(rows, lien, construire) {
  const parAgent = new Map()
  for (const r of rows) {
    if (!parAgent.has(r.user_id)) parAgent.set(r.user_id, [])
    parAgent.get(r.user_id).push(r)
  }

  let notified = 0
  for (const [agentId, siennes] of parAgent) {
    const agent = await profil(agentId)
    if (!agent?.email) continue
    const message = construire({ agentNom: nomAgent(agent), rows: siennes, lien })
    const { sent } = await envoyerEmail({
      to: agent.email, subject: message.subject, html: message.html, text: message.text,
    })
    if (sent) notified++
  }
  return notified
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

  const { type, ids } = req.body ?? {}
  const lien = process.env.VITE_APP_URL ?? ''
  const idList = Array.isArray(ids) ? ids : []
  const peutGerer = profile.is_gestion_iade || profile.is_faiseur || profile.role === 'admin'

  if (idList.length === 0) {
    return res.status(200).json({ ok: true, notified: 0, note: 'Aucune ligne fournie.' })
  }

  try {
    // ── L'agent déclare : on prévient le MAR qu'il a désigné ──────────────────
    if (type === 'declaration') {
      // Relecture restreinte à SES lignes : un agent ne peut pas déclencher
      // d'e-mail sur la déclaration d'un collègue.
      const { data: rows } = await supabaseAdmin
        .from('iade_heures_sup').select(CHAMPS).in('id', idList).eq('user_id', user.id)

      if (!rows || rows.length === 0) {
        return res.status(200).json({ ok: true, notified: 0, note: 'Aucune ligne correspondante.' })
      }

      const agentNom = nomAgent(profile)
      const parMar = new Map()
      for (const r of rows) {
        if (!r.mar_id) continue
        if (!parMar.has(r.mar_id)) parMar.set(r.mar_id, [])
        parMar.get(r.mar_id).push(r)
      }

      let notified = 0
      for (const [marId, siennes] of parMar) {
        const mar = await profil(marId)
        if (!mar?.email) continue
        const message = emailHsDeclarees({ agentNom, rows: siennes, lien })
        const { sent } = await envoyerEmail({
          to: mar.email, subject: message.subject, html: message.html, text: message.text,
        })
        if (sent) notified++
      }
      return res.status(200).json({ ok: true, notified })
    }

    // ── Décision : on prévient l'agent ────────────────────────────────────────
    if (type === 'decision') {
      const { data: rows } = await supabaseAdmin
        .from('iade_heures_sup').select(CHAMPS).in('id', idList)

      if (!rows || rows.length === 0) {
        return res.status(200).json({ ok: true, notified: 0, note: 'Aucune ligne correspondante.' })
      }

      // Le MAR désigné décide ; la gestion IADE peut trancher en secours.
      const autorise = peutGerer || rows.every(r => r.mar_id === user.id)
      if (!autorise) return sendError(res, 403, 'Droits insuffisants.')

      const notified = await prevenirAgents(rows, lien, ({ agentNom, rows: siennes, lien: l }) =>
        emailHsDecidees({
          agentNom,
          rows:   siennes,
          statut: siennes[0].statut,
          motif:  siennes[0].motif_reponse,
          lien:   l,
        }))
      return res.status(200).json({ ok: true, notified })
    }

    // ── La gestion a ajouté des heures : on informe l'agent ───────────────────
    if (type === 'ajout') {
      if (!peutGerer) return sendError(res, 403, 'Droits insuffisants.')

      const { data: rows } = await supabaseAdmin
        .from('iade_heures_sup').select(CHAMPS).in('id', idList)

      if (!rows || rows.length === 0) {
        return res.status(200).json({ ok: true, notified: 0, note: 'Aucune ligne correspondante.' })
      }

      const notified = await prevenirAgents(rows, lien, emailHsAjoutees)
      return res.status(200).json({ ok: true, notified })
    }

    return sendError(res, 400, 'Type de notification inconnu.')
  } catch (err) {
    // Une notification ne doit jamais faire échouer l'action métier.
    console.error('Erreur iade-hs-notify (non bloquante):', err)
    return res.status(200).json({ ok: false, notified: 0, error: 'Notification non envoyée.' })
  }
}
