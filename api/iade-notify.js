import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { requireUser, sendError, setCorsHeaders } from './_lib/auth.js'
import { envoyerEmail } from './_lib/mailer.js'
import {
  emailCongesPoses, emailCongesRetires, emailCongesDecides, emailCongesRecus,
  emailHsDeclarees, emailHsDecidees, emailHsAjoutees, emailHsRecues,
  emailHsCorrigees, emailHsSansSuite,
} from './_lib/emails.js'

/**
 * POST /api/iade-notify
 * Body : { type, lot?, ids? }
 *
 * Toutes les notifications e-mail du module IADE, congés ET heures sup.
 *
 * Congés :
 *   • 'pose' / 'retrait' → l'agent déclenche, on prévient le(s) gestionnaire(s) ;
 *                          une 'pose' renvoie EN PLUS son accusé de réception à
 *                          l'agent, qui date sa demande ;
 *   • 'decision'         → la gestion décide, on prévient l'agent concerné.
 *
 * Heures supplémentaires :
 *   • 'hs_declaration'   → l'agent déclare, on prévient le MAR qu'il a désigné et on
 *                          renvoie à l'agent son accusé de réception, qui date sa
 *                          déclaration et dit à qui elle est partie ;
 *   • 'hs_modification'  → l'agent a corrigé sa déclaration, on renvoie au MAR
 *                          désigné ce qu'elle dit maintenant ;
 *   • 'hs_reassignation' → l'agent va désigner un AUTRE MAR : on prévient celui
 *                          qu'il abandonne — À APPELER AVANT la mise à jour ;
 *   • 'hs_retrait'       → l'agent retire sa déclaration, on prévient le MAR
 *                          désigné — À APPELER AVANT la suppression ;
 *   • 'hs_decision'      → le MAR désigné (ou la gestion en secours) a tranché,
 *                          on prévient l'agent ;
 *   • 'hs_ajout'         → la gestion a ajouté des heures déjà validées,
 *                          on informe l'agent (rien à approuver de son côté).
 *
 * ⚠️ Les deux familles vivent dans LE MÊME fichier volontairement : le plan Vercel
 * de ce compte plafonne à 12 fonctions serverless par déploiement, et deux
 * endpoints séparés faisaient franchir la limite (le build échoue alors sans que
 * `npm run build` local n'y voie rien — il ne compile que le front).
 * Toute nouvelle route doit être ajoutée ici plutôt que dans un fichier de plus.
 *
 * Traçabilité : chaque message porte ses dates — dépôt et décision, le jour seul,
 * en heure de Paris. Chacun garde ainsi dans sa boîte une trace datée qui ne
 * dépend ni du dashboard ni de la mémoire de personne.
 *
 * Sécurité : le serveur RELIT toujours les lignes en base (jamais le contenu
 * fourni par le client) — ça valide l'appartenance et garantit que l'e-mail
 * reflète l'état réel. Les adresses des destinataires ne sont jamais renvoyées au
 * client. Ne bloque jamais l'action métier : renvoie 200 même si aucun e-mail
 * n'est parti.
 *
 * Pour le RETRAIT d'un congé, appeler CET endpoint AVANT la suppression des
 * lignes (sinon elles n'existent plus à relire) — cf. src/pages/IadeMesConges.jsx.
 * Même règle pour 'hs_retrait' et 'hs_reassignation' : ils relisent l'état
 * d'AVANT, celui que le MAR a reçu dans sa boîte.
 */
const CHAMPS_CONGES = 'id, user_id, jour, type_conge, lot, statut, motif_reponse, created_at, decide_le'

// `jeton` sert à fabriquer les boutons Valider / Refuser de l'e-mail du MAR.
// Il ne sort JAMAIS vers le client : seul ce serverless le lit, pour l'écrire
// dans un message adressé au MAR désigné.
const CHAMPS_HS = 'id, user_id, jour, heures, origine, mar_id, commentaire, statut, motif_reponse, jeton, created_at, decide_le'

function nomAgent(profil) {
  return profil?.nom_complet?.trim() || (profil?.email ? profil.email.split('@')[0] : 'Un agent')
}

async function profil(id) {
  const { data } = await supabaseAdmin
    .from('profiles').select('email, nom_complet').eq('id', id).maybeSingle()
  return data ?? null
}

async function emailsGestionnaires() {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('email')
    .eq('is_gestion_iade', true)
    .eq('status', 'active')
  return (data ?? []).map(p => p.email).filter(Boolean)
}

// Prévient l'agent concerné par chaque ligne (un e-mail par agent).
async function prevenirAgents(rows, lien, construire) {
  const parAgent = new Map()
  for (const r of rows) {
    if (!parAgent.has(r.user_id)) parAgent.set(r.user_id, [])
    parAgent.get(r.user_id).push(r)
  }

  let notified = 0
  for (const [agentId, siennes] of parAgent) {
    const agent = await profil(agentId)
    if (!agent?.email) continue
    const message = construire({ agentNom: nomAgent(agent), rows: siennes, lien })
    const { sent } = await envoyerEmail({
      to: agent.email, subject: message.subject, html: message.html, text: message.text,
    })
    if (sent) notified++
  }
  return notified
}

// Prévient le MAR désigné par chaque ligne (un e-mail par MAR).
async function prevenirMars(rows, lien, agentNom, construire) {
  const parMar = new Map()
  for (const r of rows) {
    if (!r.mar_id) continue
    if (!parMar.has(r.mar_id)) parMar.set(r.mar_id, [])
    parMar.get(r.mar_id).push(r)
  }

  let notified = 0
  for (const [marId, siennes] of parMar) {
    const mar = await profil(marId)
    if (!mar?.email) continue
    const message = construire({ agentNom, rows: siennes, lien })
    const { sent } = await envoyerEmail({
      to: mar.email, subject: message.subject, html: message.html, text: message.text,
    })
    if (sent) notified++
  }
  return notified
}

// Les quatre mouvements dont le MAR désigné doit être averti. Même destinataire,
// même relecture en base : seul le message change.
const MESSAGE_AU_MAR = {
  hs_declaration:   emailHsDeclarees,
  hs_modification:  emailHsCorrigees,
  hs_retrait:       (arg) => emailHsSansSuite({ ...arg, cause: 'retrait' }),
  hs_reassignation: (arg) => emailHsSansSuite({ ...arg, cause: 'reassignation' }),
}

export default async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendError(res, 405, 'Méthode non autorisée.')

  let auth
  try {
    auth = await requireUser(req)
  } catch (err) {
    return sendError(res, err.status ?? 401, err.message)
  }
  const { user, profile } = auth

  const { type, lot, ids } = req.body ?? {}
  const lien = process.env.VITE_APP_URL ?? ''
  const idList = Array.isArray(ids) ? ids : []
  const peutGerer = profile.is_gestion_iade || profile.is_faiseur || profile.role === 'admin'
  const rienAFaire = (note) => res.status(200).json({ ok: true, notified: 0, note })

  try {
    // ══ Congés ════════════════════════════════════════════════════════════
    // L'agent pose ou retire : on prévient le(s) gestionnaire(s).
    if (type === 'pose' || type === 'retrait') {
      let requete = supabaseAdmin.from('iade_conges').select(CHAMPS_CONGES).eq('user_id', user.id)
      requete = type === 'pose' ? requete.eq('lot', lot ?? '') : requete.in('id', idList)
      const { data: rows } = await requete

      if (!rows || rows.length === 0) return rienAFaire('Aucun jour correspondant.')

      const destinataires = await emailsGestionnaires()
      const agentNom = nomAgent(profile)
      const message = type === 'pose'
        ? emailCongesPoses({ agentNom, rows, lien })
        : emailCongesRetires({ agentNom, rows, lien })

      let notified = 0
      for (const to of destinataires) {
        const { sent } = await envoyerEmail({ to, subject: message.subject, html: message.html, text: message.text })
        if (sent) notified++
      }

      // Accusé de réception à l'agent lui-même, sur une pose : sa trace datée,
      // dans sa propre boîte. Pas sur un retrait — retirer un jour n'ouvre
      // aucune attente de réponse, et un accusé y serait du bruit.
      let accuse = false
      if (type === 'pose' && profile.email) {
        const recu = emailCongesRecus({ agentNom, rows, lien })
        const { sent } = await envoyerEmail({
          to: profile.email, subject: recu.subject, html: recu.html, text: recu.text,
        })
        accuse = sent
      }
      return res.status(200).json({ ok: true, notified, accuse })
    }

    // La gestion décide : on prévient l'agent concerné.
    if (type === 'decision') {
      if (!peutGerer) return sendError(res, 403, 'Droits insuffisants.')

      const { data: rows } = await supabaseAdmin
        .from('iade_conges').select(CHAMPS_CONGES).in('id', idList)

      if (!rows || rows.length === 0) return rienAFaire('Aucun jour correspondant.')

      const notified = await prevenirAgents(rows, lien, ({ agentNom, rows: siens, lien: l }) =>
        emailCongesDecides({
          agentNom,
          rows:   siens,
          statut: siens[0].statut,
          motif:  siens[0].motif_reponse,
          lien:   l,
        }))
      return res.status(200).json({ ok: true, notified })
    }

    // ══ Heures supplémentaires ════════════════════════════════════════════
    if (idList.length === 0 && type?.startsWith('hs_')) {
      return rienAFaire('Aucune ligne fournie.')
    }

    // L'agent déclare, corrige, réattribue ou retire : le MAR désigné doit le
    // savoir. Sinon il garde dans sa boîte un message qui annonce des heures qui
    // ont changé, ou qui n'existent plus, sans que rien ne le lui dise.
    if (Object.hasOwn(MESSAGE_AU_MAR, type)) {
      // Relecture restreinte à SES lignes : un agent ne peut pas déclencher
      // d'e-mail sur la déclaration d'un collègue.
      const { data: rows } = await supabaseAdmin
        .from('iade_heures_sup').select(CHAMPS_HS).in('id', idList).eq('user_id', user.id)

      if (!rows || rows.length === 0) return rienAFaire('Aucune ligne correspondante.')

      const notified = await prevenirMars(rows, lien, nomAgent(profile), MESSAGE_AU_MAR[type])

      // Accusé de réception à l'agent, sur une déclaration seulement : sa trace
      // datée, avec le nom du MAR à qui elle est partie — la question qui revient
      // quand la réponse tarde. Une correction ou un retrait n'en méritent pas :
      // ils n'ouvrent pas d'attente nouvelle.
      let accuse = false
      if (type === 'hs_declaration' && profile.email) {
        const mar = rows[0]?.mar_id ? await profil(rows[0].mar_id) : null
        const recu = emailHsRecues({
          agentNom: nomAgent(profile), rows, marNom: mar?.nom_complet?.trim() || null, lien,
        })
        const { sent } = await envoyerEmail({
          to: profile.email, subject: recu.subject, html: recu.html, text: recu.text,
        })
        accuse = sent
      }
      return res.status(200).json({ ok: true, notified, accuse })
    }

    // Décision : on prévient l'agent.
    if (type === 'hs_decision') {
      const { data: rows } = await supabaseAdmin
        .from('iade_heures_sup').select(CHAMPS_HS).in('id', idList)

      if (!rows || rows.length === 0) return rienAFaire('Aucune ligne correspondante.')

      // Le MAR désigné décide ; la gestion IADE peut trancher en secours.
      const autorise = peutGerer || rows.every(r => r.mar_id === user.id)
      if (!autorise) return sendError(res, 403, 'Droits insuffisants.')

      const notified = await prevenirAgents(rows, lien, ({ agentNom, rows: siennes, lien: l }) =>
        emailHsDecidees({
          agentNom,
          rows:   siennes,
          statut: siennes[0].statut,
          motif:  siennes[0].motif_reponse,
          lien:   l,
        }))
      return res.status(200).json({ ok: true, notified })
    }

    // La gestion a ajouté des heures : on informe l'agent.
    if (type === 'hs_ajout') {
      if (!peutGerer) return sendError(res, 403, 'Droits insuffisants.')

      const { data: rows } = await supabaseAdmin
        .from('iade_heures_sup').select(CHAMPS_HS).in('id', idList)

      if (!rows || rows.length === 0) return rienAFaire('Aucune ligne correspondante.')

      const notified = await prevenirAgents(rows, lien, emailHsAjoutees)
      return res.status(200).json({ ok: true, notified })
    }

    return sendError(res, 400, 'Type de notification inconnu.')
  } catch (err) {
    // Une notification ne doit jamais faire échouer l'action métier.
    console.error('Erreur iade-notify (non bloquante):', err)
    return res.status(200).json({ ok: false, notified: 0, error: 'Notification non envoyée.' })
  }
}
