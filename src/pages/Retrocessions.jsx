import { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import { RETRO_FIXE, RETRO_VARIABLE, MOIS_COURT, ANNEES, fmtEur, sum, diffLabel, diffColor, MOIS_ACTUEL } from '../data/mockData'

export default function Retrocessions() {
  const [moisDe, setMoisDe] = useState(0)
  const [moisA, setMoisA] = useState(11)
  const [year1, setYear1] = useState(2024)
  const [year2, setYear2] = useState(2023)
  const [shortcut, setShortcut] = useState('annee')

  const de = Math.min(moisDe, moisA)
  const a = Math.max(moisDe, moisA)

  const f1 = (RETRO_FIXE[year1] || RETRO_FIXE[2024]).slice(de, a + 1)
  const v1 = (RETRO_VARIABLE[year1] || RETRO_VARIABLE[2024]).slice(de, a + 1)
  const f2 = (RETRO_FIXE[year2] || RETRO_FIXE[2023]).slice(de, a + 1)
  const v2 = (RETRO_VARIABLE[year2] || RETRO_VARIABLE[2023]).slice(de, a + 1)
  const labels = MOIS_COURT.slice(de, a + 1)
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]

  const tot1 = f1.map((v, i) => v + v1[i])
  const tot2 = f2.map((v, i) => v + v2[i])
  const tFixe1 = sum(f1), tVar1 = sum(v1)
  const tTot1 = sum(tot1), tTot2 = sum(tot2)

  const fAll = RETRO_FIXE[year1] || RETRO_FIXE[2024]
  const vAll = RETRO_VARIABLE[year1] || RETRO_VARIABLE[2024]
  const cumulAujourdhui = sum(fAll.slice(0, MOIS_ACTUEL + 1)) + sum(vAll.slice(0, MOIS_ACTUEL + 1))

  const dataBar = labels.map((m, i) => ({
    mois: m, fixe: f1[i], variable: v1[i]
  }))

  const dataCumul = labels.map((m, i) => ({
    mois: m,
    [year1]: sum(tot1.slice(0, i + 1)),
    [year2]: sum(tot2.slice(0, i + 1)),
  }))

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Rétrocessions associés</h1>
        <span style={{ fontSize: 11, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>
          8 associés · parts égales
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <KpiCard
          label={`Fixe versé · ${year1}`}
          value={fmtEur(tFixe1)}
          sub={periode}
          subColor="neutral"
        />
        <KpiCard
          label={`Variable versé · ${year1}`}
          value={fmtEur(tVar1)}
          sub={periode}
          subColor="neutral"
        />
        <KpiCard
          label={`Total / associé · ${year1}`}
          value={fmtEur(tTot1)}
          sub={diffLabel(tTot1, tTot2, year2)}
          subColor={diffColor(tTot1, tTot2)}
        />
        <KpiCard
          label="Cumul versé / associé à ce jour"
          value={fmtEur(cumulAujourdhui)}
          sub={`Jan → ${MOIS_COURT[MOIS_ACTUEL]} ${year1}`}
          subColor="neutral"
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Versement mensuel / associé — {periode}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#534AB7', borderRadius: 2 }} /> Fixe
            </span>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#1D9E75', borderRadius: 2 }} /> Variable
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataBar}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(1)+'k'} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            <Bar dataKey="fixe" stackId="s" fill="#534AB7" radius={[0,0,0,0]} name="Fixe" />
            <Bar dataKey="variable" stackId="s" fill="#1D9E75" radius={[3,3,0,0]} name="Variable" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Cumul versé / associé — {periode}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 18, height: 2, background: '#534AB7', borderRadius: 1 }} />{year1}
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
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            <Line type="monotone" dataKey={year1} stroke="#534AB7" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey={year2} stroke="#B4B2A9" strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}