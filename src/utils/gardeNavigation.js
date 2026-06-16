// ============================================================
// gardeNavigation.js — garde « modifications non enregistrées » avant de quitter une page.
// L'app a un routage par état (App.jsx) sans react-router : une page qui a des changements
// non transmis enregistre ici une fonction de garde ; les points de navigation (sidebar,
// deconnexion) appellent peutQuitter() avant d'agir.
//
// La garde renvoie true si on PEUT quitter (rien en attente, ou l'utilisateur confirme),
// false sinon. Un seul garde actif à la fois (une seule page de saisie montée).
// ============================================================
let garde = null

export function definirGardeNavigation(fn) {
  garde = typeof fn === 'function' ? fn : null
}

export function peutQuitter() {
  return garde ? garde() : true
}
