// ============================================================
// archivesApi.js — accès Supabase aux PLANNINGS ARCHIVÉS (fichiers Excel validés).
// Bucket privé `planning-archives` + table d'index `planning_archives` (cf. supabase/planning_archives.sql).
// Écriture réservée au faiseur (RLS) ; lecture par tous les associés ; téléchargement par URL signée.
// ============================================================
import { supabase } from '../lib/supabase'

const BUCKET = 'planning-archives'
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Rend une chaîne sûre pour un nom de fichier (accents/espaces → tirets).
function nettoyerNom(s) {
  return String(s ?? '')
    .normalize('NFD')                       // accents → base + marque combinante…
    .replace(/[^a-zA-Z0-9-]+/g, '-')        // …puis tout ce qui n'est pas ASCII/chiffre/tiret → tiret
    .replace(/-+/g, '-').replace(/^-|-$/g, '')
}

// Dépose le fichier dans le bucket et indexe l'archive. buffer = sortie de workbook.xlsx.writeBuffer().
export async function uploaderArchive({ annee, recueil, buffer, userId }) {
  const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const base = nettoyerNom(recueil?.nom || `planning-${annee}`)
  const chemin = `${annee}/${base}-${horodatage}.xlsx`

  const { error: errUp } = await supabase.storage
    .from(BUCKET)
    .upload(chemin, new Blob([buffer], { type: MIME_XLSX }), { contentType: MIME_XLSX, upsert: false })
  if (errUp) throw errUp

  const { data, error } = await supabase
    .from('planning_archives')
    .insert({
      annee,
      recueil_id: recueil?.id ?? null,
      nom: recueil?.nom ?? `Planning ${annee}`,
      semaine_debut: recueil?.semaine_debut ?? null,
      semaine_fin: recueil?.semaine_fin ?? null,
      chemin,
      created_by: userId ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listerArchives(annee) {
  const { data, error } = await supabase
    .from('planning_archives')
    .select('id, annee, nom, semaine_debut, semaine_fin, chemin, created_at')
    .eq('annee', annee)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// URL de téléchargement temporaire (URL signée, 1 h).
export async function urlArchive(chemin) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(chemin, 3600)
  if (error) throw error
  return data?.signedUrl ?? null
}

export async function supprimerArchive(archive) {
  if (archive?.chemin) await supabase.storage.from(BUCKET).remove([archive.chemin])
  const { error } = await supabase.from('planning_archives').delete().eq('id', archive.id)
  if (error) throw error
}
