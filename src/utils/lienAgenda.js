// ============================================================
// lienAgenda.js — les liens « s'abonner » d'un flux iCal, pour les deux écrans
// de synchronisation (`MonAgenda` côté associés, `IadeAgendaPerso` côté IADE).
//
// Ce qui se joue ici : le flux peut être parfaitement valide et l'abonnement
// n'aboutir nulle part, parce que le lien profond visait le mauvais service.
//   • **Outlook** — `outlook.live.com` ne connaît QUE les comptes personnels
//     (@outlook.com, @hotmail.fr). Avec un compte professionnel Microsoft 365,
//     la page s'ouvre, demande une connexion qui n'existe pas, et l'agenda reste
//     vide : « la procédure a lieu mais rien ne s'affiche ». Les comptes
//     professionnels passent par `outlook.office.com`. Impossible de deviner
//     lequel : on propose les deux, en le disant.
//   • **Google** — `calendar.google.com/calendar/r?cid=…` n'ajoute que sur le
//     compte ACTIF dans le navigateur. Sur un téléphone connecté à deux comptes,
//     l'abonnement part sur le mauvais et l'agenda consulté reste vide. D'où le
//     conseil « sur ordinateur » et l'adresse à coller, toujours affichée.
// ============================================================

/** Adresse d'abonnement absolue (https) du flux, ou null tant qu'il n'y a pas de jeton. */
export function urlFlux(base, chemin, token) {
  if (!token) return null
  return `${String(base).replace(/\/$/, '')}${chemin}?token=${token}`
}

/**
 * @param {string|null} urlHttps adresse du flux
 * @param {string} nom nom proposé au calendrier lors de l'abonnement
 * @returns {{webcal, google, outlookPerso, outlookPro}|null}
 */
export function liensAbonnement(urlHttps, nom) {
  if (!urlHttps) return null
  // Apple (et Outlook classique sur poste) comprennent webcal:// : le clic ouvre
  // directement l'app Calendrier au lieu de télécharger un fichier .ics figé.
  const webcal = urlHttps.replace(/^https?:\/\//, 'webcal://')
  const q = `url=${encodeURIComponent(urlHttps)}&name=${encodeURIComponent(nom)}`
  return {
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlookPerso: `https://outlook.live.com/calendar/0/addfromweb?${q}`,
    outlookPro: `https://outlook.office.com/calendar/0/addfromweb?${q}`,
  }
}
