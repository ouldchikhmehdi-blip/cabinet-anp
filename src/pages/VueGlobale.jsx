import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import { CA, CHARGES, MOIS_COURT, ANNEES, fmtK, fmtEur, sum, diffLabel, diffColor, RETRO_FIXE, RETRO_VARIABLE, MOIS_ACTUEL, getMasqueMontants, couleurAnnee } from '../data/mockData'

function LegendAnnees({ years, accent }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {years.map((y, rang) => (
        <span key={y} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 18, height: 0, borderTop: `2px ${rang === 0 ? 'solid' : 'dashed'} ${couleurAnnee(rang, accent)}` }} />
          {y}
        </span>
      ))}
    </div>
  )
}

export default function VueGlobale() {
  const [moisDe, setMoisDe] = useState(0)
  const [moisA, setMoisA] = useState(11)
  const [years, setYears] = useState([ANNEES[0], ANNEES[1]])
  const [shortcut, setShortcut] = useState('annee')

  const de = Math.min(moisDe, moisA)
  const a = Math.max(moisDe, moisA)
  const masque = getMasqueMontants()

  const primary = years[0]
  const ref = years[1]
  const caDe = (y) => (CA[y] || []).slice(de, a + 1)
  const chDe = (y) => (CHARGES[y] || []).slice(de, a + 1)

  const totalCA1 = sum(caDe(primary)), totalCA2 = sum(caDe(ref))
  const totalCH1 = sum(chDe(primary)), totalCH2 = sum(chDe(ref))
  const res1 = totalCA1 - totalCH1, res2 = totalCA2 - totalCH2

  const f = RETRO_FIXE[primary] || []
  const v = RETRO_VARIABLE[primary] || []
  const cumulRetro = sum(f.slice(0, MOIS_ACTUEL + 1)) + sum(v.slice(0, MOIS_ACTUEL + 1))

  const labels = MOIS_COURT.slice(de, a + 1)
  const dataCA = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = caDe(y)[i] ?? 0 })
    return row
  })
  const dataCH = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = chDe(y)[i] ?? 0 })
    return row
  })

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }

  const renderLignes = (accent) => years.map((y, rang) => (
    <Line
      key={y}
      type="monotone"
      dataKey={y}
      stroke={couleurAnnee(rang, accent)}
      strokeWidth={rang === 0 ? 2 : 1.5}
      strokeDasharray={rang === 0 ? undefined : '5 4'}
      dot={{ r: rang === 0 ? 3 : 2 }}
    />
  ))

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
        years={years} setYears={setYears}
        shortcut={shortcut} setShortcut={setShortcut}
        availableYears={ANNEES}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <KpiCard
          label={`Chiffre d'affaires ${primary}`}
          value={fmtK(totalCA1)}
          sub={diffLabel(totalCA1, totalCA2, ref)}
          subColor={diffColor(totalCA1, totalCA2)}
        />
        <KpiCard
          label={`Charges totales ${primary}`}
          value={fmtK(totalCH1)}
          sub={diffLabel(totalCH1, totalCH2, ref)}
          subColor={diffColor(totalCH1, totalCH2, true)}
        />
        <KpiCard
          label={`Résultat net ${primary}`}
          value={fmtK(res1)}
          sub={diffLabel(res1, res2, ref)}
          subColor={diffColor(res1, res2)}
        />
        <KpiCard
          label="Virements versés / associé"
          value={fmtEur(cumulRetro)}
          sub={`Jan → ${MOIS_COURT[MOIS_ACTUEL]} ${primary} · cumul`}
          subColor="neutral"
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Chiffre d'affaires mensuel
          </span>
          <LegendAnnees years={years} accent="#534AB7" />
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={dataCA}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            {renderLignes('#534AB7')}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Charges mensuelles
          </span>
          <LegendAnnees years={years} accent="#D85A30" />
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={dataCH}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            {renderLignes('#D85A30')}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
