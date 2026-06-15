import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { requireAdmin, sendError, setCorsHeaders } from './_lib/auth.js'

/**
 * POST /api/revoke
 * Body : { userId: string }
 *
 * Désactive un compte (status='disabled') ET révoque toutes ses sessions
 * actives (les tokens JWT déjà émis ne fonctionneront plus).
 * Réservé aux administrateurs.
 * Garde-fou : interdit de révoquer le dernier admin actif.
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

  const { userId } = req.body ?? {}
  if (!userId) return sendError(res, 400, 'userId manquant.')

  // Interdit de se révoquer soi-même (sécurité UX)
  if (userId === appelant.id) {
    return sendError(res, 400, 'Vous ne pouvez pas révoquer votre propre compte.')
  }

  // Récupère le profil cible
  const { data: cible, error: cibleErr } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, status')
    .eq('id', userId)
    .single()

  if (cibleErr || !cible) return sendError(res, 404, 'Utilisateur introuvable.')
  if (cible.status === 'disabled') {
    return res.status(200).json({ ok: true, message: 'Compte déjà désactivé.' })
  }

  // Garde-fou : dernier admin
  if (cible.role === 'admin') {
    const { count } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('status', 'active')

    if (count <= 1) {
      return sendError(res, 409, 'Impossible : cet utilisateur est le seul administrateur actif.')
    }
  }

  // 1. Désactiver dans profiles
  const { error: updateErr } = await supabaseAdmin
    .from('profiles')
    .update({ status: 'disabled' })
    .eq('id', userId)

  if (updateErr) {
    console.error('Erreur update status:', updateErr)
    return sendError(res, 500, 'Erreur lors de la désactivation du compte.')
  }

  // 2. Révoquer toutes les sessions actives (invalide les refresh tokens)
  try {
    await supabaseAdmin.auth.admin.signOut(userId)
  } catch (err) {
    // Non bloquant : le compte est déjà marqué disabled dans profiles,
    // la vérification profiles.status dans is_admin() bloquera les actions admin.
    console.warn('Révocation session partielle:', err)
  }

  return res.status(200).json({ ok: true, message: `Compte de ${cible.email} désactivé.` })
}
