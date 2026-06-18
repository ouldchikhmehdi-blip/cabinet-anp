// ============================================================
// toussaintApi.js — vacances de la Toussaint (grille fournie telle quelle) par année, accès Supabase.
// Même nature que noelApi : un « bloc imposé » collé, mais saisi depuis l'onglet Vacances.
// Lecture pour tout authenticated ; écriture réservée au faiseur (RLS).
// (cf. supabase/planning_toussaint.sql ; modèle/détection : noel.js, générique aux deux blocs.)
// ============================================================
import { supabase } from '../lib/supabase'
import { normaliserNoel } from './noel'

export async function chargerToussaint(annee) {
  // Tolérant : tant que la migration planning_toussaint.sql n'est pas appliquée (table absente), on renvoie
  // une grille vide au lieu de lever — sinon le Promise.all des onglets (Vacances/Réa/En semaine/Week-ends)
  // échouerait et casserait leur chargement. Une vraie grille s'affiche dès que la table existe.
  try {
    const { data, error } = await supabase
      .from('planning_toussaint')
      .select('data')
      .eq('annee', annee)
      .maybeSingle()
    if (error) throw error
    return normaliserNoel(data?.data)
  } catch {
    return normaliserNoel(null)
  }
}

export async function sauverToussaint(annee, data, userId) {
  const { error } = await supabase
    .from('planning_toussaint')
    .upsert({ annee, data, created_by: userId }, { onConflict: 'annee' })
  if (error) throw error
}
