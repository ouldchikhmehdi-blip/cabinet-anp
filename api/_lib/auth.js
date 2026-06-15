import { supabaseAdmin } from './supabaseAdmin.js'

/**
 * requireAdmin(req) — vérifie côté serveur que l'appelant est un admin actif.
 *
 * Lit le JWT dans l'en-tête Authorization: Bearer <token>,
 * le valide via supabase.auth.getUser (vérifie la signature et l'expiration),
 * puis consulte la table profiles pour confirmer role='admin' et status='active'.
 *
 * Renvoie l'objet user Supabase si OK.
 * Lance une erreur { status, message } si non autorisé.
 */
export async function requireAdmin(req) {
  const authHeader = req.headers['authorization'] ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!jwt) {
    throw { status: 401, message: 'Non authentifié.' }
  }

  // Valide le JWT côté serveur (signature + expiration)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(jwt)
  if (error || !user) {
    throw { status: 401, message: 'Session invalide ou expirée.' }
  }

  // Vérifie le rôle et le statut dans la table profiles
  const { data: profile, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()

  if (profErr || !profile) {
    throw { status: 403, message: 'Accès refusé.' }
  }
  if (profile.status !== 'active') {
    throw { status: 403, message: 'Compte désactivé.' }
  }
  if (profile.role !== 'admin') {
    throw { status: 403, message: 'Droits insuffisants.' }
  }

  return user
}

/**
 * sendError(res, status, message) — réponse d'erreur JSON standard.
 */
export function sendError(res, status, message) {
  res.status(status).json({ error: message })
}

/**
 * CORS headers pour autoriser le front à appeler les /api.
 */
export function setCorsHeaders(res) {
  const appUrl = process.env.VITE_APP_URL ?? '*'
  res.setHeader('Access-Control-Allow-Origin', appUrl)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
