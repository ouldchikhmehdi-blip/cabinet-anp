// ============================================================
// associesApi.js — liste ordonnée des associés (initiales), accès Supabase.
// Lecture pour tout authenticated ; écriture réservée admin via /api
// (cf. supabase/planning_associes.sql). Le remplacement d'un associé passe par
// la Vercel Function /api/planning-remplacer-associe (service_role).
// ============================================================
import { supabase } from '../lib/supabase'
import { ASSOCIES, appliquerAssocies } from '../data/associes'

// Lit la liste depuis la base et l'applique à ASSOCIES (mutation en place).
// Retourne la liste effective (base si disponible, sinon valeur de repli).
// Ne jette jamais : en cas d'indisponibilité (réseau/RLS/table absente), on
// conserve la valeur de repli déjà présente dans ASSOCIES.
export async function chargerAssociesDepuisBase() {
  try {
    const { data, error } = await supabase
      .from('planning_associes')
      .select('liste')
      .eq('id', 1)
      .maybeSingle()
    if (error) throw error
    if (Array.isArray(data?.liste) && data.liste.length) {
      appliquerAssocies(data.liste)
    }
  } catch {
    // Repli silencieux sur la liste codée (déjà dans ASSOCIES).
  }
  return [...ASSOCIES]
}
