// ============================================================
// agendaApi.js — abonnement iCal de l'associé courant (table planning_agenda, RLS « sa propre ligne »).
// Le `token` (auto-généré en base) identifie le flux iCal public `/api/agenda?token=…`.
// ============================================================
import { supabase } from '../lib/supabase'

// Récupère (ou crée) la ligne d'abonnement de l'utilisateur courant → { token, actif }.
export async function obtenirAbonnement(userId) {
  // Crée la ligne si absente (token = gen_random_uuid() par défaut). ignoreDuplicates : ne touche pas
  // une ligne existante (préserve le token et l'état actif).
  await supabase
    .from('planning_agenda')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
  const { data, error } = await supabase
    .from('planning_agenda')
    .select('token, actif, exclus')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

// Active / désactive le flux. actif=false → le flux renvoie un calendrier vide (agenda vidé au refresh).
export async function definirActif(userId, actif) {
  const { error } = await supabase
    .from('planning_agenda')
    .update({ actif })
    .eq('user_id', userId)
  if (error) throw error
}

// Met à jour la liste des tiers EXCLUS (recueil_id désynchronisés individuellement).
export async function definirExclus(userId, exclus) {
  const { error } = await supabase
    .from('planning_agenda')
    .update({ exclus })
    .eq('user_id', userId)
  if (error) throw error
}
