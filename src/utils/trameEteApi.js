// ============================================================
// trameEteApi.js — accès Supabase à la grille d'été d'un recueil (table planning_trame_ete).
// La grille est rattachée à UN recueil (clé recueil_id). Lecture : tout authenticated ;
// écriture : faiseur (RLS, cf. supabase/planning_trame_ete.sql).
// ============================================================
import { supabase } from '../lib/supabase'
import { normaliserTrameEte } from './trameEte'

// Grille d'été d'un recueil → objet normalisé, ou null si aucune grille publiée.
export async function chargerTrameEte(recueilId) {
  if (!recueilId) return null
  const { data, error } = await supabase
    .from('planning_trame_ete')
    .select('data')
    .eq('recueil_id', recueilId)
    .maybeSingle()
  if (error) throw error
  return data ? normaliserTrameEte(data.data) : null
}

// Publie (ou remplace) la grille d'été d'un recueil. Réservé au faiseur (RLS).
export async function sauverTrameEte(recueilId, data, userId) {
  const { error } = await supabase
    .from('planning_trame_ete')
    .upsert(
      { recueil_id: recueilId, data, created_by: userId },
      { onConflict: 'recueil_id' }
    )
  if (error) throw error
}

// Supprime la grille d'été d'un recueil. Réservé au faiseur (RLS).
export async function supprimerTrameEte(recueilId) {
  const { error } = await supabase
    .from('planning_trame_ete')
    .delete()
    .eq('recueil_id', recueilId)
  if (error) throw error
}
