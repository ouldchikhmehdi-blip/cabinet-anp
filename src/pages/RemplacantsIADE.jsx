import { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import { REMPL_IADE, MOIS_COURT, ANNEES, fmtEur, sum, diffLabel, diffColor, getMasqueMontants } from '../data/mockData'

export default function RemplacantsIADE() {
  const [moisDe, setMoisDe] = useState(0)
  const [moisA, setMoisA] = useState(11)
  const [year1, setYear1] = useState(2024)
  const [year2, setYear2] = useState(2023)
  const [shortcut, setShortcut] = useState('annee')

  const de = Math.min(moisDe, moisA)
  const a = Math.max(moisDe, moisA)
  const masque = getMasqueMontants()

  const d1 = (REMPL_IADE[year1] || REMPL_IADE[2024]).slice(de, a + 1)
  const d2 = (REMPL_IADE[year2] || REMPL_IADE[2023]).slice(de, a + 1)
  const labels = MOIS_COURT.slice(de, a + 1)
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]

  const t1 = sum(d1), t2 = sum(d2)

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
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Remplaçants IADE</h1>
        <span style={{ fontSize: 11, background: '#FAEEDA', color: '#633806', padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>
          Honoraires directs
        </span>
      </div>

      <PeriodeFilter
        moisDe={moisDe} setMoisDe={setMoisDe}
        moisA={moisA} setMoisA={setMoisA}
        year1={year1} setYear1={setYear1}
        year2={year2} setYear2={setYear2}
        shortcut={shortcut} setShortcut={setShortcut}
        availableYears={ANNEES}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <KpiCard
          label={`Coût total · ${year1}`}
          value={fmtEur(t1)}
          sub={periode}
          subColor="neutral"
        />
        <KpiCard
          label={`Coût total · ${year2}`}
          value={fmtEur(t2)}
          sub={diffLabel(t1, t2, year2)}
          subColor={diffColor(t1, t2, true)}
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Coût mensuel — {periode}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#EF9F27', borderRadius: 2 }} />{year1}
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
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            <Bar dataKey={year1} fill="#EF9F27" radius={[3,3,0,0]} />
            <Bar dataKey={year2} fill="#D3D1C7" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Coût cumulé — {periode}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 18, height: 2, background: '#EF9F27', borderRadius: 1 }} />{year1}
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
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            <Line type="monotone" dataKey={year1} stroke="#EF9F27" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey={year2} stroke="#B4B2A9" strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}