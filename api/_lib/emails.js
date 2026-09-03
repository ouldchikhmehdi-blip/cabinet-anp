// ============================================================
// emails.js — contenu des e-mails transactionnels (invitations).
//
// Deux publics, deux procédures qu'il ne faut pas mélanger :
//   • associé / MAR : compte complet du dashboard, avec double authentification
//     OBLIGATOIRE → l'e-mail explique l'enrôlement de l'application d'authentification ;
//   • IADE          : compte restreint aux congés, SANS 2FA (cf. IADE.md) → l'e-mail
//     ne doit surtout pas parler de code à 6 chiffres, sinon la personne cherchera
//     une étape qui n'existe pas.
//
// Chaque fonction renvoie { subject, html, text } ; le `text` sert de version de
// repli et améliore la délivrabilité (un e-mail HTML seul est plus souvent classé
// en indésirable).
// ============================================================

const COULEUR = '#534AB7'
const VALIDITE = '48 heures'

// Coquille HTML commune. `apercu` = texte affiché dans la liste des messages,
// avant ouverture (masqué dans le corps).
function coquille({ apercu, titre, corps, pied }) {
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1efe8;">
  <div style="display:none;font-size:1px;color:#f1efe8;max-height:0;overflow:hidden;">${apercu}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1efe8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2c2c2a;">
        <tr><td>
          <div style="font-size:13px;font-weight:600;color:${COULEUR};letter-spacing:.02em;">SARM</div>
          <div style="font-size:11px;color:#888780;margin-top:2px;">Service Anesthésie Réanimation Millénaire</div>
          <h1 style="font-size:20px;font-weight:600;margin:20px 0 0;">${titre}</h1>
          ${corps}
          <div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(0,0,0,.08);font-size:11px;color:#888780;line-height:1.6;">
            ${pied ?? 'Si vous n\'attendiez pas cette invitation, ignorez simplement ce message : sans action de votre part, aucun compte n\'est créé.'}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function bouton(lien, libelle) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="border-radius:8px;background:${COULEUR};">
      <a href="${lien}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:500;color:#ffffff;text-decoration:none;">${libelle}</a>
    </td></tr>
  </table>`
}

function lienDeSecours(lien) {
  return `<p style="font-size:12px;color:#5f5e5a;line-height:1.6;margin:0;">
    Le bouton ne fonctionne pas ? Copiez cette adresse dans votre navigateur :<br>
    <span style="color:${COULEUR};word-break:break-all;">${lien}</span>
  </p>`
}

const p = (texte, style = '') =>
  `<p style="font-size:14px;line-height:1.65;color:#2c2c2a;margin:14px 0 0;${style}">${texte}</p>`

const bonjour = (nom) => (nom ? `Bonjour ${nom},` : 'Bonjour,')

// ── Invitation d'un associé / MAR : dashboard complet, 2FA obligatoire ───────
export function emailInvitationAssocie({ lien, nom }) {
  const corps = `
    ${p(bonjour(nom))}
    ${p(`Vous avez été invité(e) à accéder au <strong>dashboard du SARM</strong> : suivi financier, planning et desiderata.`)}
    ${bouton(lien, 'Créer mon compte')}
    ${p('<strong>Comment ça se passe</strong>, en trois minutes :', 'margin-top:24px;')}
    <ol style="font-size:14px;line-height:1.7;color:#2c2c2a;padding-left:20px;margin:8px 0 0;">
      <li>Vous choisissez un mot de passe (ou, si vous avez une adresse Gmail, vous cliquez simplement sur <em>Continuer avec Google</em>).</li>
      <li>L'application affiche un <strong>QR code</strong>. Ouvrez une application d'authentification sur votre téléphone — <em>Google Authenticator</em>, <em>Microsoft Authenticator</em>, ou l'app <em>Mots de passe</em> de l'iPhone — et scannez-le.</li>
      <li>Recopiez le code à 6 chiffres affiché par l'application. C'est terminé.</li>
    </ol>
    ${p(`Ensuite, à chaque connexion : votre mot de passe <strong>puis</strong> le code à 6 chiffres. Cette double vérification est <strong>obligatoire</strong> — c'est ce qui protège les données financières du cabinet, y compris si votre mot de passe venait à être découvert.`)}
    ${p(`⏳ Ce lien est valable <strong>${VALIDITE}</strong>, il ne fonctionne <strong>qu'une seule fois</strong> et n'est utilisable que par vous. Passé ce délai, demandez une nouvelle invitation.`, 'color:#5f5e5a;')}
    <div style="margin-top:20px;">${lienDeSecours(lien)}</div>`

  const text = `${bonjour(nom)}

Vous avez été invité(e) à accéder au dashboard du SARM (suivi financier, planning et desiderata).

Créez votre compte ici (lien valable ${VALIDITE}, à usage unique) :
${lien}

Comment ça se passe :
1. Vous choisissez un mot de passe (ou « Continuer avec Google » si vous avez une adresse Gmail).
2. L'application affiche un QR code : scannez-le avec une application d'authentification
   (Google Authenticator, Microsoft Authenticator, ou l'app Mots de passe de l'iPhone).
3. Recopiez le code à 6 chiffres affiché. C'est terminé.

Ensuite, à chaque connexion : mot de passe puis code à 6 chiffres. Cette double
vérification est obligatoire : elle protège les données du cabinet même si votre
mot de passe était découvert.

Si vous n'attendiez pas cette invitation, ignorez ce message : aucun compte n'est créé sans action de votre part.`

  return {
    subject: 'Votre accès au dashboard SARM',
    html: coquille({
      apercu: `Créez votre compte — lien valable ${VALIDITE}`,
      titre: 'Votre accès au dashboard',
      corps,
    }),
    text,
  }
}

// ── Invitation d'un IADE : congés uniquement, sans 2FA ──────────────────────
export function emailInvitationIade({ lien, nom }) {
  const corps = `
    ${p(bonjour(nom))}
    ${p(`Le SARM met en place un espace en ligne pour <strong>vos congés</strong> : vous y déposez vos demandes, vous suivez leur réponse, et vous voyez le calendrier des absences de l'équipe avant de choisir vos dates.`)}
    ${bouton(lien, 'Créer mon compte')}
    ${p('<strong>Deux façons de créer votre compte</strong>, au choix :', 'margin-top:24px;')}
    <ul style="font-size:14px;line-height:1.7;color:#2c2c2a;padding-left:20px;margin:8px 0 0;">
      <li>Vous avez une adresse <strong>Gmail</strong> : cliquez sur <em>Continuer avec Google</em>. Rien à retenir, rien à saisir.</li>
      <li>Sinon, choisissez simplement un mot de passe (8 caractères minimum).</li>
    </ul>
    ${p(`Aucune application à installer, aucun code de sécurité à saisir : vous vous connectez avec votre adresse e-mail, et c'est tout.`)}
    ${p(`📱 Pensez à le faire <strong>depuis votre téléphone</strong> : l'affichage y est prévu pour, et vous pourrez poser vos congés d'où vous voulez.`)}
    ${p(`⏳ Ce lien est valable <strong>${VALIDITE}</strong>, il ne fonctionne <strong>qu'une seule fois</strong> et n'est utilisable que par vous. Passé ce délai, demandez-en un nouveau.`, 'color:#5f5e5a;')}
    <div style="margin-top:20px;">${lienDeSecours(lien)}</div>`

  const text = `${bonjour(nom)}

Le SARM met en place un espace en ligne pour vos congés : vous y déposez vos demandes,
vous suivez leur réponse, et vous voyez le calendrier des absences de l'équipe avant de
choisir vos dates.

Créez votre compte ici (lien valable ${VALIDITE}, à usage unique) :
${lien}

Deux façons, au choix :
- Vous avez une adresse Gmail : cliquez sur « Continuer avec Google ». Rien à retenir.
- Sinon, choisissez simplement un mot de passe (8 caractères minimum).

Aucune application à installer, aucun code de sécurité à saisir.

Pensez à le faire depuis votre téléphone : l'affichage y est prévu pour, et vous pourrez
poser vos congés d'où vous voulez.

Si vous n'attendiez pas cette invitation, ignorez ce message : aucun compte n'est créé sans action de votre part.`

  return {
    subject: 'Vos congés en ligne — créez votre compte (SARM)',
    html: coquille({
      apercu: `Déposez vos congés en ligne — lien valable ${VALIDITE}`,
      titre: 'Vos congés en ligne',
      corps,
    }),
    text,
  }
}

// ============================================================
// Notifications « Congés IADE » (cf. IADE.md § Notifications).
// Public interne (gestion, agent) : pied de page neutre, pas de logique d'invitation.
// ============================================================
const PIED_NOTIF = 'Message automatique du dashboard SARM. Inutile de répondre à cet e-mail.'
const LIBELLE_TYPE = { cp: 'congé payé', recup_ferie: 'récup. jour férié' }

// ── Horodatage : le jour, jamais l'heure ─────────────────────────────────────
//
// Chaque demande et chaque décision porte sa date dans l'e-mail : c'est ce qui
// donne à l'agent comme à la gestion une trace datée, dans leur propre boîte,
// indépendante du dashboard. Le jour suffit — l'heure n'a jamais servi à trancher
// quoi que ce soit et alourdit la lecture.
//
// Fuseau Europe/Paris imposé : les timestamps sont stockés en UTC, et une demande
// déposée à 1 h du matin l'été s'afficherait sinon à la date de la veille.
export function jourSeul(horodatage) {
  if (!horodatage) return null
  const d = new Date(horodatage)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
}

// La date de dépôt d'un lot : celle de la ligne la plus ancienne. Un lot part en
// une fois, ses lignes portent la même seconde — mais une correction ultérieure
// peut en ajouter une, et c'est bien le premier dépôt qui fait foi.
export function dateDepot(rows) {
  const dates = (rows ?? []).map(r => r.created_at).filter(Boolean).sort()
  return jourSeul(dates[0])
}

// La date de décision : celle de la ligne tranchée en dernier.
export function dateDecision(rows) {
  const dates = (rows ?? []).map(r => r.decide_le).filter(Boolean).sort()
  return jourSeul(dates[dates.length - 1])
}

// Encadré de traçabilité, en pied de message. Volontairement discret : c'est une
// pièce à conserver, pas le sujet du message.
function encadreDates(lignes) {
  const utiles = lignes.filter(l => l.valeur)
  if (utiles.length === 0) return { html: '', text: '' }
  return {
    html: `<div style="margin-top:22px;padding:12px 14px;background:#f7f6f2;border-radius:8px;font-size:13px;line-height:1.7;color:#5f5e5a;">
      ${utiles.map(l => `${l.libelle} : <strong style="color:#2c2c2a;">${l.valeur}</strong>`).join('<br>')}
    </div>`,
    text: `\n${utiles.map(l => `${l.libelle} : ${l.valeur}`).join('\n')}`,
  }
}

// Met en forme une liste de jours [{ jour: 'YYYY-MM-DD', type_conge }] → { html, text, n }.
function formaterJours(rows) {
  const tries = [...rows].sort((a, b) => a.jour.localeCompare(b.jour))
  const items = tries.map(r => {
    const d = new Date(`${r.jour}T00:00:00`)
    const date = d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    return { date, type: LIBELLE_TYPE[r.type_conge] ?? r.type_conge }
  })
  const html = `<ul style="font-size:14px;line-height:1.8;color:#2c2c2a;padding-left:20px;margin:8px 0 0;">
    ${items.map(i => `<li>${i.date} — <strong>${i.type}</strong></li>`).join('')}
  </ul>`
  const text = items.map(i => `- ${i.date} — ${i.type}`).join('\n')
  return { html, text, n: items.length }
}

// A. L'agent a posé des jours → e-mail au gestionnaire.
export function emailCongesPoses({ agentNom, rows, lien }) {
  const j = formaterJours(rows)
  const corps = `
    ${p(bonjour())}
    ${p(`<strong>${agentNom}</strong> vient de déposer <strong>${j.n} jour(s)</strong> de congé, à valider :`)}
    ${j.html}
    ${bouton(lien, 'Ouvrir « Congés IADE »')}
    ${p('Connectez-vous et ouvrez l\'onglet <strong>Congés IADE</strong> pour valider ou refuser.', 'color:#5f5e5a;')}
    <div style="margin-top:16px;">${lienDeSecours(lien)}</div>`
  const text = `${bonjour()}

${agentNom} vient de déposer ${j.n} jour(s) de congé, à valider :
${j.text}

Ouvrez l'onglet « Congés IADE » du dashboard pour valider ou refuser :
${lien}`
  return {
    subject: `Congés IADE à valider — ${agentNom}`,
    html: coquille({ apercu: `${agentNom} a posé ${j.n} jour(s) — à valider`, titre: 'Demande de congé à valider', corps, pied: PIED_NOTIF }),
    text,
  }
}

// A bis. Le même dépôt, renvoyé à l'AGENT : son accusé de réception.
// Il vaut preuve datée du jour où il a demandé — dans sa propre boîte, sans
// dépendre du dashboard ni de la mémoire de qui que ce soit.
export function emailCongesRecus({ agentNom, rows, lien }) {
  const j = formaterJours(rows)
  const dates = encadreDates([{ libelle: 'Demande déposée le', valeur: dateDepot(rows) }])
  const corps = `
    ${p(bonjour(agentNom))}
    ${p(`Votre demande de <strong>${j.n} jour(s)</strong> de congé est bien enregistrée :`)}
    ${j.html}
    ${dates.html}
    ${p('Elle est <strong>en attente</strong> : vous recevrez un e-mail dès que la gestion aura répondu.', 'color:#5f5e5a;')}
    ${bouton(lien, 'Ouvrir « Mes congés »')}
    ${p('Conservez ce message : il date votre demande.', 'color:#5f5e5a;font-size:13px;')}
    <div style="margin-top:16px;">${lienDeSecours(lien)}</div>`
  const text = `${bonjour(agentNom)}

Votre demande de ${j.n} jour(s) de congé est bien enregistrée :
${j.text}
${dates.text}

Elle est en attente : vous recevrez un e-mail dès que la gestion aura répondu.
Conservez ce message, il date votre demande.

Ouvrez l'onglet « Mes congés » du dashboard :
${lien}`
  return {
    subject: `Votre demande de congé — bien reçue (${j.n} jour(s))`,
    html: coquille({ apercu: `${j.n} jour(s) enregistré(s), en attente de réponse`, titre: 'Demande de congé enregistrée', corps, pied: PIED_NOTIF }),
    text,
  }
}

// B. L'agent a retiré / modifié des jours → e-mail au gestionnaire.
export function emailCongesRetires({ agentNom, rows, lien }) {
  const j = formaterJours(rows)
  const corps = `
    ${p(bonjour())}
    ${p(`<strong>${agentNom}</strong> a <strong>retiré</strong> ${j.n} jour(s) de sa demande de congé :`)}
    ${j.html}
    ${bouton(lien, 'Ouvrir « Congés IADE »')}
    ${p('Sa demande a changé — vérifiez l\'onglet <strong>Congés IADE</strong>.', 'color:#5f5e5a;')}
    <div style="margin-top:16px;">${lienDeSecours(lien)}</div>`
  const text = `${bonjour()}

${agentNom} a retiré ${j.n} jour(s) de sa demande de congé :
${j.text}

Sa demande a changé — vérifiez l'onglet « Congés IADE » :
${lien}`
  return {
    subject: `Congés IADE modifiés — ${agentNom}`,
    html: coquille({ apercu: `${agentNom} a retiré ${j.n} jour(s)`, titre: 'Demande de congé modifiée', corps, pied: PIED_NOTIF }),
    text,
  }
}

// C. Le gestionnaire a décidé → e-mail à l'agent (validation ou refus).
export function emailCongesDecides({ agentNom, rows, statut, motif, lien }) {
  const j = formaterJours(rows)
  const valide = statut === 'validee'
  const verbe = valide ? 'validé(s)' : 'refusé(s)'
  const corpsMotif = (!valide && motif?.trim())
    ? p(`Motif : <em>${motif.trim()}</em>`, 'color:#5f5e5a;')
    : ''
  const dates = encadreDates([
    { libelle: 'Demande déposée le', valeur: dateDepot(rows) },
    { libelle: valide ? 'Validée le' : 'Réponse du', valeur: dateDecision(rows) },
  ])
  const corps = `
    ${p(bonjour(agentNom))}
    ${p(`Vos congés suivants ont été <strong>${verbe}</strong> :`)}
    ${j.html}
    ${corpsMotif}
    ${dates.html}
    ${bouton(lien, 'Ouvrir « Mes congés »')}
    ${!valide ? p('Vous pouvez reposer d\'autres jours depuis l\'onglet <strong>Mes congés</strong>.', 'color:#5f5e5a;') : ''}
    <div style="margin-top:16px;">${lienDeSecours(lien)}</div>`
  const text = `${bonjour(agentNom)}

Vos congés suivants ont été ${verbe} :
${j.text}${(!valide && motif?.trim()) ? `\n\nMotif : ${motif.trim()}` : ''}
${dates.text}

Ouvrez l'onglet « Mes congés » du dashboard :
${lien}`
  return {
    subject: valide ? 'Vos congés ont été validés' : 'Vos congés — réponse de la gestion',
    html: coquille({ apercu: `Vos congés ont été ${verbe}`, titre: 'Réponse à votre demande de congé', corps, pied: PIED_NOTIF }),
    text,
  }
}

// ============================================================
// Notifications « Heures supplémentaires IADE » (cf. IADE.md § Heures sup).
// Trois moments : l'agent déclare → le MAR désigné ; le MAR décide → l'agent ;
// la gestion ajoute des heures → l'agent (informé, il n'a rien à approuver).
// ============================================================

// Met en forme une liste de lignes [{ jour: 'YYYY-MM-DD', heures }] → { html, text, n, total }.
function formaterHeures(rows) {
  const tries = [...rows].sort((a, b) => a.jour.localeCompare(b.jour))
  const items = tries.map(r => {
    const d = new Date(`${r.jour}T00:00:00`)
    const date = d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    return { date, heures: `${r.heures} h`, commentaire: r.commentaire?.trim() || null }
  })
  const html = `<ul style="font-size:14px;line-height:1.8;color:#2c2c2a;padding-left:20px;margin:8px 0 0;">
    ${items.map(i => `<li>${i.date} — <strong>${i.heures}</strong>${i.commentaire ? ` <span style="color:#5f5e5a;">(${i.commentaire})</span>` : ''}</li>`).join('')}
  </ul>`
  const text = items.map(i => `- ${i.date} — ${i.heures}${i.commentaire ? ` (${i.commentaire})` : ''}`).join('\n')
  return { html, text, n: items.length, total: rows.reduce((s, r) => s + (Number(r.heures) || 0), 0) }
}

// Lien d'action porté par l'e-mail. Il ouvre une PAGE DE CONFIRMATION, il ne
// décide pas tout seul : les filtres anti-phishing d'Outlook et Gmail visitent les
// liens des messages entrants, un lien qui déciderait en GET partirait sans clic.
// Cf. api/hs-decision.js.
// Sans URL absolue (VITE_APP_URL absent côté serveur), un lien d'e-mail serait
// relatif — donc mort. On préfère alors ne pas afficher de bouton du tout.
function baseUtilisable(base) {
  return /^https?:\/\//i.test(String(base ?? ''))
}

function lienDecision(base, jeton, action) {
  return `${String(base ?? '').replace(/\/+$/, '')}/api/hs-decision`
    + `?jeton=${encodeURIComponent(jeton)}&action=${action}`
}

function boutonsDecision(base, jeton) {
  const style = (fond) => `display:inline-block;padding:11px 22px;font-size:14px;font-weight:500;`
    + `color:#ffffff;text-decoration:none;border-radius:8px;background:${fond};`
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 4px;">
    <tr>
      <td style="padding-right:8px;">
        <a href="${lienDecision(base, jeton, 'valider')}" style="${style('#2E7D46')}">Valider</a>
      </td>
      <td>
        <a href="${lienDecision(base, jeton, 'refuser')}" style="${style('#C0392B')}">Refuser</a>
      </td>
    </tr>
  </table>`
}

// Un jour = une carte, avec ses deux boutons quand l'URL absolue est connue.
// Partagé par la déclaration (D) et sa correction (G) : deux messages qui montrent
// la même chose, à quelques minutes d'intervalle, doivent se ressembler.
function cartesDecision(rows, lien) {
  const boutonsPossibles = baseUtilisable(lien)
  const html = rows.map(r => {
    const date = new Date(`${r.jour}T00:00:00`).toLocaleDateString('fr-FR',
      { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    return `<div style="margin:18px 0;padding:14px 16px;background:#f7f6f2;border-radius:8px;">
      <div style="font-size:14px;color:#2c2c2a;">${date} — <strong>${r.heures} h</strong>${
        r.commentaire?.trim() ? `<br><span style="color:#5f5e5a;font-size:13px;">${r.commentaire.trim()}</span>` : ''}</div>
      ${(boutonsPossibles && r.jeton) ? boutonsDecision(lien, r.jeton) : ''}
    </div>`
  }).join('')
  return { html, boutonsPossibles }
}

// Les mêmes liens, pour la version texte du message.
function liensTexte(rows, lien) {
  return rows.filter(r => r.jeton).map(r =>
    `- ${r.jour} (${r.heures} h)\n    Valider : ${lienDecision(lien, r.jeton, 'valider')}\n    Refuser : ${lienDecision(lien, r.jeton, 'refuser')}`
  ).join('\n')
}

// D. L'agent a déclaré des heures → e-mail au MAR qu'il a désigné.
// Chaque jour porte ses deux boutons : on répond depuis l'e-mail, sans se connecter.
export function emailHsDeclarees({ agentNom, rows, lien }) {
  const h = formaterHeures(rows)
  const tries = [...rows].sort((a, b) => a.jour.localeCompare(b.jour))
  const { html: blocs, boutonsPossibles } = cartesDecision(tries, lien)

  const corps = `
    ${p(bonjour())}
    ${p(`<strong>${agentNom}</strong> déclare <strong>${h.total} h</strong> supplémentaires et indique que <strong>vous</strong> les lui avez demandées.`)}
    ${blocs}
    ${boutonsPossibles
      ? p('Un clic ouvre une page de confirmation — ni mot de passe ni code à saisir. Vous pourrez revenir sur votre réponse jusqu\'à la fin du mois suivant.', 'color:#5f5e5a;font-size:13px;')
      : ''}
    ${p(`${boutonsPossibles ? 'Vous préférez le dashboard ? Onglet' : 'Rendez-vous dans l\'onglet'} <strong>Heures sup à valider</strong>${lien ? ` : ${lien}` : ' du dashboard.'}`, 'color:#5f5e5a;font-size:13px;')}`

  const text = `${bonjour()}

${agentNom} déclare ${h.total} h supplémentaires et indique que vous les lui avez demandées :
${h.text}

${boutonsPossibles ? `Répondre directement (une page de confirmation s'ouvre, aucune connexion demandée) :
${liensTexte(tries, lien)}

Vous pourrez revenir sur votre réponse jusqu'à la fin du mois suivant.
Sinon, onglet` : 'Rendez-vous dans l\'onglet'} « Heures sup à valider » du dashboard${lien ? ` : ${lien}` : '.'}`

  return {
    subject: `Heures sup à valider — ${agentNom}`,
    html: coquille({ apercu: `${agentNom} déclare ${h.total} h — à valider`, titre: 'Heures supplémentaires à valider', corps, pied: PIED_NOTIF }),
    text,
  }
}

// D bis. La même déclaration, renvoyée à l'AGENT : son accusé de réception.
// Il dit aussi À QUI la demande est partie — le MAR désigné —, parce que c'est la
// question qui revient quand la réponse tarde.
export function emailHsRecues({ agentNom, rows, marNom, lien }) {
  const h = formaterHeures(rows)
  const dates = encadreDates([
    { libelle: 'Déclaration déposée le', valeur: dateDepot(rows) },
    { libelle: 'Transmise à', valeur: marNom || null },
  ])
  const corps = `
    ${p(bonjour(agentNom))}
    ${p(`Votre déclaration de <strong>${h.total} h</strong> supplémentaires est bien enregistrée :`)}
    ${h.html}
    ${dates.html}
    ${p(`Elle est <strong>en attente</strong>${marNom ? ` de la réponse du <strong>${marNom}</strong>` : ''} : vous recevrez un e-mail dès qu'elle sera tranchée.`, 'color:#5f5e5a;')}
    ${bouton(lien, 'Ouvrir « Mes heures sup »')}
    ${p('Conservez ce message : il date votre déclaration.', 'color:#5f5e5a;font-size:13px;')}
    <div style="margin-top:16px;">${lienDeSecours(lien)}</div>`
  const text = `${bonjour(agentNom)}

Votre déclaration de ${h.total} h supplémentaires est bien enregistrée :
${h.text}
${dates.text}

Elle est en attente${marNom ? ` de la réponse du ${marNom}` : ''} : vous recevrez un e-mail dès qu'elle sera tranchée.
Conservez ce message, il date votre déclaration.

Ouvrez l'onglet « Mes heures sup » du dashboard :
${lien}`
  return {
    subject: `Votre déclaration d'heures sup — bien reçue (${h.total} h)`,
    html: coquille({ apercu: `${h.total} h enregistrées, en attente de validation`, titre: 'Déclaration enregistrée', corps, pied: PIED_NOTIF }),
    text,
  }
}

// E. Le MAR (ou la gestion) a décidé → e-mail à l'agent.
export function emailHsDecidees({ agentNom, rows, statut, motif, lien }) {
  const h = formaterHeures(rows)
  const valide = statut === 'validee'
  const verbe = valide ? 'validées' : 'refusées'
  const corpsMotif = (!valide && motif?.trim())
    ? p(`Motif : <em>${motif.trim()}</em>`, 'color:#5f5e5a;')
    : ''
  const dates = encadreDates([
    { libelle: 'Déclaration déposée le', valeur: dateDepot(rows) },
    { libelle: valide ? 'Validée le' : 'Réponse du', valeur: dateDecision(rows) },
  ])
  const corps = `
    ${p(bonjour(agentNom))}
    ${p(`Vos heures supplémentaires ont été <strong>${verbe}</strong> :`)}
    ${h.html}
    ${corpsMotif}
    ${dates.html}
    ${bouton(lien, 'Ouvrir « Mes heures sup »')}
    ${valide ? p('Elles seront reportées dans le planning et transmises à la comptabilité.', 'color:#5f5e5a;') : ''}
    <div style="margin-top:16px;">${lienDeSecours(lien)}</div>`
  const text = `${bonjour(agentNom)}

Vos heures supplémentaires ont été ${verbe} :
${h.text}${(!valide && motif?.trim()) ? `\n\nMotif : ${motif.trim()}` : ''}
${dates.text}

Ouvrez l'onglet « Mes heures sup » du dashboard :
${lien}`
  return {
    subject: valide ? 'Vos heures supplémentaires ont été validées' : 'Vos heures supplémentaires — réponse',
    html: coquille({ apercu: `Vos heures supplémentaires ont été ${verbe}`, titre: 'Réponse à votre déclaration', corps, pied: PIED_NOTIF }),
    text,
  }
}

// F. La gestion a ajouté des heures → e-mail d'information à l'agent.
// Rien à approuver de son côté : ces heures naissent validées (cf. le SQL).
export function emailHsAjoutees({ agentNom, rows, lien }) {
  const h = formaterHeures(rows)
  // Ces heures naissent validées : leur date d'ajout EST leur date de décision.
  const dates = encadreDates([{ libelle: 'Ajoutées le', valeur: dateDepot(rows) }])
  const corps = `
    ${p(bonjour(agentNom))}
    ${p(`<strong>${h.total} h</strong> supplémentaires viennent de vous être ajoutées :`)}
    ${h.html}
    ${dates.html}
    ${bouton(lien, 'Ouvrir « Mes heures sup »')}
    ${p('Ces heures sont déjà actées : elles seront reportées dans le planning et transmises à la comptabilité. Si quelque chose vous semble inexact, signalez-le à la personne qui gère les IADE.', 'color:#5f5e5a;')}
    <div style="margin-top:16px;">${lienDeSecours(lien)}</div>`
  const text = `${bonjour(agentNom)}

${h.total} h supplémentaires viennent de vous être ajoutées :
${h.text}
${dates.text}

Ces heures sont déjà actées. En cas d'erreur, signalez-le à la personne qui gère les IADE.
Ouvrez l'onglet « Mes heures sup » du dashboard :
${lien}`
  return {
    subject: `Heures supplémentaires ajoutées — ${h.total} h`,
    html: coquille({ apercu: `${h.total} h supplémentaires vous ont été ajoutées`, titre: 'Heures supplémentaires ajoutées', corps, pied: PIED_NOTIF }),
    text,
  }
}

// G. L'agent a corrigé sa déclaration (encore en attente) → e-mail au MAR désigné.
// Sans ce message, le MAR garderait dans sa boîte le premier e-mail, annonçant des
// heures qui ne sont plus les bonnes — et rien ne le lui dirait.
export function emailHsCorrigees({ agentNom, rows, lien }) {
  const tries = [...rows].sort((a, b) => a.jour.localeCompare(b.jour))
  const h = formaterHeures(tries)
  const { html: blocs, boutonsPossibles } = cartesDecision(tries, lien)

  const corps = `
    ${p(bonjour())}
    ${p(`<strong>${agentNom}</strong> a <strong>corrigé</strong> sa déclaration d'heures supplémentaires. Voici ce qu'elle dit maintenant :`)}
    ${blocs}
    ${p('Ce message remplace le précédent : répondez depuis celui-ci.', 'color:#5f5e5a;font-size:13px;')}
    ${p(`${boutonsPossibles ? 'Vous préférez le dashboard ? Onglet' : 'Rendez-vous dans l\'onglet'} <strong>Heures sup à valider</strong>${lien ? ` : ${lien}` : ' du dashboard.'}`, 'color:#5f5e5a;font-size:13px;')}`

  const text = `${bonjour()}

${agentNom} a corrigé sa déclaration d'heures supplémentaires. Elle dit maintenant :
${h.text}

Ce message remplace le précédent : répondez depuis celui-ci.
${boutonsPossibles ? `${liensTexte(tries, lien)}

Sinon, onglet` : 'Rendez-vous dans l\'onglet'} « Heures sup à valider » du dashboard${lien ? ` : ${lien}` : '.'}`

  return {
    subject: `Heures sup corrigées — ${agentNom}`,
    html: coquille({ apercu: `${agentNom} a corrigé sa déclaration — ${h.total} h`, titre: 'Déclaration corrigée', corps, pied: PIED_NOTIF }),
    text,
  }
}

// H. La déclaration ne concerne plus le MAR : l'agent l'a retirée, ou il a désigné
// quelqu'un d'autre. Aucun bouton — il n'y a plus rien à décider, et le lien du
// message précédent ne mène plus nulle part (ligne supprimée, ou jeton renouvelé).
export function emailHsSansSuite({ agentNom, rows, lien, cause }) {
  const h = formaterHeures(rows)
  const reattribuee = cause === 'reassignation'
  const phrase = reattribuee
    ? `<strong>${agentNom}</strong> a corrigé sa déclaration et désigné <strong>un autre MAR</strong> : ces heures ne vous sont plus adressées.`
    : `<strong>${agentNom}</strong> a <strong>retiré</strong> sa déclaration d'heures supplémentaires : il n'y a plus rien à valider.`

  const corps = `
    ${p(bonjour())}
    ${p(phrase)}
    ${h.html}
    ${p('Le lien de validation reçu précédemment ne fonctionne plus. Vous pouvez supprimer ce message et le précédent.', 'color:#5f5e5a;font-size:13px;')}
    ${lien ? p(`Le reste de vos validations est dans l'onglet <strong>Heures sup à valider</strong> : ${lien}`, 'color:#5f5e5a;font-size:13px;') : ''}`

  const text = `${bonjour()}

${reattribuee
  ? `${agentNom} a corrigé sa déclaration et désigné un autre MAR : ces heures ne vous sont plus adressées.`
  : `${agentNom} a retiré sa déclaration d'heures supplémentaires : il n'y a plus rien à valider.`}
${h.text}

Le lien de validation reçu précédemment ne fonctionne plus.`

  return {
    subject: reattribuee ? `Heures sup réattribuées — ${agentNom}` : `Heures sup retirées — ${agentNom}`,
    html: coquille({
      apercu: reattribuee ? `${agentNom} a désigné un autre MAR` : `${agentNom} a retiré sa déclaration`,
      titre: reattribuee ? 'Déclaration réattribuée' : 'Déclaration retirée',
      corps, pied: PIED_NOTIF,
    }),
    text,
  }
}
