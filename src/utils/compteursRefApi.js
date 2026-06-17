// ============================================================
// compteursRefApi.js — accès Supabase aux « compteurs de référence » d'une année
// (table planning_compteurs_ref). Donnée ANNUELLE (clé annee) : socle « cumul à ce stade »
// (1ʳᵉ partie + été + Noël) réutilisé pour construire les recueils suivants.
// Lecture : tout authenticated ; écriture : faiseur (RLS, cf. supabase/planning_compteurs_ref.sql).
// ============================================================
import { supabase } from '../lib/supabase'
import { normaliserCompteursRef } from './compteursRef'

// Compteurs de référence d'une année → objet normalisé, ou null si rien d'enregistré.
export async function chargerCompteursRef(annee) {
  if (!annee) return null
  const { data, error } = await supabase
    .from('planning_compteurs_ref')
    .select('data')
    .eq('annee', annee)
    .maybeSingle()
  if (error) throw error
  return data ? normaliserCompteursRef(data.data) : null
}

// Enregistre (ou remplace) les compteurs de référence d'une année. Réservé au faiseur (RLS).
export async function sauverCompteursRef(annee, data, userId) {
  const { error } = await supabase
    .from('planning_compteurs_ref')
    .upsert(
      { annee, data, created_by: userId },
      { onConflict: 'annee' }
    )
  if (error) throw error
}

// Supprime les compteurs de référence d'une année. Réservé au faiseur (RLS).
export async function supprimerCompteursRef(annee) {
  const { error } = await supabase
    .from('planning_compteurs_ref')
    .delete()
    .eq('annee', annee)
  if (error) throw error
}
