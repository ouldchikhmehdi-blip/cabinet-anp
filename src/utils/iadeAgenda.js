// ============================================================
// iadeAgenda.js — logique pure de « Sync agenda » : reconnaître la colonne d'un
// agent dans le planning publié.
//
// Le planning nomme ses colonnes comme le fichier Excel les nomme (« NICOLAS »,
// « Cathy », parfois « PAULINE>sabrina » quand un poste change de titulaire en
// cours d'année). Le compte, lui, porte un nom complet (« Nicolas Martin »). On
// propose donc un rapprochement — mais c'est l'agent qui tranche, d'un clic :
// se tromper de colonne remplirait son agenda avec les journées d'un collègue.
// ============================================================

// Minuscules, sans accents ni ponctuation : « Congé » et « CONGE » se comparent.
export function normaliser(texte) {
  return String(texte ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * La colonne qui correspond le plus probablement à `nomComplet`, ou null.
 * On ne renvoie une suggestion que si UNE SEULE colonne correspond : deux
 * « Marion » dans le planning, et c'est à l'agent de dire laquelle est la sienne.
 */
export function suggererColonne(nomComplet, colonnes = []) {
  const mots = normaliser(nomComplet).split(' ').filter(m => m.length >= 3)
  if (mots.length === 0) return null

  const candidates = colonnes.filter(col => {
    // Une colonne peut porter deux noms (« PAULINE>sabrina ») : chaque morceau compte.
    const morceaux = normaliser(col).split(' ').filter(Boolean)
    return morceaux.some(m => mots.includes(m))
  })

  return candidates.length === 1 ? candidates[0] : null
}
