import { useState, useCallback } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import ImportConsultations from '../components/ImportConsultations'
import GestionPraticiens from '../components/GestionPraticiens'
import { getConsultData } from '../data/consultations'
import { MOIS_COURT, ANNEES, sum, diffLabel, diffColor, MOIS_ACTUEL } from '../data/mockData'

const fmtNb = v => Math.round(v).toLocaleString('fr-FR')
const PALETTE = ['#534AB7', '#1D9E75', '#EF9F27', '#D85A30', '#7A8B99']

// Tableau mensuel d'une spécialité : somme des praticiens + bucket valeurs (consultations non attribuées)
const specMensuel = (sp, year) => {
  if (!sp.praticiens) return (sp.valeurs || {})[year] || Array(12).fill(0)
  const pratPart = Array.from({ length: 12 }, (_, m) =>
    sum(sp.praticiens.map(p => (p.valeurs[year] || [])[m] ?? 0))
  )
  const valPart = (sp.valeurs || {})[year] || Array(12).fill(0)
  return Array.from({ length: 12 }, (_, m) => pratPart[m] + (valPart[m] || 0))
}

export default function Consultations() {
  const [consultData, setConsultData] = useState(() => getConsultData())
  const { global: CONSULTATIONS, teleconsultations: TELECONSULTATIONS, specialites: CONSULT_SPECIALITES } = consultData

  const rafraichir = useCallback(() => setConsultData(getConsultData()), [])

  const [moisDe, setMoisDe] = useState(0)
  const [moisA, setMoisA] = useState(11)
  const [year1, setYear1] = useState(2024)
  const [year2, setYear2] = useState(2023)
  const [shortcut, setShortcut] = useState('annee')
  const [specId, setSpecId] = useState(CONSULT_SPECIALITES[0].id)
  const [pratId, setPratId] = useState('all')

  // Années disponibles : union de ANNEES (mock) et des années présentes dans le store
  const anneesDispos = [...new Set([...ANNEES, ...Object.keys(CONSULTATIONS).map(Number)])].sort((a, b) => b - a)

  const de = Math.min(moisDe, moisA)
  const a = Math.max(moisDe, moisA)

  const d1 = (CONSULTATIONS[year1] || CONSULTATIONS[2024]).slice(de, a + 1)
  const d2 = (CONSULTATIONS[year2] || CONSULTATIONS[2023]).slice(de, a + 1)
  const labels = MOIS_COURT.slice(de, a + 1)
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]

  const t1 = sum(d1), t2 = sum(d2)
  const all1 = CONSULTATIONS[year1] || CONSULTATIONS[2024]
  const cumulAujourdhui = sum(all1.slice(0, MOIS_ACTUEL + 1))
  const moyenne = d1.length ? t1 / d1.length : 0

  const tc1 = sum((TELECONSULTATIONS[year1] || []).slice(de, a + 1))
  const tc2 = sum((TELECONSULTATIONS[year2] || []).slice(de, a + 1))
  const partTele = t1 ? Math.round(tc1 / t1 * 100) : 0

  const dataBar = labels.map((m, i) => ({ mois: m, [year1]: d1[i], [year2]: d2[i] }))
  const dataCumul = labels.map((m, i) => ({
    mois: m,
    [year1]: sum(d1.slice(0, i + 1)),
    [year2]: sum(d2.slice(0, i + 1)),
  }))

  // Spécialité sélectionnée
  const spec = CONSULT_SPECIALITES.find(s => s.id === specId) || CONSULT_SPECIALITES[0]
  const specSerie1 = specMensuel(spec, year1).slice(de, a + 1)
  const specSerie2 = specMensuel(spec, year2).slice(de, a + 1)
  const specT1 = sum(specSerie1), specT2 = sum(specSerie2)

  // Praticiens visibles (non masqués) pour le détail — les masqués restent dans les totaux via specMensuel
  const hasPrat = !!spec.praticiens
  const pratsVisibles = hasPrat ? spec.praticiens.filter(p => !p.masque) : []

  // Garde-fou : si le praticien sélectionné est masqué, retomber sur "tous"
  const pratEffectif = hasPrat && pratId !== 'all' && pratsVisibles.some(p => p.id === pratId) ? pratId : 'all'
  const prat = hasPrat ? pratsVisibles.find(p => p.id === pratEffectif) : null
  const pratIndex = prat ? pratsVisibles.findIndex(p => p.id === prat.id) : -1
  const isAllPrat = hasPrat && !prat

  // Série « année vs année » active (spécialité entière sans praticiens, OU un praticien isolé)
  const aColor = prat ? PALETTE[pratIndex % PALETTE.length] : spec.couleur
  const aSerie1 = prat ? (prat.valeurs[year1] || []).slice(de, a + 1) : specSerie1
  const aSerie2 = prat ? (prat.valeurs[year2] || []).slice(de, a + 1) : specSerie2
  const aT1 = sum(aSerie1), aT2 = sum(aSerie2)

  const aBar = labels.map((m, i) => ({ mois: m, [year1]: aSerie1[i], [year2]: aSerie2[i] }))
  const aCumul = labels.map((m, i) => ({
    mois: m,
    [year1]: sum(aSerie1.slice(0, i + 1)),
    [year2]: sum(aSerie2.slice(0, i + 1)),
  }))

  // Bucket « non attribué » : consultations au niveau spécialité (ex. fibro gastro, pneumo)
  const autreValues = hasPrat && spec.valeurs ? (spec.valeurs[year1] || Array(12).fill(0)) : null
  const hasAutre = !!autreValues && autreValues.some(v => v > 0)

  // Données « Tous les praticiens » : empilé (mensuel y1) + multi-lignes (cumul y1)
  // On n'itère que sur les praticiens visibles (non masqués) pour les graphiques de détail
  const pratBar = isAllPrat ? labels.map((m, i) => {
    const row = { mois: m }
    pratsVisibles.forEach(p => { row[p.id] = (p.valeurs[year1] || [])[de + i] ?? 0 })
    if (hasAutre) row['__autre'] = autreValues[de + i] ?? 0
    return row
  }) : []
  const pratCumul = isAllPrat ? labels.map((m, i) => {
    const row = { mois: m }
    pratsVisibles.forEach(p => { row[p.id] = sum((p.valeurs[year1] || []).slice(de, de + i + 1)) })
    if (hasAutre) row['__autre'] = sum(autreValues.slice(de, de + i + 1))
    return row
  }) : []

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }
  const pillBase = {
    fontSize: 11, padding: '4px 12px', borderRadius: 16,
    border: '0.5px solid var(--color-border)', background: 'var(--color-surface)',
    color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
  }
  const pillActive = { ...pillBase, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', borderColor: 'var(--color-primary)', fontWeight: 500 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Consultations</h1>
        <span style={{
          fontSize: 11, background: 'var(--color-primary-light)',
          color: 'var(--color-primary-dark)', padding: '3px 10px',
          borderRadius: 20, fontWeight: 500
        }}>Activité · nombre</span>
      </div>

      <ImportConsultations onImportValide={rafraichir} />

      <PeriodeFilter
        moisDe={moisDe} setMoisDe={setMoisDe}
        moisA={moisA} setMoisA={setMoisA}
        year1={year1} setYear1={setYear1}
        year2={year2} setYear2={setYear2}
        shortcut={shortcut} setShortcut={setShortcut}
        availableYears={anneesDispos}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        <KpiCard label={`Consultations · ${year1}`} value={fmtNb(t1)} sub={periode} subColor="neutral" />
        <KpiCard label={`Consultations · ${year2}`} value={fmtNb(t2)} sub={diffLabel(t1, t2, year2)} subColor={diffColor(t1, t2)} />
        <KpiCard label={`Téléconsultations · ${year1}`} value={fmtNb(tc1)} sub={`${partTele} % · ${diffLabel(tc1, tc2, year2)}`} subColor="neutral" />
        <KpiCard label="Cumul à ce jour" value={fmtNb(cumulAujourdhui)} sub={`Jan → ${MOIS_COURT[MOIS_ACTUEL]} ${year1}`} subColor="neutral" />
        <KpiCard label="Moyenne mensuelle" value={fmtNb(moyenne)} sub={`sur ${d1.length} mois`} subColor="neutral" />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Consultations par mois — {periode}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#1D9E75', borderRadius: 2 }} />{year1}
            </span>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#D3D1C7', borderRadius: 2 }} />{year2}
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataBar}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => `${fmtNb(v)} consult.`} />
            <Bar dataKey={year1} fill="#1D9E75" radius={[3,3,0,0]} />
            <Bar dataKey={year2} fill="#D3D1C7" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Consultations cumulées — {periode}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 18, height: 2, background: '#1D9E75', borderRadius: 1 }} />{year1}
            </span>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 18, borderTop: '2px dashed #B4B2A9' }} />{year2}
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dataCumul}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => `${fmtNb(v)} consult.`} />
            <Line type="monotone" dataKey={year1} stroke="#1D9E75" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey={year2} stroke="#B4B2A9" strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Sélecteur de spécialités */}
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, letterSpacing: '0.04em', marginTop: 6 }}>
        Par spécialité — cliquez pour le détail
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {CONSULT_SPECIALITES.map(sp => {
          const total = sum(specMensuel(sp, year1).slice(de, a + 1))
          const isSel = sp.id === specId
          return (
            <button
              key={sp.id}
              onClick={() => { setSpecId(sp.id); setPratId('all') }}
              style={{
                background: isSel ? 'var(--color-primary-light)' : 'var(--color-surface)',
                border: isSel ? '1.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: sp.couleur, borderRadius: 3 }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{sp.nom}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>{fmtNb(total)}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                consultations {year1} · {periode}{sp.praticiens ? ` · ${sp.praticiens.filter(p => !p.masque).length} praticien${sp.praticiens.filter(p => !p.masque).length > 1 ? 's' : ''}` : ''}
              </div>
            </button>
          )
        })}
      </div>

      {/* Pills praticiens + gestion (uniquement si la spécialité en a) */}
      {hasPrat && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginRight: 2 }}>Praticien</span>
            <button onClick={() => setPratId('all')} style={pratId === 'all' ? pillActive : pillBase}>Tous</button>
            {pratsVisibles.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setPratId(p.id)}
                style={pratId === p.id ? pillActive : pillBase}
              >
                <span style={{ display: 'inline-block', width: 8, height: 8, background: PALETTE[i % PALETTE.length], borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }} />
                {p.nom.replace(/^Dr\s+/, '')}
              </button>
            ))}
          </div>
          <GestionPraticiens spec={spec} onChange={rafraichir} />
        </>
      )}

      {/* Détail */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {prat ? (
          <>
            <KpiCard label={`${prat.nom} · ${year1}`} value={fmtNb(aT1)} sub={periode} subColor="neutral" />
            <KpiCard label={`${prat.nom} · ${year2}`} value={fmtNb(aT2)} sub={diffLabel(aT1, aT2, year2)} subColor={diffColor(aT1, aT2)} />
            <KpiCard label="Part de la spécialité" value={`${specT1 ? Math.round(aT1 / specT1 * 100) : 0} %`} sub={`de ${spec.nom} · ${periode}`} subColor="neutral" />
          </>
        ) : (
          <>
            <KpiCard label={`${spec.nom} · ${year1}`} value={fmtNb(specT1)} sub={periode} subColor="neutral" />
            <KpiCard label={`${spec.nom} · ${year2}`} value={fmtNb(specT2)} sub={diffLabel(specT1, specT2, year2)} subColor={diffColor(specT1, specT2)} />
            <KpiCard label="Part des consultations" value={`${t1 ? Math.round(specT1 / t1 * 100) : 0} %`} sub={`du total ${year1} · ${periode}`} subColor="neutral" />
          </>
        )}
      </div>

      {isAllPrat ? (
        <>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                {spec.nom} — répartition par praticien · {year1} · {periode}
              </span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {pratsVisibles.map((p, i) => (
                  <span key={p.id} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: PALETTE[i % PALETTE.length], borderRadius: 2 }} />
                    {p.nom.replace(/^Dr\s+/, '')}
                  </span>
                ))}
                {hasAutre && (
                  <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: '#B4B2A9', borderRadius: 2 }} />
                    Autre / non attribué
                  </span>
                )}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={pratBar}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [
                  `${fmtNb(v)} consult.`,
                  name === '__autre' ? 'Autre / non attribué' : (pratsVisibles.find(p => p.id === name)?.nom || name),
                ]} />
                {pratsVisibles.map((p, i) => (
                  <Bar
                    key={p.id}
                    dataKey={p.id}
                    stackId="prat"
                    fill={PALETTE[i % PALETTE.length]}
                    radius={i === pratsVisibles.length - 1 && !hasAutre ? [3,3,0,0] : [0,0,0,0]}
                  />
                ))}
                {hasAutre && (
                  <Bar dataKey="__autre" stackId="prat" fill="#B4B2A9" radius={[3,3,0,0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                {spec.nom} — cumulé par praticien · {year1} · {periode}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={pratCumul}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [
                  `${fmtNb(v)} consult.`,
                  name === '__autre' ? 'Autre / non attribué' : (pratsVisibles.find(p => p.id === name)?.nom || name),
                ]} />
                {pratsVisibles.map((p, i) => (
                  <Line key={p.id} type="monotone" dataKey={p.id} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={{ r: 2 }} />
                ))}
                {hasAutre && (
                  <Line type="monotone" dataKey="__autre" stroke="#B4B2A9" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                {prat ? prat.nom : spec.nom} — par mois · {periode}
              </span>
              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, background: aColor, borderRadius: 2 }} />{year1}
                </span>
                <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, background: '#D3D1C7', borderRadius: 2 }} />{year2}
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={aBar}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => `${fmtNb(v)} consult.`} />
                <Bar dataKey={year1} fill={aColor} radius={[3,3,0,0]} />
                <Bar dataKey={year2} fill="#D3D1C7" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                {prat ? prat.nom : spec.nom} — cumulé · {periode}
              </span>
              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ display: 'inline-block', width: 18, height: 2, background: aColor, borderRadius: 1 }} />{year1}
                </span>
                <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ display: 'inline-block', width: 18, borderTop: '2px dashed #B4B2A9' }} />{year2}
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={aCumul}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => `${fmtNb(v)} consult.`} />
                <Line type="monotone" dataKey={year1} stroke={aColor} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey={year2} stroke="#B4B2A9" strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
