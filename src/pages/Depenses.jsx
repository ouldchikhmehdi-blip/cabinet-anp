import { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import { DEPENSES, MOIS_COURT, ANNEES, fmtEur, sum, diffLabel, diffColor, MOIS_ACTUEL } from '../data/mockData'

export default function Depenses() {
  const [moisDe, setMoisDe] = useState(0)
  const [moisA, setMoisA] = useState(11)
  const [year1, setYear1] = useState(2024)
  const [year2, setYear2] = useState(2023)
  const [shortcut, setShortcut] = useState('annee')
  const [selectedId, setSelectedId] = useState(DEPENSES[0].id)

  const de = Math.min(moisDe, moisA)
  const a = Math.max(moisDe, moisA)
  const labels = MOIS_COURT.slice(de, a + 1)
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]

  const selected = DEPENSES.find(d => d.id === selectedId) || DEPENSES[0]

  // Vue d'ensemble — répartition empilée par catégorie pour year1
  const dataStack = labels.map((m, i) => {
    const row = { mois: m }
    DEPENSES.forEach(dep => { row[dep.id] = (dep.montants[year1] || [])[de + i] ?? 0 })
    return row
  })

  // Détail de la catégorie sélectionnée
  const d1 = (selected.montants[year1] || []).slice(de, a + 1)
  const d2 = (selected.montants[year2] || []).slice(de, a + 1)
  const t1 = sum(d1), t2 = sum(d2)
  const all1 = selected.montants[year1] || []
  const cumulAujourdhui = sum(all1.slice(0, MOIS_ACTUEL + 1))

  const dataBar = labels.map((m, i) => ({ mois: m, [year1]: d1[i], [year2]: d2[i] }))
  const dataCumul = labels.map((m, i) => ({
    mois: m,
    [year1]: sum(d1.slice(0, i + 1)),
    [year2]: sum(d2.slice(0, i + 1)),
  }))

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Dépenses</h1>
        <span style={{
          fontSize: 11, background: 'var(--color-primary-light)',
          color: 'var(--color-primary-dark)', padding: '3px 10px',
          borderRadius: 20, fontWeight: 500
        }}>SARM · 8 associés</span>
      </div>

      <PeriodeFilter
        moisDe={moisDe} setMoisDe={setMoisDe}
        moisA={moisA} setMoisA={setMoisA}
        year1={year1} setYear1={setYear1}
        year2={year2} setYear2={setYear2}
        shortcut={shortcut} setShortcut={setShortcut}
        availableYears={ANNEES}
      />

      {/* Vue d'ensemble — répartition des dépenses par catégorie */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Répartition par catégorie · {year1} — {periode}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            {DEPENSES.map(dep => (
              <span key={dep.id} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: dep.couleur, borderRadius: 2 }} />
                {dep.nom}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataStack}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(1)+'k'} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [fmtEur(v), DEPENSES.find(d => d.id === name)?.nom || name]} />
            {DEPENSES.map((dep, i) => (
              <Bar
                key={dep.id}
                dataKey={dep.id}
                stackId="dep"
                fill={dep.couleur}
                radius={i === DEPENSES.length - 1 ? [3,3,0,0] : [0,0,0,0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Sélecteur de catégories */}
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, letterSpacing: '0.04em' }}>
        Catégories — cliquez pour le détail
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {DEPENSES.map(dep => {
          const total = sum((dep.montants[year1] || []).slice(de, a + 1))
          const isSel = dep.id === selectedId
          return (
            <button
              key={dep.id}
              onClick={() => setSelectedId(dep.id)}
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
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: `${dep.couleur}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, marginBottom: 8
              }}>
                {dep.icon}
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)', marginBottom: 8 }}>{dep.nom}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>{fmtEur(total)}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>total {year1} · {periode}</div>
            </button>
          )
        })}
      </div>

      {/* Détail de la catégorie sélectionnée */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <KpiCard
          label={`${selected.nom} · ${year1}`}
          value={fmtEur(t1)}
          sub={periode}
          subColor="neutral"
        />
        <KpiCard
          label={`${selected.nom} · ${year2}`}
          value={fmtEur(t2)}
          sub={diffLabel(t1, t2, year2)}
          subColor={diffColor(t1, t2, true)}
        />
        <KpiCard
          label="Cumul à ce jour"
          value={fmtEur(cumulAujourdhui)}
          sub={`Jan → ${MOIS_COURT[MOIS_ACTUEL]} ${year1}`}
          subColor="neutral"
        />
        <KpiCard
          label="Moyenne mensuelle"
          value={fmtEur(d1.length ? t1 / d1.length : 0)}
          sub={`sur ${d1.length} mois`}
          subColor="neutral"
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            {selected.nom} — coût mensuel · {periode}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: selected.couleur, borderRadius: 2 }} />{year1}
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
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(1)+'k'} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            <Bar dataKey={year1} fill={selected.couleur} radius={[3,3,0,0]} />
            <Bar dataKey={year2} fill="#D3D1C7" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            {selected.nom} — coût cumulé · {periode}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 18, height: 2, background: selected.couleur, borderRadius: 1 }} />{year1}
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
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(1)+'k'} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            <Line type="monotone" dataKey={year1} stroke={selected.couleur} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey={year2} stroke="#B4B2A9" strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
