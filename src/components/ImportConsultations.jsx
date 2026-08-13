import { useState, useRef, useMemo, Fragment } from 'react'
import Papa from 'papaparse'
import {
  analyserCSV, detecterMappage, detecterFormat, reanalyserAvecNouvellesRegles,
  analyserStats, reanalyserStats, construireDetailImport, analyserEnTeteStats,
} from '../utils/importConsultations'
import { appliquerImport, cibles, reglesInitiales, getConsultData } from '../data/consultations'
import { charger, sauver } from '../utils/stockage'

const CLE_REGLES        = 'sarm:consult-regles'
const CLE_COLONNES      = 'sarm:consult-colonnes'

const MOIS_COURT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

const fmtNb = v => Math.round(v).toLocaleString('fr-FR')

// Écart « actuel → import » : vert si hausse, rouge si baisse, neutre si identique.
// `importe === null` = ligne absente de l'import : sa valeur actuelle sera CONSERVÉE telle quelle.
function Delta({ actuel, importe }) {
  if (importe === null || importe === undefined) {
    return <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>conservé</span>
  }
  const d = importe - actuel
  if (d === 0) return <span style={{ color: 'var(--color-text-tertiary)' }}>=</span>
  return (
    <span style={{ color: d > 0 ? '#085041' : '#A32D2D', fontWeight: 500 }}>
      {d > 0 ? '+' : '−'}{fmtNb(Math.abs(d))}
    </span>
  )
}

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
  // Agendas comptés : DÉTECTÉS, jamais saisis — { orientation, inclus, exclus } (règle SARM-1 + SARM-2).
  const [detectionStats, setDetectionStats] = useState(null)
  const [moisStats, setMoisStats] = useState(new Date().getMonth())
  const [anneeStats, setAnneeStats] = useState(new Date().getFullYear())
  const [configStats, setConfigStats] = useState(null) // sauvegardée pour la réanalyse
  const [ventilationOuverte, setVentilationOuverte] = useState(true)

  // Aperçu détaillé : comparaison de l'import avec ce qui est DÉJÀ en base, mois par mois
  // et praticien par praticien. Recalculé uniquement quand un nouveau résultat d'analyse arrive.
  const detail = useMemo(
    () => (resultats ? construireDetailImport(resultats.agrege, getConsultData()) : null),
    [resultats],
  )

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
        // Les agendas à compter sont une RÈGLE (SARM-1 + SARM-2), pas un choix : on les détecte,
        // quelle que soit l'orientation du tableau croisé, et on se contente de les afficher.
        setDetectionStats(analyserEnTeteStats(texte))
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
    // Aucune colonne à mémoriser : la règle SARM s'applique d'elle-même à chaque fichier.
    const cfg = { mois: moisStats, annee: anneeStats }
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

              {/* Agendas comptés — DÉTECTÉS (règle SARM-1 + SARM-2), rien à cocher */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 6, fontWeight: 500, letterSpacing: '0.04em' }}>
                  AGENDAS COMPTÉS — DÉTECTÉS AUTOMATIQUEMENT
                </div>

                {detectionStats?.inclus.length > 0 ? (
                  <>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {detectionStats.inclus.map(a => (
                        <span key={a} style={{
                          fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-md)',
                          border: '0.5px solid #1D9E75', background: '#E1F5EE', color: '#085041', fontWeight: 500,
                        }}>
                          ✓ {a}
                        </span>
                      ))}
                      {detectionStats.exclus.length > 0 && (
                        <>
                          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 2px' }}>· écartés :</span>
                          {detectionStats.exclus.map(a => (
                            <span key={a} style={{
                              fontSize: 11, padding: '4px 9px', borderRadius: 'var(--radius-md)',
                              border: '0.5px solid var(--color-border)', background: 'var(--color-bg)',
                              color: 'var(--color-text-tertiary)', textDecoration: 'line-through',
                            }}>
                              {a}
                            </span>
                          ))}
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
                      Agendas trouvés en {detectionStats.orientation === 'agendas-lignes' ? 'lignes' : 'colonnes'} —
                      le total sera la somme des agendas SARM, comme toujours.
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: '#712B13', background: '#FAECE7', border: '0.5px solid #F09595', borderRadius: 'var(--radius-md)', padding: '8px 10px' }}>
                    ⚠ <strong>Aucun agenda SARM trouvé dans ce fichier</strong>, ni en lignes ni en colonnes.
                    L'import ne compterait rien. Vérifiez qu'il s'agit bien de l'export « statistiques »
                    Doctolib incluant les agendas SARM-1 / SARM-2.
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
                disabled={!detectionStats?.inclus.length}
                style={{
                  fontSize: 12, padding: '7px 18px', borderRadius: 'var(--radius-md)',
                  border: '0.5px solid #1D9E75',
                  background: detectionStats?.inclus.length ? '#E1F5EE' : 'var(--color-bg)',
                  color: detectionStats?.inclus.length ? '#085041' : 'var(--color-text-tertiary)',
                  cursor: detectionStats?.inclus.length ? 'pointer' : 'default',
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
          {etape === 'apercu' && resultats && detail && (
            <div>
              <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--color-border)', fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>APERÇU AVANT IMPORT — {detail.mois.length} mois</span>
                {resultats.inclus?.length > 0 && (
                  <span style={{ fontSize: 10, background: '#E1F5EE', color: '#085041', padding: '2px 8px', borderRadius: 10, letterSpacing: 0, fontWeight: 400 }}>
                    agendas comptés : {resultats.inclus.join(' + ')}
                    {resultats.exclus?.length > 0 && ` · écartés : ${resultats.exclus.join(', ')}`}
                  </span>
                )}
              </div>

              {/* Avertissement : mois déjà remplis → l'import REMPLACE (il n'additionne pas) */}
              {detail.remplacements > 0 && (
                <div style={{ padding: '8px 16px', fontSize: 11, color: '#712B13', background: '#FAECE7', borderBottom: '0.5px solid var(--color-border)' }}>
                  ⚠ {detail.remplacements} mois {detail.remplacements > 1 ? 'contiennent' : 'contient'} déjà des
                  données : elles seront <strong>remplacées</strong> par celles du fichier (pas additionnées).
                </div>
              )}

              {/* ── Récap par mois : ce qui est en base vs ce qui sera écrit ── */}
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg)' }}>
                      {[
                        { h: 'Mois', a: 'left' }, { h: 'En base', a: 'right' }, { h: 'Import', a: 'right' },
                        { h: 'Écart', a: 'right' }, { h: 'dont téléconsult.', a: 'right' },
                      ].map(({ h, a }) => (
                        <th key={h} style={{ padding: '6px 16px', textAlign: a, fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.mois.map((row, i) => (
                      <tr key={`${row.annee}-${row.mois}`} style={{ borderTop: '0.5px solid var(--color-border)', background: i % 2 === 0 ? 'transparent' : 'var(--color-bg)' }}>
                        <td style={{ padding: '6px 16px', fontWeight: 500 }}>
                          {row.label}
                          {row.ancienTotal > 0 && (
                            <span style={{ fontSize: 9, background: '#FAECE7', color: '#712B13', padding: '1px 6px', borderRadius: 8, marginLeft: 6 }}>
                              remplacé
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '6px 16px', textAlign: 'right', color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                          {row.ancienTotal ? fmtNb(row.ancienTotal) : '—'}
                        </td>
                        <td style={{ padding: '6px 16px', textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtNb(row.total)}</td>
                        <td style={{ padding: '6px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          <Delta actuel={row.ancienTotal} importe={row.total} />
                        </td>
                        <td style={{ padding: '6px 16px', textAlign: 'right', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {row.tele ? fmtNb(row.tele) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Contrôle de cohérence : où vont les consultations importées ── */}
              <div style={{ padding: '10px 16px', borderTop: '0.5px solid var(--color-border)', display: 'flex', gap: 20, flexWrap: 'wrap', background: 'var(--color-bg)' }}>
                {[
                  { l: 'Total importé', v: detail.totalImport, fort: true },
                  { l: 'ventilé par praticien', v: detail.ventileImport },
                  { l: 'téléconsultations', v: detail.teleImport },
                  { l: 'non ventilé (global)', v: detail.nonVentile },
                ].map(({ l, v, fort }) => (
                  <div key={l}>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{l}</div>
                    <div style={{ fontSize: fort ? 15 : 13, fontWeight: 500, color: 'var(--color-text)' }}>{fmtNb(v)}</div>
                  </div>
                ))}
              </div>

              {/* ── Ventilation détaillée par spécialité / praticien ── */}
              <div style={{ borderTop: '0.5px solid var(--color-border)' }}>
                <button
                  onClick={() => setVentilationOuverte(o => !o)}
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: '9px 16px', border: 'none', background: 'transparent',
                    fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '0.04em',
                  }}
                >
                  {ventilationOuverte ? '▾' : '▸'} VENTILATION PAR PRATICIEN ({detail.groupes.length} spécialités)
                </button>

                {ventilationOuverte && (
                  <div style={{ maxHeight: 300, overflowY: 'auto', borderTop: '0.5px solid var(--color-border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                      <thead>
                        <tr style={{ background: 'var(--color-bg)' }}>
                          {[
                            { h: '', a: 'left' }, { h: 'En base', a: 'right' },
                            { h: 'Import', a: 'right' }, { h: 'Écart', a: 'right' },
                          ].map(({ h, a }, i) => (
                            <th key={i} style={{ padding: '5px 16px', textAlign: a, fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.groupes.map(g => (
                          <Fragment key={g.id}>
                            <tr style={{ borderTop: '0.5px solid var(--color-border)' }}>
                              <td style={{ padding: '6px 16px', fontWeight: 500 }}>
                                <span style={{ display: 'inline-block', width: 8, height: 8, background: g.couleur, borderRadius: 2, marginRight: 6 }} />
                                {g.nom}
                              </td>
                              <td style={{ padding: '6px 16px', textAlign: 'right', color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                                {g.actuel ? fmtNb(g.actuel) : '—'}
                              </td>
                              <td style={{ padding: '6px 16px', textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtNb(g.importe)}</td>
                              <td style={{ padding: '6px 16px', textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                                <Delta actuel={g.actuel} importe={g.importe} />
                              </td>
                            </tr>
                            {g.lignes.map(l => (
                              <tr key={l.id} style={{ borderTop: '0.5px solid var(--color-border)', opacity: l.importe === null ? 0.6 : 1 }}>
                                <td style={{ padding: '5px 16px 5px 34px', color: 'var(--color-text-secondary)', fontStyle: l.nonAttribue ? 'italic' : 'normal' }}>
                                  {l.nom}
                                  {l.masque && <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>masqué</span>}
                                </td>
                                <td style={{ padding: '5px 16px', textAlign: 'right', color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                                  {l.actuel ? fmtNb(l.actuel) : '—'}
                                </td>
                                <td style={{ padding: '5px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                  {l.importe === null ? '—' : fmtNb(l.importe)}
                                </td>
                                <td style={{ padding: '5px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                  <Delta actuel={l.actuel} importe={l.importe} />
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ padding: '8px 16px', fontSize: 10.5, color: 'var(--color-text-tertiary)', borderTop: '0.5px solid var(--color-border)' }}>
                      « conservé » = praticien absent du fichier : sa valeur actuelle pour ces mois n'est pas touchée.
                      Le total global reste le chiffre de référence — il n'a pas à égaler la somme du détail (cf. le dur / l'affiné).
                    </div>
                  </div>
                )}
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
                  disabled={detail.mois.length === 0}
                  style={{
                    fontSize: 12, padding: '7px 20px', borderRadius: 'var(--radius-md)',
                    border: '0.5px solid #1D9E75',
                    background: detail.mois.length > 0 ? '#E1F5EE' : 'var(--color-bg)',
                    color: detail.mois.length > 0 ? '#085041' : 'var(--color-text-tertiary)',
                    cursor: detail.mois.length > 0 ? 'pointer' : 'default',
                    fontWeight: 500,
                  }}
                >
                  ✓ Valider l'import ({fmtNb(detail.totalImport)} consult.)
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
