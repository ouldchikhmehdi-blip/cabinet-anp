import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES } from '../utils/calendrier'
import { ANNEE_DEFAUT } from '../utils/desiderata'
import { parserCollageParService } from '../utils/planningParService'
import { exporterParServiceExcel } from '../utils/exportParService'
import { chargerProfilsAvecInitiales } from '../utils/desiderataApi'
import { chargerRemplacants, sauverRemplacants } from '../utils/remplacantsApi'
import { REMPLACANTS_CONNUS } from '../data/remplacants'

// Onglet « Planning par service » (faiseur) : on COLLE une période du tableur Excel du faiseur
// (colonnes = personnes, cellules = postes), l'outil reconnaît initiales/remplaçants, propose un
// aperçu transposé PAR SERVICE et exporte un Excel ordonné par poste. Rien n'est sauvegardé.
export default function PlanningParService() {
  const { session, profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [annee, setAnnee] = useState(ANNEE_DEFAUT)
  const [profils, setProfils] = useState([])
  const [texte, setTexte] = useState('')
  const [resultat, setResultat] = useState(null) // { table, diag }
  const [erreur, setErreur] = useState(null)
  const [exportEnCours, setExportEnCours] = useState(false)
  const [remplacantsCustom, setRemplacantsCustom] = useState([]) // noms ajoutés par le faiseur (base)
  const [nouveauRempl, setNouveauRempl] = useState('')

  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    Promise.all([chargerProfilsAvecInitiales(), chargerRemplacants().catch(() => [])])
      .then(([ps, rempl]) => { if (annule) return; setProfils(ps); setRemplacantsCustom(rempl) })
      .catch(() => { if (!annule) setErreur('Impossible de charger les noms des associés.') })
    return () => { annule = true }
  }, [estFaiseur])

  const nomParIni = useMemo(() => {
    const m = {}
    for (const p of profils) if (p.initiales) m[p.initiales] = p.nom_complet || p.initiales
    return m
  }, [profils])

  // Liste complète des noms reconnus = liste en dur + liste éditable (dédoublonnée, insensible à la casse).
  const remplacantsConnus = useMemo(() => {
    const out = []
    const vus = new Set()
    for (const nom of [...REMPLACANTS_CONNUS, ...remplacantsCustom]) {
      const cle = nom.trim().toLowerCase()
      if (cle && !vus.has(cle)) { vus.add(cle); out.push(nom.trim()) }
    }
    return out
  }, [remplacantsCustom])

  async function persisterRemplacants(liste) {
    setRemplacantsCustom(liste)
    // Re-analyse l'aperçu avec la liste à jour (sinon il faudrait recliquer « Analyser »).
    const merged = []
    const vus = new Set()
    for (const nom of [...REMPLACANTS_CONNUS, ...liste]) {
      const cle = nom.trim().toLowerCase()
      if (cle && !vus.has(cle)) { vus.add(cle); merged.push(nom.trim()) }
    }
    if (resultat) setResultat(parserCollageParService(texte, { nomParIni, remplacantsConnus: merged }))
    try {
      await sauverRemplacants(liste, session?.user?.id)
    } catch {
      setErreur('Enregistrement de la liste des remplaçants impossible (table planning_remplacants créée ?).')
    }
  }

  function ajouterRemplacant() {
    const nom = nouveauRempl.trim()
    if (!nom) return
    if (remplacantsCustom.some(n => n.toLowerCase() === nom.toLowerCase()) || REMPLACANTS_CONNUS.some(n => n.toLowerCase() === nom.toLowerCase())) {
      setNouveauRempl(''); return
    }
    persisterRemplacants([...remplacantsCustom, nom])
    setNouveauRempl('')
  }

  function retirerRemplacant(nom) {
    persisterRemplacants(remplacantsCustom.filter(n => n !== nom))
  }

  function analyser() {
    setErreur(null)
    const res = parserCollageParService(texte, { nomParIni, remplacantsConnus })
    if (!res.table.lignes.length) {
      setResultat(null)
      setErreur('Rien à analyser : collez un tableau (1ʳᵉ ligne = en-têtes, 1ʳᵉ colonne = dates).')
      return
    }
    setResultat(res)
  }

  function effacer() {
    setTexte(''); setResultat(null); setErreur(null)
  }

  async function exporter() {
    if (!resultat?.table.lignes.length) return
    setExportEnCours(true)
    try {
      await exporterParServiceExcel(annee, resultat.table)
    } catch {
      setErreur('Export impossible.')
    } finally {
      setExportEnCours(false)
    }
  }

  const s = {
    select: { padding: '6px 10px', fontSize: 13, border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)' },
    bouton: { padding: '9px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
    boutonSecondaire: { padding: '9px 16px', background: 'transparent', color: 'var(--color-primary)', border: '0.5px solid var(--color-primary)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
    th: { padding: '6px 10px', fontSize: 12, fontWeight: 600, textAlign: 'left', borderBottom: '0.5px solid var(--color-border)', position: 'sticky', top: 0, background: 'var(--color-surface)' },
    td: { padding: '5px 10px', fontSize: 12.5, borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap' },
  }

  if (!estFaiseur) {
    return (
      <div style={{ maxWidth: 720 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Planning par service</h1>
        <div style={{ background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 20, color: 'var(--color-text-secondary)', fontSize: 14 }}>
          Cette page est réservée au faiseur de planning.
        </div>
      </div>
    )
  }

  const table = resultat?.table
  const diag = resultat?.diag

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Planning par service</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        Collez une période de votre tableur (1ʳᵉ colonne = dates, colonnes suivantes = associés et remplaçants,
        cellules = le poste du jour). L'outil reconnaît les initiales et les remplaçants, puis transpose la vue
        par service (SARM 1, SARM 2, Bloc A viscéral, Bloc A NC, Bloc B, USC/Réa) et l'exporte en Excel.
      </p>

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>{erreur}</div>
      )}

      <div style={{ background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Remplaçants connus</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
          Noms reconnus automatiquement dans le collage (accents, majuscules et « Dr/Docteur » ignorés).
          Tout « Dr … » écrit dans une cellule est aussi détecté.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          {remplacantsConnus.map(nom => {
            const enDur = REMPLACANTS_CONNUS.some(n => n.toLowerCase() === nom.toLowerCase())
            return (
              <span key={nom} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '3px 10px', borderRadius: 999, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}>
                {nom}
                {!enDur && (
                  <button type="button" onClick={() => retirerRemplacant(nom)} title="Retirer" style={{ border: 'none', background: 'transparent', color: 'var(--color-primary-dark)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                )}
              </span>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={nouveauRempl}
            onChange={e => setNouveauRempl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterRemplacant() } }}
            placeholder="Ajouter un remplaçant (ex. Dr Untel)"
            style={{ ...s.select, minWidth: 240 }}
          />
          <button type="button" onClick={ajouterRemplacant} disabled={!nouveauRempl.trim()} style={{ ...s.boutonSecondaire, padding: '6px 14px', opacity: !nouveauRempl.trim() ? 0.5 : 1 }}>
            Ajouter
          </button>
        </div>
      </div>

      <textarea
        value={texte}
        onChange={e => setTexte(e.target.value)}
        placeholder={'Collez ici depuis Excel (Ctrl+V).\nExemple :\nDate\tEH\tMP\tRC\tDr Martin\nLun 07/01\tSARM 1\tViscéral\tBloc B\tSARM 2'}
        rows={8}
        style={{
          width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'monospace', fontSize: 12.5,
          padding: 12, border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
          background: 'var(--color-bg)', color: 'var(--color-text)', marginBottom: 12,
        }}
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
        <button type="button" onClick={analyser} disabled={!texte.trim()} style={{ ...s.bouton, opacity: !texte.trim() ? 0.5 : 1 }}>
          Analyser
        </button>
        <button type="button" onClick={effacer} disabled={!texte && !resultat} style={{ ...s.boutonSecondaire, opacity: (!texte && !resultat) ? 0.5 : 1 }}>
          Effacer
        </button>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Année (nom de fichier)
          <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={s.select}>
            {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <button type="button" onClick={exporter} disabled={exportEnCours || !table?.lignes.length} style={{ ...s.bouton, opacity: (exportEnCours || !table?.lignes.length) ? 0.5 : 1 }}>
          {exportEnCours ? 'Export…' : '⬇ Exporter Excel'}
        </button>
      </div>

      {diag && (
        <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 20, lineHeight: 1.6 }}>
          <div><strong>{diag.nbJours}</strong> jour(s) analysé(s).</div>
          <div>
            <strong>Associés reconnus :</strong>{' '}
            {diag.associes.length ? diag.associes.map(a => `${a.ini} → ${a.nom}`).join(' · ') : '—'}
          </div>
          <div>
            <strong>Remplaçants :</strong>{' '}
            {diag.remplacants.length ? diag.remplacants.map(r => r.nom).join(' · ') : '—'}
          </div>
          {diag.ignorees.length > 0 && (
            <div><strong>Colonnes ignorées :</strong> {diag.ignorees.length} (vides)</div>
          )}
          {diag.avert.length > 0 && (
            <div style={{ color: 'var(--color-danger)', marginTop: 6 }}>
              {diag.avert.map((a, i) => <div key={i}>⚠ {a}</div>)}
            </div>
          )}
        </div>
      )}

      {table?.lignes.length > 0 && (
        <div style={{ overflow: 'auto', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-lg)', maxHeight: '70vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={s.th}>Date</th>
                {table.postes.map(p => <th key={p} style={s.th}>{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {table.lignes.map(lg => (
                <tr key={lg.iso}>
                  <td style={s.td}>{lg.dateLabel}</td>
                  {table.postes.map(p => {
                    const cell = lg.parPoste?.[p]
                    return (
                      <td key={p} style={{ ...s.td, ...(cell?.estRemplacant ? { color: 'var(--color-danger)', fontWeight: 600 } : null) }}>
                        {cell?.texte ?? ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
