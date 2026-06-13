import { useState, useRef } from 'react'
import Papa from 'papaparse'
import {
  analyserCSV, detecterMappage, detecterFormat, reanalyserAvecNouvellesRegles,
  analyserStats, reanalyserStats,
} from '../utils/importConsultations'
import { appliquerImport, cibles, reglesInitiales } from '../data/consultations'
import { charger, sauver } from '../utils/stockage'

const CLE_REGLES        = 'sarm:consult-regles'
const CLE_COLONNES      = 'sarm:consult-colonnes'
const CLE_COLONNES_STATS = 'sarm:consult-colonnes-stats'

const MOIS_COURT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

// ─── Sélecteur de cible (spécialité / praticien / global / ignorer) ───────────
function SelecteurCible({ value, onChange }) {
  const [ouvert, setOuvert] = useState(false)
  const [filtre, setFiltre] = useState('')
  const liste = cibles()

  // Normalisation simple pour le filtre (sans accents, minuscules)
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const filtreNorm = norm(filtre)

  // Regrouper par spécialité en tenant compte du filtre
  const groupes = []
  const vus = new Set()
  for (const c of liste) {
    if ((c.type === 'praticien' || c.type === 'specialite-autre') && !vus.has(c.specId)) {
      vus.add(c.specId)
      const praticiens = liste.filter(x => x.specId === c.specId && x.type === 'praticien')
      const nonAttribue = liste.find(x => x.specId === c.specId && x.type === 'specialite-autre')
      groupes.push({ specId: c.specId, specNom: c.specNom, praticiens, nonAttribue })
    }
    if (c.type === 'specialite') groupes.push({ specId: c.specId, specNom: c.specNom, praticiens: [], nonAttribue: null })
  }

  // Filtrage par saisie (filtre sur nom praticien ou nom spécialité)
  const groupesFiltres = filtre
    ? groupes.map(g => ({
        ...g,
        praticiens: g.praticiens.filter(p => norm(p.pratNom).includes(filtreNorm) || norm(g.specNom).includes(filtreNorm)),
        nonAttribue: norm(g.specNom).includes(filtreNorm) ? g.nonAttribue : null,
      })).filter(g => g.praticiens.length > 0 || g.nonAttribue || norm(g.specNom).includes(filtreNorm))
    : groupes

  const label = value
    ? (liste.find(c => c.id === value)?.label || value)
    : '— Choisir —'

  const boutonStyle = {
    fontSize: 11, padding: '4px 8px',
    borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: value ? 'var(--color-text)' : 'var(--color-text-tertiary)',
    cursor: 'pointer', minWidth: 200, textAlign: 'left',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  }

  const itemStyle = (sel) => ({
    width: '100%', textAlign: 'left', cursor: 'pointer', fontSize: 12,
    color: 'var(--color-text)', padding: '5px 10px 5px 20px',
    border: 'none', borderRadius: 6,
    background: sel ? 'var(--color-primary-light)' : 'transparent',
  })

  return (
    <div style={{ position: 'relative' }}>
      <button style={boutonStyle} onClick={() => { setOuvert(o => !o); setFiltre('') }}>
        <span>{label}</span>
        <span style={{ fontSize: 9 }}>▾</span>
      </button>
      {ouvert && (
        <>
          <div onClick={() => setOuvert(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 11,
            minWidth: 260,
            background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Champ filtre */}
            <div style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--color-border)' }}>
              <input
                autoFocus
                value={filtre}
                onChange={e => setFiltre(e.target.value)}
                placeholder="Filtrer…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  fontSize: 11, padding: '4px 8px',
                  borderRadius: 'var(--radius-md)',
                  border: '0.5px solid var(--color-border)',
                  background: 'var(--color-bg)', color: 'var(--color-text)',
                }}
              />
            </div>

            {/* Liste avec scroll interne */}
            <div style={{ maxHeight: 280, overflowY: 'auto', padding: 4 }}>
              {groupesFiltres.map(g => (
                <div key={g.specId}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', padding: '6px 10px 2px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {g.specNom}
                  </div>
                  {g.praticiens.length > 0
                    ? g.praticiens.map(p => (
                        <button key={p.id} onClick={() => { onChange(p.id); setOuvert(false) }} style={itemStyle(value === p.id)}>
                          {p.pratNom}
                        </button>
                      ))
                    : null
                  }
                  {/* Spécialité sans praticiens → toute la spécialité */}
                  {g.praticiens.length === 0 && !g.nonAttribue && (
                    <button onClick={() => { onChange(`spec:${g.specId}`); setOuvert(false) }} style={itemStyle(value === `spec:${g.specId}`)}>
                      {g.specNom} (spécialité entière)
                    </button>
                  )}
                  {/* Bouton « Non attribué » pour les spécialités à praticiens */}
                  {g.nonAttribue && (
                    <button onClick={() => { onChange(`spec:${g.specId}`); setOuvert(false) }}
                      style={{ ...itemStyle(value === `spec:${g.specId}`), color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                      Non attribué
                    </button>
                  )}
                </div>
              ))}

              {/* Section bas : téléconsultation / global / ignorer */}
              <div style={{ borderTop: '0.5px solid var(--color-border)', marginTop: 4, paddingTop: 4 }}>
                <button onClick={() => { onChange('teleconsult'); setOuvert(false) }}
                  style={{ ...itemStyle(value === 'teleconsult'), paddingLeft: 10, color: '#534AB7' }}>
                  📹 Téléconsultation
                </button>
                <button onClick={() => { onChange('global'); setOuvert(false) }}
                  style={{ ...itemStyle(value === 'global'), paddingLeft: 10 }}>
                  Global / autre
                </button>
                <button onClick={() => { onChange('ignorer'); setOuvert(false) }}
                  style={{ ...itemStyle(false), paddingLeft: 10, color: '#A32D2D' }}>
                  Ignorer ces lignes
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const MOIS_NOMS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const ANNEES_IMPORT = [2022, 2023, 2024, 2025, 2026]

// ─── Composant principal ──────────────────────────────────────────────────────
export default function ImportConsultations({ onImportValide }) {
  const [ouvert, setOuvert] = useState(false)
  const [reglesPanneauOuvert, setReglesPanneauOuvert] = useState(false)
  const [etape, setEtape] = useState('depot')   // 'depot' | 'mappage' | 'stats' | 'classement' | 'apercu'
  const [texteCSV, setTexteCSV] = useState(null)
  const [headers, setHeaders] = useState([])
  const [mappage, setMappage] = useState(() => charger(CLE_COLONNES, {}))
  const [resultats, setResultats] = useState(null)   // { agrege, fileAttente, apercu }
  const [selections, setSelections] = useState({})   // { cle: cibleId }
  // reglesInitiales() = REGLES_DEFAUT + règles utilisateur persistées (utilisateur prioritaire)
  const [regles, setRegles] = useState(() => reglesInitiales())
  const [drag, setDrag] = useState(false)
  const fileRef = useRef()

  // ── États mode statistiques ──
  const [format, setFormat] = useState(null)           // 'rdv' | 'stats'
  const [colonnesAgenda, setColonnesAgenda] = useState([])    // toutes les colonnes agenda du CSV
  const [colonnesSelectionnees, setColonnesSelectionnees] = useState(() => charger(CLE_COLONNES_STATS, null))
  const [moisStats, setMoisStats] = useState(new Date().getMonth())
  const [anneeStats, setAnneeStats] = useState(new Date().getFullYear())
  const [configStats, setConfigStats] = useState(null) // sauvegardée pour la réanalyse

  // sauverRegles : ne persiste QUE les règles utilisateur (pas les défauts),
  // puis recharge l'ensemble (défauts + utilisateur) pour l'état local
  const sauverRegles = (reglesUtilisateur) => {
    sauver(CLE_REGLES, reglesUtilisateur)
    setRegles(reglesInitiales()) // recharge la fusion complète
  }

  // ── Lecture du fichier ──
  const lireCSV = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      // Décodage avec repli Windows-1252 (export Doctolib) si UTF-8 produit des caractères de remplacement
      const buf = e.target.result
      let texte = new TextDecoder('utf-8', { fatal: false }).decode(buf)
      if (texte.includes('�')) texte = new TextDecoder('windows-1252').decode(buf)

      setTexteCSV(texte)

      // Détection rapide des en-têtes (1ère ligne)
      const premiereSep = texte.includes(';') ? ';' : ','
      const premiereLigne = texte.split('\n')[0]
      const hdrs = premiereLigne.split(premiereSep).map(h => h.trim().replace(/^"|"$/g, ''))
      setHeaders(hdrs)

      // Preview des premières lignes pour la détection de format
      const lignesPreview = Papa.parse(texte, {
        header: true, preview: 5, delimiter: premiereSep, skipEmptyLines: true,
      }).data
      const fmt = detecterFormat(hdrs, lignesPreview)
      setFormat(fmt)

      if (fmt === 'stats') {
        // Mode statistiques : colonnes agenda = toutes sauf la première (libellé)
        const cols = hdrs.slice(1).filter(h => h.trim())
        setColonnesAgenda(cols)
        // Colonnes sélectionnées : mémorisées (si valides) ou par défaut = celles contenant « SARM »
        const memo = charger(CLE_COLONNES_STATS, null)
        if (memo && Array.isArray(memo) && memo.every(c => cols.includes(c))) {
          setColonnesSelectionnees(memo)
        } else {
          setColonnesSelectionnees(cols.filter(c => c.toUpperCase().includes('SARM')))
        }
        setEtape('stats')
      } else {
        // Mode RDV : mappage des colonnes
        const detected = detecterMappage(hdrs)
        const memoMappage = charger(CLE_COLONNES, {})
        const memoValide = Object.values(memoMappage).every(v => !v || hdrs.includes(v))
        setMappage(memoValide && Object.keys(memoMappage).length > 0 ? memoMappage : detected)
        setEtape('mappage')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // ── Lancement de l'analyse (mode RDV) ──
  const lancer = () => {
    sauver(CLE_COLONNES, mappage)
    const r = analyserCSV(texteCSV, mappage, regles)
    setResultats(r)
    setSelections({})
    setEtape(r.fileAttente.length > 0 ? 'classement' : 'apercu')
  }

  // ── Lancement de l'analyse (mode statistiques) ──
  const lancerStats = () => {
    sauver(CLE_COLONNES_STATS, colonnesSelectionnees)
    const cfg = { colonnesGardees: colonnesSelectionnees, mois: moisStats, annee: anneeStats }
    setConfigStats(cfg)
    const r = analyserStats(texteCSV, cfg, regles)
    setResultats(r)
    setSelections({})
    setEtape(r.fileAttente.length > 0 ? 'classement' : 'apercu')
  }

  // ── Classement d'une clé inconnue ──
  const validerClassements = () => {
    const nouvellesRegles = Object.entries(selections).map(([cle, cibleId]) => {
      if (cibleId === 'ignorer')    return { cle, action: 'ignorer' }
      if (cibleId === 'global')     return { cle, action: 'global' }
      if (cibleId === 'teleconsult') return { cle, action: 'teleconsult' }
      if (cibleId.startsWith('spec:')) return { cle, action: 'specialite', specId: cibleId.replace('spec:', '') }
      // praticien : id = `prat:specId:pratId`
      const parts = cibleId.split(':')
      return { cle, action: 'praticien', specId: parts[1], pratId: parts[2] }
    })
    // On ne persiste que les nouvelles règles utilisateur (sauverRegles recharge la fusion)
    const reglesUtilisateur = [...charger(CLE_REGLES, []), ...nouvellesRegles]
    sauverRegles(reglesUtilisateur)
    const toutesRegles = reglesInitiales()
    // Réanalyse selon le format détecté
    const r = format === 'stats'
      ? reanalyserStats(texteCSV, configStats, toutesRegles, [])
      : reanalyserAvecNouvellesRegles(texteCSV, mappage, toutesRegles, [])
    setResultats(r)
    setEtape('apercu')
  }

  // ── Validation finale ──
  const validerImport = () => {
    appliquerImport(resultats.agrege)
    setOuvert(false)
    setEtape('depot')
    setTexteCSV(null)
    setResultats(null)
    onImportValide?.()
  }

  // Suppression : ne retire que des règles utilisateur persistées (jamais les défauts)
  const supprimerRegle = (cle) => {
    const reglesUtilisateur = charger(CLE_REGLES, []).filter(r => r.cle !== cle)
    sauverRegles(reglesUtilisateur)
  }

  // ── Styles partagés ──
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }
  const selectStyle = { fontSize: 11, padding: '4px 6px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }

  const nbInconnus = resultats?.fileAttente?.filter(f => !selections[f.cle]).length ?? 0

  return (
    <div style={{ marginBottom: 4 }}>
      {/* ── Bouton principal + panneau règles ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => { setOuvert(o => !o); setEtape('depot') }}
          style={{
            fontSize: 11, padding: '5px 12px',
            borderRadius: 'var(--radius-md)',
            border: '0.5px solid var(--color-border)',
            background: ouvert ? 'var(--color-primary-light)' : 'var(--color-surface)',
            color: ouvert ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ⬆ Importer un CSV Doctolib
        </button>
        {regles.length > 0 && (
          <button
            onClick={() => setReglesPanneauOuvert(o => !o)}
            style={{
              fontSize: 11, padding: '5px 12px',
              borderRadius: 'var(--radius-md)',
              border: '0.5px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-secondary)', cursor: 'pointer',
            }}
          >
            🏷 Règles de correction ({regles.length})
          </button>
        )}
      </div>

      {/* ── Panneau règles mémorisées ── */}
      {reglesPanneauOuvert && (
        <div style={{ ...cardStyle, marginTop: 8 }}>
          <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--color-border)', fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>
            RÈGLES DE CORRECTION ({regles.length} — dont {charger(CLE_REGLES, []).length} personnalisées)
          </div>
          {regles.map((r, i) => {
            const estUtilisateur = charger(CLE_REGLES, []).some(ru => ru.cle === r.cle)
            return (
              <div key={r.cle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: i < regles.length - 1 ? '0.5px solid var(--color-border)' : 'none', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{r.cle}</div>
                <div style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: r.action === 'ignorer' ? '#F1EFE8' : 'var(--color-primary-light)', color: r.action === 'ignorer' ? 'var(--color-text-tertiary)' : 'var(--color-primary-dark)' }}>
                  {r.action === 'ignorer' ? 'Ignoré'
                    : r.action === 'global' ? 'Global / autre'
                    : r.action === 'praticien' ? `${r.pratId}`
                    : `${r.specId}`}
                </div>
                {estUtilisateur
                  ? <button onClick={() => supprimerRegle(r.cle)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-md)', border: '0.5px solid #F09595', background: 'transparent', color: '#A32D2D', cursor: 'pointer' }}>Supprimer</button>
                  : <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', padding: '3px 6px' }}>par défaut</span>
                }
              </div>
            )
          })}
        </div>
      )}

      {/* ── Panneau d'import ── */}
      {ouvert && (
        <div style={{ ...cardStyle, marginTop: 8, overflow: 'visible' }}>

          {/* ÉTAPE 1 : dépôt du fichier */}
          {etape === 'depot' && (
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) lireCSV(f) }}
              style={{
                padding: '32px 20px', textAlign: 'center',
                border: `2px dashed ${drag ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: drag ? 'var(--color-primary-light)' : 'transparent',
                cursor: 'pointer', borderRadius: 'var(--radius-md)',
                transition: 'all 0.15s',
              }}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>Glisser un CSV Doctolib ici</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>ou cliquer pour parcourir</div>
              <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) lireCSV(e.target.files[0]) }} />
            </div>
          )}

          {/* ÉTAPE 2-stats : configuration de l'import statistiques */}
          {etape === 'stats' && (
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>
                  Format statistiques Doctolib détecté
                </span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}>
                  tableau croisé
                </span>
              </div>

              {/* Sélection des colonnes (agendas) */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 6, fontWeight: 500, letterSpacing: '0.04em' }}>
                  AGENDAS À INCLURE
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {colonnesAgenda.map(col => {
                    const cochee = colonnesSelectionnees?.includes(col)
                    return (
                      <label
                        key={col}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: 12, cursor: 'pointer',
                          padding: '5px 10px', borderRadius: 'var(--radius-md)',
                          border: `0.5px solid ${cochee ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          background: cochee ? 'var(--color-primary-light)' : 'var(--color-surface)',
                          color: cochee ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
                          transition: 'all 0.15s',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={cochee}
                          style={{ accentColor: 'var(--color-primary)' }}
                          onChange={e => {
                            setColonnesSelectionnees(prev => {
                              const base = prev || []
                              return e.target.checked ? [...base, col] : base.filter(c => c !== col)
                            })
                          }}
                        />
                        {col}
                      </label>
                    )
                  })}
                </div>
                {(!colonnesSelectionnees || colonnesSelectionnees.length === 0) && (
                  <div style={{ fontSize: 11, color: '#D85A30', marginTop: 6 }}>
                    ⚠ Sélectionnez au moins un agenda.
                  </div>
                )}
              </div>

              {/* Sélection du mois + année */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 6, fontWeight: 500, letterSpacing: '0.04em' }}>
                  PÉRIODE DU FICHIER (mois unique)
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <select
                    style={selectStyle}
                    value={moisStats}
                    onChange={e => setMoisStats(Number(e.target.value))}
                  >
                    {MOIS_NOMS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                  <select
                    style={selectStyle}
                    value={anneeStats}
                    onChange={e => setAnneeStats(Number(e.target.value))}
                  >
                    {ANNEES_IMPORT.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                  Les totaux seront enregistrés pour {MOIS_NOMS[moisStats]} {anneeStats}.
                </div>
              </div>

              <button
                onClick={lancerStats}
                disabled={!colonnesSelectionnees || colonnesSelectionnees.length === 0}
                style={{
                  fontSize: 12, padding: '7px 18px', borderRadius: 'var(--radius-md)',
                  border: '0.5px solid #1D9E75',
                  background: (colonnesSelectionnees?.length > 0) ? '#E1F5EE' : 'var(--color-bg)',
                  color: (colonnesSelectionnees?.length > 0) ? '#085041' : 'var(--color-text-tertiary)',
                  cursor: (colonnesSelectionnees?.length > 0) ? 'pointer' : 'default',
                }}
              >
                Analyser le fichier →
              </button>
            </div>
          )}

          {/* ÉTAPE 2-rdv : mappage des colonnes */}
          {etape === 'mappage' && (
            <div style={{ padding: '16px' }}>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 12, color: 'var(--color-text)' }}>
                Vérifiez le mappage des colonnes détectées
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { champ: 'date', label: 'Colonne Date *' },
                  { champ: 'praticien', label: 'Colonne Praticien *' },
                  { champ: 'statut', label: 'Colonne Statut (RDV honoré)' },
                  { champ: 'motif', label: 'Colonne Motif / Type' },
                  { champ: 'typeTeleconsult', label: 'Colonne Téléconsultation' },
                ].map(({ champ, label }) => (
                  <div key={champ}>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{label}</div>
                    <select
                      style={selectStyle}
                      value={mappage[champ] || ''}
                      onChange={e => setMappage(p => ({ ...p, [champ]: e.target.value || null }))}
                    >
                      <option value="">(aucune)</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {!mappage.date && (
                <div style={{ fontSize: 11, color: '#D85A30', marginBottom: 8 }}>
                  ⚠ La colonne Date est obligatoire.
                </div>
              )}
              <button
                onClick={lancer}
                disabled={!mappage.date}
                style={{
                  fontSize: 12, padding: '7px 18px', borderRadius: 'var(--radius-md)',
                  border: '0.5px solid #1D9E75',
                  background: mappage.date ? '#E1F5EE' : 'var(--color-bg)',
                  color: mappage.date ? '#085041' : 'var(--color-text-tertiary)',
                  cursor: mappage.date ? 'pointer' : 'default',
                }}
              >
                Analyser le fichier →
              </button>
            </div>
          )}

          {/* ÉTAPE 3 : classement des clés inconnues */}
          {etape === 'classement' && resultats && (
            <div>
              <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>
                  FILE D'ATTENTE — {resultats.fileAttente.length} clé{resultats.fileAttente.length > 1 ? 's' : ''} inconnue{resultats.fileAttente.length > 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 10, background: '#FAECE7', color: '#712B13', padding: '2px 8px', borderRadius: 10 }}>
                  à classer une fois → mémorisé pour toujours
                </span>
              </div>
              {resultats.fileAttente.map((item, idx) => (
                <div key={item.cle} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: idx < resultats.fileAttente.length - 1 ? '0.5px solid var(--color-border)' : 'none', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{item.cle}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                      {item.count} consult. · {MOIS_COURT[item.exemples[0]?.mois]} {item.exemples[0]?.annee}
                    </div>
                  </div>
                  <SelecteurCible
                    value={selections[item.cle] || ''}
                    onChange={v => setSelections(p => ({ ...p, [item.cle]: v }))}
                  />
                </div>
              ))}
              <div style={{ padding: '10px 16px', borderTop: '0.5px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={validerClassements}
                  disabled={nbInconnus > 0}
                  style={{
                    fontSize: 12, padding: '7px 18px', borderRadius: 'var(--radius-md)',
                    border: '0.5px solid #1D9E75',
                    background: nbInconnus === 0 ? '#E1F5EE' : 'var(--color-bg)',
                    color: nbInconnus === 0 ? '#085041' : 'var(--color-text-tertiary)',
                    cursor: nbInconnus === 0 ? 'pointer' : 'default',
                  }}
                >
                  {nbInconnus > 0 ? `${nbInconnus} clé${nbInconnus > 1 ? 's' : ''} restante${nbInconnus > 1 ? 's' : ''}` : 'Mémoriser et continuer →'}
                </button>
              </div>
            </div>
          )}

          {/* ÉTAPE 4 : aperçu et validation */}
          {etape === 'apercu' && resultats && (
            <div>
              <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--color-border)', fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>
                APERÇU — {resultats.apercu.length} mois détectés
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg)' }}>
                      {['Mois', 'Total RDV', 'dont Téléconsult.'].map(h => (
                        <th key={h} style={{ padding: '6px 16px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultats.apercu.map((row, i) => (
                      <tr key={`${row.annee}-${row.mois}`} style={{ borderTop: '0.5px solid var(--color-border)', background: i % 2 === 0 ? 'transparent' : 'var(--color-bg)' }}>
                        <td style={{ padding: '6px 16px', fontWeight: 500 }}>{row.label}</td>
                        <td style={{ padding: '6px 16px' }}>{row.total}</td>
                        <td style={{ padding: '6px 16px', color: 'var(--color-text-secondary)' }}>{row.tele || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {resultats.erreursParsing?.length > 0 && (
                <div style={{ padding: '8px 16px', fontSize: 11, color: '#712B13', background: '#FAECE7', borderTop: '0.5px solid var(--color-border)' }}>
                  ⚠ {resultats.erreursParsing.length} erreur(s) de parsing — certaines lignes ont été ignorées.
                </div>
              )}
              <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button onClick={() => setEtape('depot')} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                  ← Recommencer
                </button>
                <button
                  onClick={validerImport}
                  disabled={resultats.apercu.length === 0}
                  style={{
                    fontSize: 12, padding: '7px 20px', borderRadius: 'var(--radius-md)',
                    border: '0.5px solid #1D9E75',
                    background: resultats.apercu.length > 0 ? '#E1F5EE' : 'var(--color-bg)',
                    color: resultats.apercu.length > 0 ? '#085041' : 'var(--color-text-tertiary)',
                    cursor: resultats.apercu.length > 0 ? 'pointer' : 'default',
                    fontWeight: 500,
                  }}
                >
                  ✓ Valider l'import ({resultats.apercu.reduce((a, r) => a + r.total, 0)} consult.)
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
