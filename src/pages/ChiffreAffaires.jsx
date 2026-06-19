import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import BoutonExport from '../components/BoutonExport'
import { CA, MOIS_COURT, MOIS_LONG, ANNEES, fmtK, fmtEur, sum, diffLabel, diffColor, getMasqueMontants, couleurAnnee, periodeParDefaut } from '../data/mockData'

const ACCENT = '#534AB7'

// Légende des années comparées : trait plein pour la principale, pointillé pour les autres.
function LegendAnnees({ years }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {years.map((y, rang) => (
        <span key={y} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 18, height: 0, borderTop: `2px ${rang === 0 ? 'solid' : 'dashed'} ${couleurAnnee(rang, ACCENT)}` }} />
          {y}
        </span>
      ))}
    </div>
  )
}

export default function ChiffreAffaires() {
  const def = periodeParDefaut(ANNEES)
  const [moisDe, setMoisDe] = useState(def.moisDe)
  const [moisA, setMoisA] = useState(def.moisA)
  const [years, setYears] = useState(def.years)
  const [shortcut, setShortcut] = useState(def.shortcut)

  const de = Math.min(moisDe, moisA)
  const a = Math.max(moisDe, moisA)
  const masque = getMasqueMontants()
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]

  const primary = years[0]
  const ref = years[1]
  // Série mensuelle (sur la période) par année.
  const serieDe = (y) => (CA[y] || []).slice(de, a + 1)
  const totalDe = (y) => sum(serieDe(y))
  const tPrimary = totalDe(primary)
  const tRef = totalDe(ref)

  const labels = MOIS_COURT.slice(de, a + 1)
  const dataMensuel = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = serieDe(y)[i] ?? 0 })
    return row
  })
  const dataCumul = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = sum(serieDe(y).slice(0, i + 1)) })
    return row
  })

  const exportsCA = [{
    label: 'CA',
    build: () => {
      const col = (y) => `CA ${y}`
      const lignes = []
      for (let m = de; m <= a; m++) {
        const ligne = { Mois: MOIS_LONG[m] }
        years.forEach(y => { ligne[col(y)] = serieDe(y)[m - de] ?? 0 })
        lignes.push(ligne)
      }
      const total = { Mois: 'TOTAL' }
      years.forEach(y => { total[col(y)] = totalDe(y) })
      lignes.push(total)
      return { nomFichier: `chiffre-affaires_${MOIS_COURT[de]}-${MOIS_COURT[a]}_${years.join('-')}.xlsx`, lignes, feuille: 'CA' }
    }
  }]

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }

  const renderLignes = () => years.map((y, rang) => (
    <Line
      key={y}
      type="monotone"
      dataKey={y}
      stroke={couleurAnnee(rang, ACCENT)}
      strokeWidth={rang === 0 ? 2 : 1.5}
      strokeDasharray={rang === 0 ? undefined : '5 4'}
      dot={{ r: rang === 0 ? 3 : 2 }}
    />
  ))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Chiffre d'affaires</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, background: 'var(--color-primary-light)',
            color: 'var(--color-primary-dark)', padding: '3px 10px',
            borderRadius: 20, fontWeight: 500
          }}>{years.join(' · ')}</span>
          <BoutonExport exports={exportsCA} disabled={masque} />
        </div>
      </div>

      <PeriodeFilter
        moisDe={moisDe} setMoisDe={setMoisDe}
        moisA={moisA} setMoisA={setMoisA}
        years={years} setYears={setYears}
        shortcut={shortcut} setShortcut={setShortcut}
        availableYears={ANNEES}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <KpiCard label={`CA · ${primary}`} value={fmtK(tPrimary)} sub={periode} subColor="neutral" />
        <KpiCard label={`CA · ${ref}`} value={fmtK(tRef)} sub={periode} subColor="neutral" />
        <KpiCard
          label={`Écart ${primary} vs ${ref}`}
          value={(tPrimary - tRef >= 0 ? '+' : '') + fmtEur(tPrimary - tRef)}
          sub={diffLabel(tPrimary, tRef, ref)}
          subColor={diffColor(tPrimary, tRef)}
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            CA mensuel — {periode}
          </span>
          <LegendAnnees years={years} />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dataMensuel}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            {renderLignes()}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            CA cumulé — {periode}
          </span>
          <LegendAnnees years={years} />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dataCumul}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            {renderLignes()}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
