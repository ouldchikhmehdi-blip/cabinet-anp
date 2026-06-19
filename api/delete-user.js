import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { requireAdmin, sendError, setCorsHeaders } from './_lib/auth.js'

/**
 * POST /api/delete-user
 * Body : { userId: string }
 *
 * Supprime DÉFINITIVEMENT un compte (irréversible) :
 *   - supprime les invitations liées à son e-mail (consommées ou orphelines) ;
 *   - supprime l'utilisateur Supabase Auth → la contrainte
 *     `profiles.id … on delete cascade` (cf. supabase/schema.sql) supprime
 *     automatiquement la ligne `profiles`, ce qui libère aussi son initiale.
 * Réservé aux administrateurs.
 * Garde-fous : interdit de se supprimer soi-même et de supprimer le dernier admin actif.
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

  // Interdit de se supprimer soi-même (sécurité UX)
  if (userId === appelant.id) {
    return sendError(res, 400, 'Vous ne pouvez pas supprimer votre propre compte.')
  }

  // Récupère le profil cible
  const { data: cible, error: cibleErr } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role')
    .eq('id', userId)
    .single()

  if (cibleErr || !cible) return sendError(res, 404, 'Utilisateur introuvable.')

  // Garde-fou : dernier admin actif
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

  // 1. Supprimer les invitations liées à cet e-mail (best-effort, non bloquant)
  try {
    await supabaseAdmin.from('invitations').delete().eq('email', cible.email)
  } catch (err) {
    console.warn('Suppression invitations partielle:', err)
  }

  // 2. Supprimer l'utilisateur Auth (cascade → profiles)
  const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (delErr) {
    console.error('Erreur deleteUser:', delErr)
    return sendError(res, 500, 'Erreur lors de la suppression du compte.')
  }

  return res.status(200).json({ ok: true, message: `Compte de ${cible.email} supprimé définitivement.` })
}
