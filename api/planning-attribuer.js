import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { requireAdmin, sendError, setCorsHeaders } from './_lib/auth.js'
import { ASSOCIES } from './_lib/associes.js'

/**
 * POST /api/planning-attribuer
 * Body : { userId: string, initiales: string|null, isFaiseur: boolean, nomComplet?: string|null }
 *
 * Attribue à un compte ses initiales d'associé, le rôle « faiseur de planning »
 * et/ou son nom complet (export « Planning par service »). Réservé aux
 * administrateurs. Garantit l'unicité des initiales.
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

  const body = req.body ?? {}
  const { userId, initiales = null, isFaiseur = false, nomComplet } = body

  if (!userId) return sendError(res, 400, 'userId manquant.')
  if (initiales !== null && !ASSOCIES.includes(initiales)) {
    return sendError(res, 400, 'Initiales invalides.')
  }
  const faiseur = !!isFaiseur
  // Nom complet : mis à jour seulement s'il est fourni dans le body (sinon on ne le touche pas).
  const aNomComplet = Object.prototype.hasOwnProperty.call(body, 'nomComplet')
  const nomCompletValeur = typeof nomComplet === 'string' && nomComplet.trim() ? nomComplet.trim() : null

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

  const champs = { initiales, is_faiseur: faiseur }
  if (aNomComplet) champs.nom_complet = nomCompletValeur

  const { error: updateErr } = await supabaseAdmin
    .from('profiles')
    .update(champs)
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
