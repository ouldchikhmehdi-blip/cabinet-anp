import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import { CA, CHARGES, MOIS_COURT, ANNEES, fmtK, fmtEur, sum, diffLabel, diffColor, RETRO_FIXE, RETRO_VARIABLE, MOIS_ACTUEL } from '../data/mockData'

export default function VueGlobale() {
  const [moisDe, setMoisDe] = useState(0)
  const [moisA, setMoisA] = useState(11)
  const [year1, setYear1] = useState(2024)
  const [year2, setYear2] = useState(2023)
  const [shortcut, setShortcut] = useState('annee')

  const de = Math.min(moisDe, moisA)
  const a = Math.max(moisDe, moisA)

  const ca1 = (CA[year1] || CA[2024]).slice(de, a + 1)
  const ca2 = (CA[year2] || CA[2023]).slice(de, a + 1)
  const ch1 = (CHARGES[year1] || CHARGES[2024]).slice(de, a + 1)
  const ch2 = (CHARGES[year2] || CHARGES[2023]).slice(de, a + 1)
  const labels = MOIS_COURT.slice(de, a + 1)

  const totalCA1 = sum(ca1), totalCA2 = sum(ca2)
  const totalCH1 = sum(ch1), totalCH2 = sum(ch2)
  const res1 = totalCA1 - totalCH1, res2 = totalCA2 - totalCH2

  const f = RETRO_FIXE[year1] || RETRO_FIXE[2024]
  const v = RETRO_VARIABLE[year1] || RETRO_VARIABLE[2024]
  const cumulRetro = sum(f.slice(0, MOIS_ACTUEL + 1)) + sum(v.slice(0, MOIS_ACTUEL + 1))

  const dataCA = labels.map((m, i) => ({
    mois: m,
    [year1]: ca1[i],
    [year2]: ca2[i],
  }))

  const dataCH = labels.map((m, i) => ({
    mois: m,
    [year1]: ch1[i],
    [year2]: ch2[i],
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Vue globale</h1>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <KpiCard
          label={`Chiffre d'affaires ${year1}`}
          value={fmtK(totalCA1)}
          sub={diffLabel(totalCA1, totalCA2, year2)}
          subColor={diffColor(totalCA1, totalCA2)}
        />
        <KpiCard
          label={`Charges totales ${year1}`}
          value={fmtK(totalCH1)}
          sub={diffLabel(totalCH1, totalCH2, year2)}
          subColor={diffColor(totalCH1, totalCH2, true)}
        />
        <KpiCard
          label={`Résultat net ${year1}`}
          value={fmtK(res1)}
          sub={diffLabel(res1, res2, year2)}
          subColor={diffColor(res1, res2)}
        />
        <KpiCard
          label="Virements versés / associé"
          value={fmtEur(cumulRetro)}
          sub={`Jan → ${MOIS_COURT[MOIS_ACTUEL]} ${year1} · cumul`}
          subColor="neutral"
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Chiffre d'affaires mensuel
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 18, height: 2, background: '#534AB7', borderRadius: 1 }} />
              {year1}
            </span>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 18, borderTop: '2px dashed #B4B2A9' }} />
              {year2}
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={dataCA}>
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
            Charges mensuelles
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 18, height: 2, background: '#D85A30', borderRadius: 1 }} />
              {year1}
            </span>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 18, borderTop: '2px dashed #B4B2A9' }} />
              {year2}
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={dataCH}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            <Line type="monotone" dataKey={year1} stroke="#D85A30" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey={year2} stroke="#B4B2A9" strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}