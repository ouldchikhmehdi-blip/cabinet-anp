import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { requireAdmin, sendError, setCorsHeaders } from './_lib/auth.js'
import { ASSOCIES } from './_lib/associes.js'

/**
 * POST /api/planning-attribuer
 * Body : { userId: string, initiales: string|null, isFaiseur: boolean }
 *
 * Attribue à un compte ses initiales d'associé et/ou le rôle « faiseur de
 * planning ». Réservé aux administrateurs. Garantit l'unicité des initiales.
 */
export default async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendError(res, 405, 'Méthode non autorisée.')

  try {
    await requireAdmin(req)
  } catch (err) {
    return sendError(res, err.status ?? 403, err.message)
  }

  const { userId, initiales = null, isFaiseur = false } = req.body ?? {}

  if (!userId) return sendError(res, 400, 'userId manquant.')
  if (initiales !== null && !ASSOCIES.includes(initiales)) {
    return sendError(res, 400, 'Initiales invalides.')
  }
  const faiseur = !!isFaiseur

  // Récupère le profil cible
  const { data: cible, error: cibleErr } = await supabaseAdmin
    .from('profiles')
    .select('id, email, status')
    .eq('id', userId)
    .single()

  if (cibleErr || !cible) return sendError(res, 404, 'Utilisateur introuvable.')
  if (cible.status !== 'active') return sendError(res, 400, 'Impossible de modifier un compte désactivé.')

  // Unicité des initiales : aucun AUTRE compte ne doit déjà les porter.
  if (initiales !== null) {
    const { data: conflit } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('initiales', initiales)
      .neq('id', userId)
      .maybeSingle()
    if (conflit) {
      return sendError(res, 409, `Initiales ${initiales} déjà attribuées à un autre compte.`)
    }
  }

  const { error: updateErr } = await supabaseAdmin
    .from('profiles')
    .update({ initiales, is_faiseur: faiseur })
    .eq('id', userId)

  if (updateErr) {
    // Code 23505 = violation de l'index unique partiel (course concurrente)
    if (updateErr.code === '23505') {
      return sendError(res, 409, `Initiales ${initiales} déjà attribuées à un autre compte.`)
    }
    console.error('Erreur update planning-attribuer:', updateErr)
    return sendError(res, 500, 'Erreur lors de l\'attribution.')
  }

  return res.status(200).json({
    ok: true,
    message: `Compte ${cible.email} mis à jour${initiales ? ` (${initiales})` : ''}${faiseur ? ' · faiseur' : ''}.`,
  })
}
