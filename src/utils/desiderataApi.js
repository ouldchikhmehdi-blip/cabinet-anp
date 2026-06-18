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
    .select('id, annee, nom, semaine_debut, semaine_fin, statut, type, created_at')
    .eq('annee', annee)
    .order('semaine_debut')
  if (error) throw error
  return data ?? []
}

// Id du recueil le plus récemment créé (created_at desc, repli sur la semaine de début la plus élevée).
// Sert de sélection par défaut : on atterrit d'emblée sur la dernière période ouverte par le faiseur.
export function idRecueilPlusRecent(recueils) {
  if (!recueils?.length) return null
  return [...recueils].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0
    const tb = b.created_at ? Date.parse(b.created_at) : 0
    if (tb !== ta) return tb - ta
    return (b.semaine_debut ?? 0) - (a.semaine_debut ?? 0)
  })[0].id
}

export async function creerRecueil({ annee, nom, semaineDebut, semaineFin, type = 'normal', userId }) {
  const { data, error } = await supabase
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
    .select('id')
    .single()
  if (error) throw error
  return data
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
// Inclut nom_complet (export « Planning par service » : noms en entier au lieu des initiales).
export async function chargerProfilsAvecInitiales() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, initiales, nom_complet')
    .not('initiales', 'is', null)
  if (error) throw error
  return data ?? []
}
