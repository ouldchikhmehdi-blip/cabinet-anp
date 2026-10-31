// ============================================================
// facturationApi.js — lecture des agrégats de facturation (supabase/facturation.sql).
// Écrits uniquement par compta/facturation.js (mini PC, clé service role) : le
// navigateur ne fait que lire, sous RLS (acces_cabinet()).
// ============================================================
import { supabase } from '../lib/supabase'

const PAGE = 1000

async function toutLire(table, champs, ordre) {
  const tout = []
  for (let depuis = 0; ; depuis += PAGE) {
    let q = supabase.from(table).select(champs)
    for (const o of ordre) q = q.order(o)
    const { data, error } = await q.range(depuis, depuis + PAGE - 1)
    if (error) throw error
    tout.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return tout
}

const NUM_MENSUEL = ['facture_total', 'facture_dh', 'facture_amo', 'facture_amc', 'facture_pat', 'regle_total', 'regle_conv', 'regle_dh', 'redevance_ttc']

export async function chargerFacturation() {
  const [mensuel, chirurgiens] = await Promise.all([
    toutLire('facturation_mensuelle', 'annee, mois, associe, etablissement, ' + NUM_MENSUEL.join(', ') + ', nb_lignes_fac, nb_lignes_red, importe_le', ['annee', 'mois', 'associe', 'etablissement']),
    toutLire('facturation_chirurgiens', 'annee, mois, chirurgien, montant, nb_lignes, nb_sejours, importe_le', ['annee', 'mois', 'chirurgien']),
  ])
  return {
    mensuel: mensuel.map(r => ({ ...r, ...Object.fromEntries(NUM_MENSUEL.map(k => [k, Number(r[k])])) })),
    chirurgiens: chirurgiens.map(r => ({ ...r, montant: Number(r.montant) })),
  }
}
