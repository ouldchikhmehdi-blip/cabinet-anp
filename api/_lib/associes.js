// Liste des initiales d'associés, côté serveur (validation des fonctions /api).
//
// La liste réelle vit en base (table planning_associes, ligne id=1). La constante
// ci-dessous n'est plus qu'une valeur de REPLI si la base est indisponible — elle
// n'a plus à être éditée à la main lors d'un remplacement d'associé (cf. PLANNING.md
// « Remplacer un associé » ; le remplacement se fait depuis l'écran admin).
export const ASSOCIES = ['EH', 'MP', 'RC', 'FXD', 'BA', 'FF', 'YC', 'MOC']

// Lit la liste ordonnée des associés depuis la base (service_role), avec repli
// silencieux sur la constante ASSOCIES si la table est absente/indisponible.
export async function chargerAssocies(supabaseAdmin) {
  try {
    const { data } = await supabaseAdmin
      .from('planning_associes')
      .select('liste')
      .eq('id', 1)
      .maybeSingle()
    const liste = data?.liste
    if (Array.isArray(liste) && liste.length) {
      return liste.map(x => String(x ?? '').trim()).filter(Boolean)
    }
  } catch {
    // Repli sur la constante.
  }
  return ASSOCIES
}
