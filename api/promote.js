import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { requireAdmin, sendError, setCorsHeaders } from './_lib/auth.js'

/**
 * POST /api/promote
 * Body : { userId: string, role: 'admin' | 'user' }
 *
 * Change le rôle d'un utilisateur. Réservé aux administrateurs.
 * Garde-fou : interdit de rétrograder le dernier administrateur actif.
 */
export default async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendError(res, 405, 'Méthode non autorisée.')

  let appelant
  try {
    appelant = await requireAdmin(req)
  } catch (err) {
    return sendError(res, err.status ?? 403, err.message)
  }

  const { userId, role } = req.body ?? {}

  if (!userId) return sendError(res, 400, 'userId manquant.')
  if (!['admin', 'user'].includes(role)) return sendError(res, 400, 'Rôle invalide (admin ou user).')

  // Récupère le profil cible
  const { data: cible, error: cibleErr } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, status')
    .eq('id', userId)
    .single()

  if (cibleErr || !cible) return sendError(res, 404, 'Utilisateur introuvable.')
  if (cible.status !== 'active') return sendError(res, 400, 'Impossible de modifier un compte désactivé.')
  if (cible.role === role) return res.status(200).json({ ok: true, message: 'Aucun changement nécessaire.' })

  // Garde-fou : ne pas rétrograder le dernier admin actif
  if (cible.role === 'admin' && role === 'user') {
    const { count } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('status', 'active')

    if (count <= 1) {
      return sendError(res, 409, 'Impossible : cet utilisateur est le seul administrateur actif.')
    }
  }

  const { error: updateErr } = await supabaseAdmin
    .from('profiles')
    .update({ role })
    .eq('id', userId)

  if (updateErr) {
    console.error('Erreur update role:', updateErr)
    return sendError(res, 500, 'Erreur lors de la mise à jour du rôle.')
  }

  return res.status(200).json({ ok: true, message: `Rôle de ${cible.email} mis à jour : ${role}.` })
}
