// ============================================================
// desiderataApi.js — accès Supabase aux desiderata et aux recueils.
// La confidentialité est garantie par la RLS (cf. supabase/planning.sql).
// Un recueil = une plage de semaines (semaine_debut → semaine_fin) d'une année.
// ============================================================
import { supabase } from '../lib/supabase'
import { normaliser } from './desiderata'

// ── Recueils (plages ouvertes par le faiseur) ──
export async function listerRecueils(annee) {
  const { data, error } = await supabase
    .from('planning_recueils')
    .select('id, annee, nom, semaine_debut, semaine_fin, statut, type')
    .eq('annee', annee)
    .order('semaine_debut')
  if (error) throw error
  return data ?? []
}

export async function creerRecueil({ annee, nom, semaineDebut, semaineFin, type = 'normal', userId }) {
  const { error } = await supabase
    .from('planning_recueils')
    .insert({
      annee,
      nom,
      semaine_debut: semaineDebut,
      semaine_fin: semaineFin,
      type,
      statut: 'ouvert',
      created_by: userId,
    })
  if (error) throw error
}

export async function definirStatutRecueil(id, statut) {
  const { error } = await supabase
    .from('planning_recueils')
    .update({ statut })
    .eq('id', id)
  if (error) throw error
}

export async function definirTypeRecueil(id, type) {
  const { error } = await supabase
    .from('planning_recueils')
    .update({ type })
    .eq('id', id)
  if (error) throw error
}

export async function supprimerRecueil(id) {
  const { error } = await supabase.from('planning_recueils').delete().eq('id', id)
  if (error) throw error
}

// ── Desiderata d'un associé pour un recueil ──
export async function chargerMesDesiderata(userId, recueilId) {
  const { data, error } = await supabase
    .from('planning_desiderata')
    .select('data, soumis, updated_at')
    .eq('user_id', userId)
    .eq('recueil_id', recueilId)
    .maybeSingle()
  if (error) throw error
  return {
    data: normaliser(data?.data),
    soumis: data?.soumis ?? false,
    updatedAt: data?.updated_at ?? null,
  }
}

export async function sauverMesDesiderata(userId, recueilId, data, soumis) {
  const { error } = await supabase
    .from('planning_desiderata')
    .upsert(
      { user_id: userId, recueil_id: recueilId, data, soumis },
      { onConflict: 'user_id,recueil_id' }
    )
  if (error) throw error
}

// ── Faiseur : réinitialiser (supprimer) tous les desiderata d'un recueil ──
// Autorisé par la policy DELETE faiseur (cf. supabase/planning_archives.sql).
export async function supprimerDesiderataRecueil(recueilId) {
  const { error } = await supabase
    .from('planning_desiderata')
    .delete()
    .eq('recueil_id', recueilId)
  if (error) throw error
}

// ── Faiseur : tous les desiderata d'un recueil ──
// La RLS ne renvoie tout qu'au faiseur (sinon uniquement sa propre ligne).
export async function chargerTousDesiderata(recueilId) {
  const { data, error } = await supabase
    .from('planning_desiderata')
    .select('user_id, data, soumis, updated_at')
    .eq('recueil_id', recueilId)
  if (error) throw error
  return data ?? []
}

// ── Profils ayant des initiales (mapper user_id → initiales côté faiseur) ──
export async function chargerProfilsAvecInitiales() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, initiales')
    .not('initiales', 'is', null)
  if (error) throw error
  return data ?? []
}
