import crypto from 'crypto'
import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { sendError, setCorsHeaders } from './_lib/auth.js'

/**
 * Deux sous-routes gérées par ce fichier :
 *
 *   GET  /api/accept?token=<token>
 *     → Vérifie que le token est valide (non expiré, non utilisé) sans le consommer.
 *     → Renvoie { email } pour afficher l'e-mail cible dans le formulaire.
 *
 *   POST /api/accept
 *     Body : { token: string, password: string }
 *     → Valide et consomme le token (atomique).
 *     → Crée le compte Supabase Auth avec le bon rôle.
 *     → Le trigger handle_new_user crée la ligne profiles.
 *
 * Pas de JWT requis : l'invité n'a pas encore de compte.
 * L'autorisation repose uniquement sur la possession du token (256 bits, usage unique, 48h).
 */
export default async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  // ── GET /api/accept?token= ──────────────────────────────────────────
  if (req.method === 'GET') {
    const token = req.query?.token
    if (!token) return sendError(res, 400, 'Token manquant.')

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    const { data: inv, error } = await supabaseAdmin
      .from('invitations')
      .select('email, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .single()

    if (error || !inv)            return sendError(res, 404, 'Lien invalide ou expiré.')
    if (inv.used_at)              return sendError(res, 410, 'Lien invalide ou expiré.')
    if (new Date(inv.expires_at) < new Date()) return sendError(res, 410, 'Lien invalide ou expiré.')

    return res.status(200).json({ email: inv.email })
  }

  // ── POST /api/accept ────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { token, password } = req.body ?? {}

    if (!token || !password) return sendError(res, 400, 'Données manquantes.')
    if (password.length < 8)  return sendError(res, 400, 'Le mot de passe doit contenir au moins 8 caractères.')

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // Consomme l'invitation de façon atomique :
    // UPDATE … WHERE used_at IS NULL … RETURNING * garantit l'usage unique
    // même en cas de double requête concurrente.
    const { data: invitations, error: updateErr } = await supabaseAdmin
      .from('invitations')
      .update({ used_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('email, role')

    if (updateErr) {
      console.error('Erreur update invitation:', updateErr)
      return sendError(res, 500, 'Erreur interne.')
    }

    if (!invitations || invitations.length === 0) {
      return sendError(res, 410, 'Lien invalide ou expiré.')
    }

    const { email, role } = invitations[0]

    // Crée le compte Supabase (le trigger handle_new_user crée profiles avec role)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,          // pas d'e-mail de confirmation séparé
      user_metadata: { role },      // lu par le trigger pour remplir profiles.role
    })

    if (createErr) {
      // Si le compte existe déjà (e-mail déjà enregistré)
      if (createErr.message?.includes('already')) {
        return sendError(res, 409, 'Un compte existe déjà pour cet e-mail.')
      }
      console.error('Erreur création utilisateur:', createErr)
      // Tenter d'annuler la consommation de l'invitation (best-effort)
      await supabaseAdmin
        .from('invitations')
        .update({ used_at: null })
        .eq('token_hash', tokenHash)
      return sendError(res, 500, 'Erreur lors de la création du compte. Réessayez.')
    }

    return res.status(201).json({ ok: true, userId: created.user.id })
  }

  return sendError(res, 405, 'Méthode non autorisée.')
}
