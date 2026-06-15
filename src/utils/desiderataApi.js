// ============================================================
// desiderataApi.js — accès Supabase aux desiderata et aux recueils de période.
// La confidentialité est garantie par la RLS (cf. supabase/planning.sql).
// ============================================================
import { supabase } from '../lib/supabase'
import { normaliser } from './desiderata'

// ── Desiderata d'un associé pour (année, période) ──
export async function chargerMesDesiderata(userId, annee, periode) {
  const { data, error } = await supabase
    .from('planning_desiderata')
    .select('data, soumis, updated_at')
    .eq('user_id', userId)
    .eq('annee', annee)
    .eq('periode', periode)
    .maybeSingle()
  if (error) throw error
  return {
    data: normaliser(data?.data),
    soumis: data?.soumis ?? false,
    updatedAt: data?.updated_at ?? null,
  }
}

export async function sauverMesDesiderata(userId, annee, periode, data, soumis) {
  const { error } = await supabase
    .from('planning_desiderata')
    .upsert(
      { user_id: userId, annee, periode, data, soumis },
      { onConflict: 'user_id,annee,periode' }
    )
  if (error) throw error
}

// ── Faiseur : tous les desiderata d'une (année, période) ──
// La RLS ne renvoie tout qu'au faiseur (sinon uniquement sa propre ligne).
export async function chargerTousDesiderata(annee, periode) {
  const { data, error } = await supabase
    .from('planning_desiderata')
    .select('user_id, data, soumis, updated_at')
    .eq('annee', annee)
    .eq('periode', periode)
  if (error) throw error
  return data ?? []
}

// ── Profils ayant des initiales (pour mapper user_id → initiales côté faiseur) ──
export async function chargerProfilsAvecInitiales() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, initiales')
    .not('initiales', 'is', null)
  if (error) throw error
  return data ?? []
}

// ── Recueils de période ──
export async function listerPeriodes(annee) {
  const { data, error } = await supabase
    .from('planning_periodes')
    .select('annee, periode, statut')
    .eq('annee', annee)
  if (error) throw error
  return data ?? []
}

export async function ouvrirPeriode(annee, periode, userId) {
  const { error } = await supabase
    .from('planning_periodes')
    .upsert(
      { annee, periode, statut: 'ouvert', created_by: userId },
      { onConflict: 'annee,periode' }
    )
  if (error) throw error
}

export async function fermerPeriode(annee, periode) {
  const { error } = await supabase
    .from('planning_periodes')
    .update({ statut: 'ferme' })
    .eq('annee', annee)
    .eq('periode', periode)
  if (error) throw error
}
