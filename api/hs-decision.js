import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { envoyerEmail } from './_lib/mailer.js'
import { emailHsDecidees } from './_lib/emails.js'

/**
 * GET|POST /api/hs-decision?jeton=…&action=valider|refuser
 *
 * Décider des heures sup **depuis l'e-mail**, sans connexion ni 2FA. Le `jeton`
 * de la déclaration, remis au MAR désigné dans son message, fait autorisation.
 *
 * ⚠️ Pourquoi une page de confirmation plutôt qu'un lien qui décide directement :
 * les filtres anti-phishing d'Outlook et Gmail VISITENT les liens des messages
 * entrants pour les inspecter. Un GET qui déciderait serait déclenché tout seul,
 * sans que personne n'ait cliqué. Ici le GET ne fait que **lire** et afficher ;
 * seul le POST du formulaire décide.
 *
 * L'écriture passe par la RPC `iade_hs_decider_par_jeton()` (SECURITY DEFINER,
 * exécutable par le seul `service_role`) : la règle de délai reste en base, en un
 * seul endroit, plutôt que d'être réécrite ici.
 */
const COULEUR = '#534AB7'
const VERT = '#2E7D46'
const ROUGE = '#C0392B'

const echapper = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

const dateLongue = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR',
    { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

const dateCourte = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR',
    { day: '2-digit', month: '2-digit', year: 'numeric' })

function page({ titre, corps, code = 200 }) {
  return { code, html: `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${echapper(titre)} — SARM</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin:0; padding:24px 12px; background:#f1efe8; color:#2c2c2a;
      font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
    .carte { max-width:520px; margin:0 auto; background:#fff; border-radius:12px; padding:28px 24px; }
    .marque { font-size:13px; font-weight:600; color:${COULEUR}; }
    .sous { font-size:11px; color:#888780; margin-top:2px; }
    h1 { font-size:20px; font-weight:600; margin:20px 0 12px; }
    dl { margin:16px 0; padding:14px 16px; background:#f7f6f2; border-radius:8px; }
    dt { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#888780; }
    dd { margin:2px 0 12px; font-size:15px; }
    dd:last-child { margin-bottom:0; }
    .actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:20px; }
    button { flex:1 1 160px; padding:13px 20px; font-size:15px; font-weight:500;
      border:none; border-radius:8px; color:#fff; cursor:pointer; font-family:inherit; }
    .valider { background:${VERT}; }
    .refuser { background:${ROUGE}; }
    .secondaire { background:transparent; color:#5f5e5a; border:1px solid rgba(0,0,0,.15); }
    input[type=text] { width:100%; box-sizing:border-box; padding:10px 12px; font-size:14px;
      border:1px solid rgba(0,0,0,.15); border-radius:8px; font-family:inherit; margin-top:6px; }
    .pied { margin-top:24px; padding-top:14px; border-top:1px solid rgba(0,0,0,.08);
      font-size:12px; color:#888780; }
    .ok { color:${VERT}; font-weight:600; }
    .ko { color:${ROUGE}; font-weight:600; }
    @media (prefers-color-scheme: dark) {
      body { background:#1a1a19; color:#eceae3; }
      .carte { background:#242422; }
      dl { background:#2c2c29; }
      .sous, dt, .pied { color:#a5a39b; }
      .secondaire { color:#c8c6bf; border-color:rgba(255,255,255,.2); }
      input[type=text] { background:#1a1a19; color:#eceae3; border-color:rgba(255,255,255,.2); }
    }
  </style>
</head>
<body>
  <div class="carte">
    <div class="marque">SARM</div>
    <div class="sous">Service Anesthésie Réanimation Millénaire</div>
    ${corps}
    <div class="pied">Vous agissez depuis le lien reçu par e-mail : aucune connexion n'est demandée.
    Ce lien ne donne accès qu'à cette seule déclaration.</div>
  </div>
</body>
</html>` }
}

const erreur = (message, code = 400) => page({
  titre: 'Lien inutilisable',
  code,
  corps: `<h1>Ce lien ne peut pas être utilisé</h1><p>${echapper(message)}</p>
    <p style="color:#888780;font-size:13px;">Vous pouvez toujours répondre depuis le dashboard,
    onglet « Heures sup à valider ».</p>`,
})

function detail(row, agentNom) {
  return `<dl>
    <dt>Agent</dt><dd>${echapper(agentNom)}</dd>
    <dt>Jour</dt><dd>${echapper(dateLongue(row.jour))}</dd>
    <dt>Heures déclarées</dt><dd><strong>${row.heures} h</strong></dd>
    ${row.commentaire ? `<dt>Précision</dt><dd>${echapper(row.commentaire)}</dd>` : ''}
  </dl>`
}

async function charger(jeton) {
  const { data: row } = await supabaseAdmin
    .from('iade_heures_sup')
    .select('id, user_id, jour, heures, commentaire, statut, motif_reponse, mar_id, jeton')
    .eq('jeton', jeton)
    .maybeSingle()
  if (!row) return { row: null }

  const { data: agent } = await supabaseAdmin
    .from('profiles').select('email, nom_complet').eq('id', row.user_id).maybeSingle()
  const agentNom = agent?.nom_complet?.trim()
    || (agent?.email ? agent.email.split('@')[0] : 'Un agent')
  return { row, agent, agentNom }
}

export default async function handler(req, res) {
  const source = req.method === 'POST' ? (req.body ?? {}) : (req.query ?? {})
  const jeton  = String(source.jeton ?? '').trim()
  const action = String(source.action ?? '').trim()
  const motif  = String(source.motif ?? '')

  const envoyer = ({ code, html }) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    // Une page d'action ne se met pas en cache, et ne s'indexe pas.
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    return res.status(code).send(html)
  }

  if (!/^[0-9a-f-]{36}$/i.test(jeton)) {
    return envoyer(erreur('Le lien est incomplet ou a été tronqué par la messagerie.'))
  }
  if (!['valider', 'refuser'].includes(action)) {
    return envoyer(erreur('Action inconnue.'))
  }

  try {
    const { row, agent, agentNom } = await charger(jeton)
    if (!row) {
      return envoyer(erreur('Cette déclaration n’existe plus — elle a peut-être été retirée par l’agent.', 404))
    }

    // Tout en UTC, comme `current_date` côté base : un calcul en heure locale
    // sérialisé en ISO décalerait la limite d'un jour depuis la France.
    // (⚠️ doit rester aligné sur public.iade_hs_fin_fenetre() et sur
    //  finFenetre() dans src/utils/iadeHeuresSup.js.)
    const [an, moisNum] = row.jour.split('-').map(Number)
    const limiteIso  = new Date(Date.UTC(an, moisNum + 1, 0)).toISOString().slice(0, 10)
    const aujourdhui = new Date().toISOString().slice(0, 10)
    const dejaDecidee = row.statut !== 'en_attente'

    if (dejaDecidee && aujourdhui > limiteIso) {
      return envoyer(erreur(
        `Le délai pour revenir sur cette décision est passé : il courait jusqu’au ${dateCourte(limiteIso)}. `
        + 'La personne qui gère les IADE peut encore la corriger.', 409))
    }

    // ── GET : on affiche, on ne décide pas ────────────────────────────────
    if (req.method !== 'POST') {
      const verbe = action === 'valider' ? 'Valider' : 'Refuser'
      const deja = dejaDecidee
        ? `<p style="color:#888780;font-size:13px;">Cette déclaration est actuellement
             <strong>${row.statut === 'validee' ? 'validée' : 'refusée'}</strong>.
             Vous pouvez la corriger jusqu’au ${echapper(dateCourte(limiteIso))}.</p>`
        : ''
      return envoyer(page({
        titre: `${verbe} des heures supplémentaires`,
        corps: `<h1>${verbe} ces heures supplémentaires ?</h1>
          ${detail(row, agentNom)}
          ${deja}
          <p style="font-size:13px;">${action === 'valider'
            ? 'En validant, vous confirmez avoir demandé ces heures.'
            : 'L’agent sera prévenu du refus.'}</p>
          <form method="POST" action="/api/hs-decision">
            <input type="hidden" name="jeton" value="${echapper(jeton)}">
            <input type="hidden" name="action" value="${echapper(action)}">
            ${action === 'refuser'
              ? `<label style="font-size:13px;">Motif communiqué à l’agent (facultatif)
                   <input type="text" name="motif" maxlength="200"></label>`
              : ''}
            <div class="actions">
              <button type="submit" class="${action === 'valider' ? 'valider' : 'refuser'}">
                Confirmer : ${verbe.toLowerCase()}
              </button>
            </div>
          </form>
          <div class="actions">
            <form method="GET" action="/api/hs-decision" style="flex:1 1 160px;">
              <input type="hidden" name="jeton" value="${echapper(jeton)}">
              <input type="hidden" name="action" value="${action === 'valider' ? 'refuser' : 'valider'}">
              <button type="submit" class="secondaire" style="width:100%;">
                ${action === 'valider' ? 'Refuser plutôt' : 'Valider plutôt'}
              </button>
            </form>
          </div>`,
      }))
    }

    // ── POST : on décide ──────────────────────────────────────────────────
    const statut = action === 'valider' ? 'validee' : 'refusee'
    const { error } = await supabaseAdmin.rpc('iade_hs_decider_par_jeton', {
      p_jeton: jeton, p_statut: statut, p_motif: motif,
    })
    if (error) return envoyer(erreur(error.message, 409))

    // L'agent est prévenu, comme s'il s'agissait d'une décision prise dans l'app.
    if (agent?.email) {
      const message = emailHsDecidees({
        agentNom,
        rows:   [{ jour: row.jour, heures: row.heures, commentaire: row.commentaire }],
        statut,
        motif,
        lien:   process.env.VITE_APP_URL ?? '',
      })
      await envoyerEmail({
        to: agent.email, subject: message.subject, html: message.html, text: message.text,
      }).catch(() => {})     // un e-mail raté ne doit pas annuler la décision
    }

    const valide = statut === 'validee'
    return envoyer(page({
      titre: valide ? 'Heures validées' : 'Heures refusées',
      corps: `<h1 class="${valide ? 'ok' : 'ko'}">
            ${valide ? 'Heures validées' : 'Heures refusées'}</h1>
          ${detail(row, agentNom)}
          <p style="font-size:14px;">${agentNom} vient d’en être informé par e-mail.</p>
          <p style="font-size:13px;color:#888780;">Erreur de votre part ?
            Vous pouvez revenir sur cette décision jusqu’au
            <strong>${echapper(dateCourte(limiteIso))}</strong>.</p>
          <form method="GET" action="/api/hs-decision">
            <input type="hidden" name="jeton" value="${echapper(jeton)}">
            <input type="hidden" name="action" value="${valide ? 'refuser' : 'valider'}">
            <div class="actions">
              <button type="submit" class="secondaire">
                ${valide ? 'Finalement, refuser' : 'Finalement, valider'}
              </button>
            </div>
          </form>`,
    }))
  } catch (err) {
    console.error('Erreur hs-decision:', err)
    return envoyer(erreur('Une erreur est survenue. Réessayez, ou passez par le dashboard.', 500))
  }
}
