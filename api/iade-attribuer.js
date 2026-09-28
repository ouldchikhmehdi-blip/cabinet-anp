import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { requireAdmin, sendError, setCorsHeaders } from './_lib/auth.js'

/**
 * POST /api/iade-attribuer
 * Body : { userId: string, isIade?: boolean, isGestionIade?: boolean, isAgentIa?: boolean }
 *
 * Pose les drapeaux du module congés IADE sur un compte (cf. IADE.md) :
 *   • is_iade         → compte restreint : ne voit QUE ses congés et le calendrier d'équipe ;
 *   • is_gestion_iade → valide / refuse les demandes des IADE ;
 *   • is_agent_ia     → compte IADE tenu par un assistant IA : gestion congés / HS /
 *                       rempla et modification du planning, rien d'autre (agent_ia.sql).
 *
 * Réservé aux administrateurs. Les deux drapeaux sont exclusifs, et un compte
 * IADE ne peut être ni admin, ni faiseur de planning, ni titulaire d'initiales
 * d'associé : ces règles sont vérifiées ici ET par la contrainte
 * profiles_iade_exclusif en base (défense en profondeur).
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
  const { userId } = body
  if (!userId) return sendError(res, 400, 'userId manquant.')

  const { data: cible, error: cibleErr } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, status, initiales, is_faiseur, is_iade, is_gestion_iade, is_agent_ia')
    .eq('id', userId)
    .single()

  if (cibleErr || !cible) return sendError(res, 404, 'Utilisateur introuvable.')
  if (cible.status !== 'active') return sendError(res, 400, 'Impossible de modifier un compte désactivé.')

  // Champs absents du body = inchangés.
  const isIade = Object.prototype.hasOwnProperty.call(body, 'isIade')
    ? !!body.isIade
    : cible.is_iade === true
  const isGestion = Object.prototype.hasOwnProperty.call(body, 'isGestionIade')
    ? !!body.isGestionIade
    : cible.is_gestion_iade === true

  // L'agent IA est un compte IADE : retirer « IADE » retire aussi « Agent IA ».
  const isAgentIa = Object.prototype.hasOwnProperty.call(body, 'isAgentIa')
    ? !!body.isAgentIa && isIade
    : cible.is_agent_ia === true && isIade

  if (isIade && isGestion) {
    return sendError(res, 400, 'Un compte ne peut pas être à la fois IADE et gestionnaire des IADE.')
  }
  if (isIade) {
    if (cible.role === 'admin')  return sendError(res, 400, 'Rétrogradez d\'abord ce compte : un administrateur ne peut pas être IADE.')
    if (cible.is_faiseur)        return sendError(res, 400, 'Retirez d\'abord le rôle « faiseur de planning » à ce compte.')
    if (cible.initiales)         return sendError(res, 400, 'Retirez d\'abord les initiales d\'associé de ce compte.')
  }

  const { error: updateErr } = await supabaseAdmin
    .from('profiles')
    .update({ is_iade: isIade, is_gestion_iade: isGestion, is_agent_ia: isAgentIa })
    .eq('id', userId)

  if (updateErr) {
    // 23514 = violation de profiles_iade_exclusif (cumul de rôles interdit)
    if (updateErr.code === '23514') {
      return sendError(res, 400, 'Cumul de rôles interdit pour un compte IADE.')
    }
    console.error('Erreur update iade-attribuer:', updateErr)
    return sendError(res, 500, 'Erreur lors de la mise à jour.')
  }

  const roles = [isIade && 'IADE', isAgentIa && 'agent IA', isGestion && 'gestion IADE'].filter(Boolean).join(' · ')
  return res.status(200).json({
    ok: true,
    message: `Compte ${cible.email} mis à jour${roles ? ` (${roles})` : ' (droits IADE retirés)'}.`,
  })
}
