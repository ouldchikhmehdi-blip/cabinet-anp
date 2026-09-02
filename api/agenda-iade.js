import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { evenementsDepuisPlanning } from './_lib/evenementsPlanning.js'
import { calendrier, evenement, horodatage } from './_lib/ics.js'

/**
 * GET /api/agenda-iade?token=<token> — flux iCalendar (.ics) PUBLIC d'un IADE, pour abonnement
 * (iPhone/Apple, Google, Outlook). Aucun JWT : protégé par le `token` non devinable (URL-capacité).
 *
 * Lit via le service_role : iade_agenda(token) → user_id + actif + colonne + data.
 * data = [ { d:'YYYYMMDD', slot, titre, desc, (à l'heure) ts,te | (journée) allday, fin } ].
 *
 * DEUX sources possibles, et `colonne` l'emporte :
 *   • `colonne` renseignée → les événements sont RECALCULÉS à chaque appel depuis le
 *     planning publié (`iade_planning`, colonne `iade`). L'agent a désigné sa colonne une
 *     fois ; son agenda suit ensuite la republication nocturne, sans plus rien coller.
 *   • sinon → `data`, les événements figés qu'il a poussés en collant des mois.
 * Laisser les deux vivantes en même temps mettrait deux vérités dans le même agenda.
 *
 * Token inconnu ou `actif=false` → calendrier VIDE (l'agenda abonné se vide au prochain rafraîchissement).
 *
 * La conformité du .ics (DTSTAMP, repli des lignes, fuseau déclaré) est tenue par
 * `_lib/ics.js` : sans elle, Google et Outlook acceptaient l'abonnement puis
 * n'affichaient AUCUNE journée. Voir l'en-tête de ce fichier.
 */

const NOM_CALENDRIER = 'SARM — Mon planning IADE'
const PRODID = '-//SARM//Planning IADE//FR'

const vide = () => calendrier({ nom: NOM_CALENDRIER, prodid: PRODID, evenements: [] })

const echapper = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

// Page servie quand l'adresse est ouverte dans un navigateur. Elle dit la seule
// chose qui compte : cette adresse se COLLE dans un agenda, elle ne s'ouvre pas.
function pageAide(token) {
  const url = `https://sarm-dashboard.vercel.app/api/agenda-iade?token=${encodeURIComponent(token)}`
  const webcal = url.replace(/^https?:\/\//, 'webcal://')
  const google = `https://calendar.google.com/calendar/r/settings/addbyurl?cid=${encodeURIComponent(url)}`
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Mon planning IADE — comment s'y abonner</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin:0; padding:24px 12px; background:#f1efe8; color:#2c2c2a;
      font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
    .carte { max-width:620px; margin:0 auto; background:#fff; border-radius:12px; padding:28px 24px; }
    .marque { font-size:13px; font-weight:600; color:#534AB7; }
    .sous { font-size:11px; color:#888780; margin-top:2px; }
    h1 { font-size:20px; font-weight:600; margin:18px 0 10px; }
    h2 { font-size:15px; font-weight:600; margin:22px 0 6px; }
    ol { padding-left:20px; margin:6px 0; }
    li { margin:4px 0; }
    .url { font-family:ui-monospace,Menlo,monospace; font-size:12px; word-break:break-all;
      background:#f7f6f2; border-radius:8px; padding:10px 12px; margin:10px 0; }
    .bouton { display:inline-block; padding:11px 20px; border-radius:8px; background:#534AB7;
      color:#fff; text-decoration:none; font-size:14px; font-weight:500; margin:4px 8px 4px 0; }
    .note { font-size:13px; color:#5f5e5a; }
    @media (prefers-color-scheme: dark) {
      body { background:#1a1a19; color:#eceae3; }
      .carte { background:#242422; } .url { background:#2c2c29; }
      .sous, .note { color:#a5a39b; }
    }
  </style>
</head>
<body>
  <div class="carte">
    <div class="marque">SARM</div>
    <div class="sous">Service Anesthésie Réanimation Millénaire</div>
    <h1>Cette adresse ne s'ouvre pas — elle s'ajoute à ton agenda</h1>
    <p class="note">Tu viens de l'ouvrir dans un navigateur : il ne sait qu'en télécharger un
      fichier, que ton ordinateur ne saura probablement pas ouvrir. <strong>Ce fichier ne sert
      à rien</strong> — et même ouvert, il ne se mettrait jamais à jour. Ce qu'il faut, c'est
      <strong>abonner</strong> ton agenda à cette adresse. Une fois pour toutes.</p>

    <h2>iPhone, iPad, Mac</h2>
    <p class="note">Depuis ton iPhone, touche ce bouton et confirme dans Calendrier.</p>
    <a class="bouton" href="${echapper(webcal)}">📲 Ajouter à mon agenda Apple</a>

    <h2>Google Agenda — sur un ORDINATEUR</h2>
    <p class="note">L'application Google Agenda du téléphone ne sait pas ajouter un agenda par
      adresse : la fonction n'y existe pas. Fais-le sur un ordinateur, ton téléphone suivra.</p>
    <ol>
      <li>Vérifie en haut à droite de Google Agenda que tu es sur <strong>ton</strong> compte.</li>
      <li>Clique le bouton, colle l'adresse ci-dessous, puis <strong>Ajouter un agenda</strong>.</li>
      <li>Sur le téléphone : Google Agenda → Paramètres → coche « SARM — Mon planning IADE ».</li>
    </ol>
    <a class="bouton" href="${echapper(google)}" target="_blank" rel="noopener noreferrer">➕ Ouvrir Google Agenda</a>

    <h2>L'adresse à coller</h2>
    <div class="url">${echapper(url)}</div>
    <p class="note">Elle t'est personnelle : elle donne accès à ton planning, ne la diffuse pas.
      Ton agenda se met à jour tout seul, avec jusqu'à une heure de décalage — c'est ton
      application d'agenda qui décide quand elle rafraîchit.</p>
  </div>
</body>
</html>`
}

// Fenêtre publiée dans l'agenda : deux mois en arrière (le mois écoulé se consulte
// encore) jusqu'à la fin de l'année suivante (le planning se fait à l'année).
function fenetre() {
  const maintenant = new Date()
  return {
    debut: new Date(maintenant.getTime() - 62 * 86400000).toISOString().slice(0, 10),
    fin: `${maintenant.getUTCFullYear() + 1}-12-31`,
  }
}

export default async function handler(req, res) {
  const token = (req.query?.token ?? new URL(req.url, 'http://x').searchParams.get('token') ?? '').toString().trim()

  // Adresse ouverte À LA MAIN dans un navigateur : on explique au lieu de servir
  // le fichier. Sinon le navigateur télécharge un .ics que Windows ne sait pas
  // ouvrir — un agent s'est retrouvé devant « impossible d'ouvrir ce document »
  // en croyant que la synchronisation ne marchait pas, alors que son flux
  // fonctionnait. Un client d'agenda, lui, ne demande jamais de HTML.
  const accept = String(req.headers?.accept ?? '')
  const brut = String(req.query?.brut ?? '') === '1'
  if (!brut && accept.includes('text/html') && !accept.includes('text/calendar')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    return res.status(200).send(pageAide(token))
  }

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, max-age=0')
  res.setHeader('Content-Disposition', 'inline; filename="sarm-planning-iade.ics"')

  try {
    if (!token) return res.status(200).send(vide())

    const { data: ab } = await supabaseAdmin
      .from('iade_agenda')
      .select('user_id, actif, colonne, data, updated_at')
      .eq('token', token)
      .maybeSingle()
    if (!ab || !ab.actif) return res.status(200).send(vide())

    // UID stable par (jour, créneau, IADE) → mises à jour propres, purge des jours retirés.
    const base = String(ab.user_id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)

    let evts
    // DTSTAMP = date de la dernière écriture de la source, pas l'instant courant :
    // un DTSTAMP qui bouge à chaque requête ferait rejouer tout l'agenda à chaque
    // rafraîchissement, alors que rien n'a changé.
    let maj = ab.updated_at
    if (ab.colonne) {
      const { debut, fin } = fenetre()
      const { data: lignes } = await supabaseAdmin
        .from('iade_planning')
        .select('jour, matin, apres_midi, note, maj')
        .eq('iade', ab.colonne)
        .gte('jour', debut)
        .lte('jour', fin)
        .order('jour')
      evts = evenementsDepuisPlanning(lignes ?? [])
      for (const l of lignes ?? []) {
        if (l?.maj && (!maj || l.maj > maj)) maj = l.maj
      }
    } else {
      evts = Array.isArray(ab.data) ? ab.data : []
    }

    const dtstamp = horodatage(maj)
    const evenements = evts.map(e => {
      if (!e?.d || !e?.slot) return null
      return evenement({
        uid: `${e.d}-${base}-${e.slot}@sarm-iade`,
        dtstamp,
        jour: e.d,
        finJour: e.allday ? e.fin : null,
        debut: e.allday ? null : e.ts,
        fin: e.allday ? null : e.te,
        titre: e.titre,
        desc: e.desc,
      })
    })

    return res.status(200).send(calendrier({ nom: NOM_CALENDRIER, prodid: PRODID, evenements }))
  } catch {
    // En cas d'erreur, ne pas casser l'abonnement : renvoyer un calendrier vide.
    return res.status(200).send(vide())
  }
}
