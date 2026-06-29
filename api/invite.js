import crypto from 'crypto'
import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { requireAdmin, sendError, setCorsHeaders } from './_lib/auth.js'

/**
 * POST /api/invite
 * Body : { email: string, role?: 'user' | 'admin' }
 *
 * Crée une invitation (48h, usage unique) et envoie un e-mail via Resend.
 * Réservé aux administrateurs authentifiés.
 */
export default async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendError(res, 405, 'Méthode non autorisée.')

  let inviteur
  try {
    inviteur = await requireAdmin(req)
  } catch (err) {
    return sendError(res, err.status ?? 403, err.message)
  }

  const { email, role = 'user' } = req.body ?? {}

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendError(res, 400, 'Adresse e-mail invalide.')
  }
  if (!['admin', 'user'].includes(role)) {
    return sendError(res, 400, 'Rôle invalide.')
  }

  // Vérifie que l'e-mail n'est pas déjà un compte actif
  const { data: existingProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email.toLowerCase())
    .eq('status', 'active')

  if (existingProfiles?.length > 0) {
    return sendError(res, 409, 'Un compte actif existe déjà pour cet e-mail.')
  }

  // Supprime toute invitation NON utilisée existante pour cet e-mail (expirée ou
  // encore en attente). L'index unique partiel ne réserve qu'un créneau par e-mail
  // tant que used_at is null : sans ce nettoyage, une invitation expirée mais jamais
  // ouverte bloquerait la régénération. « Générer l'invitation » agit donc aussi
  // comme un renvoi : nouveau lien, nouveau délai, l'ancien token devient caduc.
  const { error: cleanupErr } = await supabaseAdmin
    .from('invitations')
    .delete()
    .eq('email', email.toLowerCase())
    .is('used_at', null)

  if (cleanupErr) {
    console.error('Erreur nettoyage invitation:', cleanupErr)
    return sendError(res, 500, 'Erreur interne lors de la régénération de l\'invitation.')
  }

  // Génère un token aléatoire 256 bits (URL-safe base64)
  const token     = crypto.randomBytes(32).toString('base64url')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  // Insère l'invitation (l'index unique partiel reste un garde-fou anti-course)
  const { error: insertErr } = await supabaseAdmin
    .from('invitations')
    .insert({
      email:      email.toLowerCase(),
      role,
      token_hash: tokenHash,
      invited_by: inviteur.id,
      expires_at: expiresAt,
    })

  if (insertErr) {
    // Code 23505 = contrainte unique violée (invitation déjà active pour cet e-mail)
    if (insertErr.code === '23505') {
      return sendError(res, 409, 'Une invitation est déjà en attente pour cet e-mail.')
    }
    console.error('Erreur insert invitation:', insertErr)
    return sendError(res, 500, 'Erreur interne lors de la création de l\'invitation.')
  }

  // Construit le lien d'invitation (toujours renvoyé au front pour partage manuel)
  const appUrl = process.env.VITE_APP_URL ?? ''
  const lien   = `${appUrl}/?invite=${encodeURIComponent(token)}`

  // Tente l'envoi de l'e-mail via Resend (best-effort : sans domaine vérifié,
  // l'envoi échoue pour les adresses autres que celle du compte Resend, mais
  // l'invitation reste valable et le lien est affiché dans l'interface admin).
  let emailSent = false
  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    process.env.INVITE_FROM_EMAIL,
        to:      email,
        subject: 'Invitation — Dashboard SARM',
        html: `
          <p>Bonjour,</p>
          <p>Vous avez été invité(e) à accéder au dashboard financier du SARM (Service Anesthésie Réanimation Millénaire).</p>
          <p>
            <a href="${lien}" style="display:inline-block;padding:10px 20px;background:#534AB7;color:#fff;border-radius:8px;text-decoration:none;font-weight:500;">
              Créer mon compte
            </a>
          </p>
          <p style="color:#888;font-size:12px;">Ce lien expire dans 48 heures et ne peut être utilisé qu'une seule fois.<br>Si vous n'attendiez pas cette invitation, ignorez cet e-mail.</p>
        `,
      }),
    })
    emailSent = resendRes.ok
    if (!resendRes.ok) {
      const detail = await resendRes.text()
      console.error('Erreur Resend (non bloquante):', detail)
    }
  } catch (err) {
    console.error('Erreur Resend (exception, non bloquante):', err)
  }

  return res.status(201).json({
    ok:        true,
    link:      lien,
    emailSent,
    message: emailSent
      ? `Invitation envoyée par e-mail à ${email}.`
      : `Lien d'invitation généré pour ${email}. Copiez-le et transmettez-le manuellement.`,
  })
}
