import { useState, useRef } from 'react'
import { analyserCSV, detecterMappage, reanalyserAvecNouvellesRegles } from '../utils/importConsultations'
import { appliquerImport, cibles } from '../data/consultations'
import { charger, sauver } from '../utils/stockage'

const CLE_REGLES  = 'sarm:consult-regles'
const CLE_COLONNES = 'sarm:consult-colonnes'

const MOIS_COURT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

// ─── Sélecteur de cible (spécialité / praticien / global / ignorer) ───────────
function SelecteurCible({ value, onChange }) {
  const [ouvert, setOuvert] = useState(false)
  const liste = cibles()

  // Regrouper par spécialité
  const groupes = []
  const vus = new Set()
  for (const c of liste) {
    if (c.type === 'praticien' && !vus.has(c.specId)) {
      vus.add(c.specId)
      groupes.push({ specId: c.specId, specNom: c.specNom, praticiens: liste.filter(x => x.specId === c.specId && x.type === 'praticien') })
    }
    if (c.type === 'specialite') groupes.push({ specId: c.specId, specNom: c.specNom, praticiens: [] })
  }

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

  return (
    <div style={{ position: 'relative' }}>
      <button style={boutonStyle} onClick={() => setOuvert(o => !o)}>
        <span>{label}</span>
        <span style={{ fontSize: 9 }}>▾</span>
      </button>
      {ouvert && (
        <>
          <div onClick={() => setOuvert(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 11,
            minWidth: 240, maxHeight: 300, overflowY: 'auto',
            background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: '0 6px 20px rgba(0,0,0,0.12)', padding: 4,
          }}>
            {/* Praticiens regroupés par spécialité */}
            {groupes.map(g => (
              <div key={g.specId}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', padding: '6px 10px 2px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {g.specNom}
                </div>
                {g.praticiens.length > 0
                  ? g.praticiens.map(p => (
                      <button key={p.id} onClick={() => { onChange(p.id); setOuvert(false) }}
                        style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontSize: 12, color: 'var(--color-text)', padding: '5px 10px 5px 20px', border: 'none', borderRadius: 6, background: value === p.id ? 'var(--color-primary-light)' : 'transparent' }}>
                        {p.pratNom}
                      </button>
                    ))
                  : (
                      <button onClick={() => { onChange(`spec:${g.specId}`); setOuvert(false) }}
                        style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontSize: 12, color: 'var(--color-text)', padding: '5px 10px 5px 20px', border: 'none', borderRadius: 6, background: value === `spec:${g.specId}` ? 'var(--color-primary-light)' : 'transparent' }}>
                        {g.specNom} (spécialité entière)
                      </button>
                    )
                }
              </div>
            ))}
            <div style={{ borderTop: '0.5px solid var(--color-border)', marginTop: 4, paddingTop: 4 }}>
              <button onClick={() => { onChange('global'); setOuvert(false) }}
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontSize: 12, color: 'var(--color-text)', padding: '5px 10px', border: 'none', borderRadius: 6, background: value === 'global' ? 'var(--color-primary-light)' : 'transparent' }}>
                Global / autre
              </button>
              <button onClick={() => { onChange('ignorer'); setOuvert(false) }}
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontSize: 12, color: '#A32D2D', padding: '5px 10px', border: 'none', borderRadius: 6, background: 'transparent' }}>
                Ignorer ces lignes
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function ImportConsultations({ onImportValide }) {
  const [ouvert, setOuvert] = useState(false)
  const [reglesPanneauOuvert, setReglesPanneauOuvert] = useState(false)
  const [etape, setEtape] = useState('depot')   // 'depot' | 'mappage' | 'classement' | 'apercu'
  const [texteCSV, setTexteCSV] = useState(null)
  const [headers, setHeaders] = useState([])
  const [mappage, setMappage] = useState(() => charger(CLE_COLONNES, {}))
  const [resultats, setResultats] = useState(null)   // { agrege, fileAttente, apercu }
  const [selections, setSelections] = useState({})   // { cle: cibleId }
  const [regles, setRegles] = useState(() => charger(CLE_REGLES, []))
  const [drag, setDrag] = useState(false)
  const fileRef = useRef()

  const sauverRegles = (r) => { setRegles(r); sauver(CLE_REGLES, r) }

  // ── Lecture du fichier ──
  const lireCSV = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const texte = e.target.result
      setTexteCSV(texte)
      // Détection rapide des en-têtes (1ère ligne)
      const premiereSep = texte.includes(';') ? ';' : ','
      const premiereLigne = texte.split('\n')[0]
      const hdrs = premiereLigne.split(premiereSep).map(h => h.trim().replace(/^"|"$/g, ''))
      setHeaders(hdrs)
      const detected = detecterMappage(hdrs)
      // Conserver le mappage mémorisé si les colonnes correspondent, sinon détection fraîche
      const memoMappage = charger(CLE_COLONNES, {})
      const memoValide = Object.values(memoMappage).every(v => !v || hdrs.includes(v))
      setMappage(memoValide && Object.keys(memoMappage).length > 0 ? memoMappage : detected)
      setEtape('mappage')
    }
    reader.readAsText(file, 'UTF-8')
  }

  // ── Lancement de l'analyse ──
  const lancer = () => {
    sauver(CLE_COLONNES, mappage)
    const r = analyserCSV(texteCSV, mappage, regles)
    setResultats(r)
    setSelections({})
    setEtape(r.fileAttente.length > 0 ? 'classement' : 'apercu')
  }

  // ── Classement d'une clé inconnue ──
  const validerClassements = () => {
    const nouvellesRegles = Object.entries(selections).map(([cle, cibleId]) => {
      if (cibleId === 'ignorer') return { cle, action: 'ignorer' }
      if (cibleId === 'global') return { cle, action: 'global' }
      if (cibleId.startsWith('spec:')) return { cle, action: 'specialite', specId: cibleId.replace('spec:', '') }
      // praticien : id = `prat:specId:pratId`
      const parts = cibleId.split(':')
      return { cle, action: 'praticien', specId: parts[1], pratId: parts[2] }
    })
    const toutesRegles = [...regles, ...nouvellesRegles]
    sauverRegles(toutesRegles)
    const r = reanalyserAvecNouvellesRegles(texteCSV, mappage, toutesRegles, [])
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

  const supprimerRegle = (cle) => sauverRegles(regles.filter(r => r.cle !== cle))

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
            RÈGLES DE CORRECTION MÉMORISÉES
          </div>
          {regles.map((r, i) => (
            <div key={r.cle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: i < regles.length - 1 ? '0.5px solid var(--color-border)' : 'none', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{r.cle}</div>
              <div style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: r.action === 'ignorer' ? '#F1EFE8' : 'var(--color-primary-light)', color: r.action === 'ignorer' ? 'var(--color-text-tertiary)' : 'var(--color-primary-dark)' }}>
                {r.action === 'ignorer' ? 'Ignoré'
                  : r.action === 'global' ? 'Global / autre'
                  : r.action === 'praticien' ? `Praticien · ${r.pratId}`
                  : `Spécialité · ${r.specId}`}
              </div>
              <button onClick={() => supprimerRegle(r.cle)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-md)', border: '0.5px solid #F09595', background: 'transparent', color: '#A32D2D', cursor: 'pointer' }}>
                Supprimer
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Panneau d'import ── */}
      {ouvert && (
        <div style={{ ...cardStyle, marginTop: 8 }}>

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

          {/* ÉTAPE 2 : mappage des colonnes */}
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
                      {item.count} RDV · ex. {MOIS_COURT[item.exemples[0]?.mois]} {item.exemples[0]?.annee}
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
                  ✓ Valider l'import ({resultats.apercu.reduce((a, r) => a + r.total, 0)} RDV)
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
