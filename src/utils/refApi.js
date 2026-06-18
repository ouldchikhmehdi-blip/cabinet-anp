// ============================================================
// refApi.js — référence des tiers 1+2 (saisie manuelle) par année, accès Supabase.
// On capture une grille colorée brute (sans interprétation) reproduite en haut de l'export du 3ᵉ tiers.
// Lecture pour tout authenticated ; écriture réservée au faiseur (RLS).
// (cf. supabase/planning_ref.sql ; modèle/capture : referenceGrille.js)
// ============================================================
import { supabase } from '../lib/supabase'
import { normaliserReference } from './referenceGrille'

export async function chargerRef(annee) {
  // Tolérant : tant que la migration planning_ref.sql n'est pas appliquée (table absente), on renvoie une
  // référence vide au lieu de lever — sinon le chargement de l'onglet « En semaine » échouerait.
  try {
    const { data, error } = await supabase
      .from('planning_ref')
      .select('data')
      .eq('annee', annee)
      .maybeSingle()
    if (error) throw error
    return normaliserReference(data?.data)
  } catch {
    return normaliserReference(null)
  }
}

export async function sauverRef(annee, data, userId) {
  const { error } = await supabase
    .from('planning_ref')
    .upsert({ annee, data, created_by: userId }, { onConflict: 'annee' })
  if (error) throw error
}
