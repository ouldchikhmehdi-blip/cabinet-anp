import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { requireAdmin, sendError, setCorsHeaders } from './_lib/auth.js'
import { chargerAssocies } from './_lib/associes.js'

/**
 * POST /api/planning-remplacer-associe
 * Body : { ancienne: string, nouvelle: string }
 *
 * Remplace les initiales d'un associé (départ en retraite) DANS LA LISTE DE
 * RÉFÉRENCE (table planning_associes, ligne id=1), à la même position → le
 * prochain planning utilise la nouvelle initiale. Les plannings déjà archivés
 * (Excel) ne sont PAS modifiés (aucune migration des données passées).
 * Si un compte porte encore l'ancienne initiale (correction de saisie), il la suit.
 * Réservé aux administrateurs.
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

  const { ancienne, nouvelle } = req.body ?? {}
  const anc  = String(ancienne ?? '').trim()
  const nouv = String(nouvelle ?? '').trim().toUpperCase()

  if (!anc) return sendError(res, 400, 'Initiales à remplacer manquantes.')
  if (!/^[A-Z]{1,4}$/.test(nouv)) {
    return sendError(res, 400, 'Nouvelles initiales invalides (1 à 4 lettres).')
  }
  if (nouv === anc) {
    return sendError(res, 400, 'Les nouvelles initiales sont identiques aux anciennes.')
  }

  const liste = await chargerAssocies(supabaseAdmin)
  const idx = liste.indexOf(anc)
  if (idx === -1) return sendError(res, 404, `Associé ${anc} introuvable dans la liste.`)
  if (liste.includes(nouv)) return sendError(res, 409, `Les initiales ${nouv} sont déjà dans la liste.`)

  // Conflit : un autre compte porte-t-il déjà les nouvelles initiales ?
  const { data: conflit } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('initiales', nouv)
    .maybeSingle()
  if (conflit) return sendError(res, 409, `Les initiales ${nouv} sont déjà attribuées à un compte.`)

  const nouvelleListe = liste.slice()
  nouvelleListe[idx] = nouv

  // Ordre important (deux écritures sans transaction) : on fait suivre le compte
  // AVANT de toucher la liste, et de façon BLOQUANTE, pour ne jamais laisser la liste
  // et profiles.initiales désynchronisés. En cas d'échec ici, la liste n'est pas modifiée ;
  // un nouvel essai converge (le compte porte déjà la nouvelle initiale → no-op).
  // 1. Faire suivre un éventuel compte portant encore l'ancienne initiale (correction de saisie).
  const { error: profErr } = await supabaseAdmin
    .from('profiles')
    .update({ initiales: nouv })
    .eq('initiales', anc)
  if (profErr) {
    console.error('Erreur update profil porteur:', profErr)
    return sendError(res, 500, 'Erreur lors de la mise à jour du compte associé. Aucune modification appliquée.')
  }

  // 2. Mettre à jour la liste de référence (singleton id=1)
  const { error: upErr } = await supabaseAdmin
    .from('planning_associes')
    .upsert({ id: 1, liste: nouvelleListe, updated_by: appelant.id }, { onConflict: 'id' })
  if (upErr) {
    console.error('Erreur upsert planning_associes:', upErr)
    return sendError(res, 500, 'Erreur lors de la mise à jour de la liste des associés.')
  }

  return res.status(200).json({
    ok: true,
    liste: nouvelleListe,
    message: `Associé ${anc} remplacé par ${nouv}. Le prochain planning utilisera ${nouv}.`,
  })
}
