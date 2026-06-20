// ============================================================
// remplacantsApi.js — liste éditable des remplaçants connus (reconnaissance « Planning par service »).
// Table SINGLETON (une ligne, id = 1). Lecture pour tout authenticated ; écriture réservée au faiseur (RLS).
// (cf. supabase/planning_remplacants.sql)
// ============================================================
import { supabase } from '../lib/supabase'

// → tableau de noms (chaînes). Tolère l'absence de table/ligne (renvoie []).
export async function chargerRemplacants() {
  const { data, error } = await supabase
    .from('planning_remplacants')
    .select('data')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  const noms = data?.data?.noms
  return Array.isArray(noms) ? noms.filter(n => typeof n === 'string' && n.trim()) : []
}

export async function sauverRemplacants(noms, userId) {
  const liste = Array.isArray(noms) ? noms.map(n => String(n).trim()).filter(Boolean) : []
  const { error } = await supabase
    .from('planning_remplacants')
    .upsert({ id: 1, data: { v: 1, noms: liste }, created_by: userId }, { onConflict: 'id' })
  if (error) throw error
}
