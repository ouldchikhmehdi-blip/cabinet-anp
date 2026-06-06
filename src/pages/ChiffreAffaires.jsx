import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import { CA, MOIS_COURT, ANNEES, fmtK, fmtEur, sum, diffLabel, diffColor } from '../data/mockData'

export default function ChiffreAffaires() {
  const [moisDe, setMoisDe] = useState(0)
  const [moisA, setMoisA] = useState(11)
  const [year1, setYear1] = useState(2024)
  const [year2, setYear2] = useState(2023)
  const [shortcut, setShortcut] = useState('annee')

  const de = Math.min(moisDe, moisA)
  const a = Math.max(moisDe, moisA)

  const d1 = (CA[year1] || CA[2024]).slice(de, a + 1)
  const d2 = (CA[year2] || CA[2023]).slice(de, a + 1)
  const labels = MOIS_COURT.slice(de, a + 1)

  const t1 = sum(d1), t2 = sum(d2)
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]

  const dataMensuel = labels.map((m, i) => ({
    mois: m, [year1]: d1[i], [year2]: d2[i]
  }))

  const dataCumul = labels.map((m, i) => ({
    mois: m,
    [year1]: sum(d1.slice(0, i + 1)),
    [year2]: sum(d2.slice(0, i + 1)),
  }))

  const tooltipStyle = {
    backgroundColor: '#fff',
    border: '0.5px solid #d3d1c7',
    borderRadius: 8,
    fontSize: 12,
  }

  const cardStyle = {
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '14px 16px',
  }

  const Legend = ({ y1, y2 }) => (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ display: 'inline-block', width: 18, height: 2, background: '#534AB7', borderRadius: 1 }} />
        {y1}
      </span>
      <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ display: 'inline-block', width: 18, borderTop: '2px dashed #B4B2A9' }} />
        {y2}
      </span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Chiffre d'affaires</h1>
        <span style={{
          fontSize: 11, background: 'var(--color-primary-light)',
          color: 'var(--color-primary-dark)', padding: '3px 10px',
          borderRadius: 20, fontWeight: 500
        }}>{year1} vs {year2}</span>
      </div>

      <PeriodeFilter
        moisDe={moisDe} setMoisDe={setMoisDe}
        moisA={moisA} setMoisA={setMoisA}
        year1={year1} setYear1={setYear1}
        year2={year2} setYear2={setYear2}
        shortcut={shortcut} setShortcut={setShortcut}
        availableYears={ANNEES}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <KpiCard
          label={`CA · ${year1}`}
          value={fmtK(t1)}
          sub={periode}
          subColor="neutral"
        />
        <KpiCard
          label={`CA · ${year2}`}
          value={fmtK(t2)}
          sub={periode}
          subColor="neutral"
        />
        <KpiCard
          label="Écart sur la période"
          value={(t1 - t2 >= 0 ? '+' : '') + fmtEur(t1 - t2)}
          sub={diffLabel(t1, t2, year2)}
          subColor={diffColor(t1, t2)}
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            CA mensuel — {periode}
          </span>
          <Legend y1={year1} y2={year2} />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dataMensuel}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            <Line type="monotone" dataKey={year1} stroke="#534AB7" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey={year2} stroke="#B4B2A9" strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            CA cumulé — {periode}
          </span>
          <Legend y1={year1} y2={year2} />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dataCumul}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            <Line type="monotone" dataKey={year1} stroke="#534AB7" strokeWidth={2} dot={{ r: 3 }} fill="rgba(83,74,183,0.08)" />
            <Line type="monotone" dataKey={year2} stroke="#B4B2A9" strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}