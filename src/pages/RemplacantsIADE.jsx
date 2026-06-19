import { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import BoutonExport from '../components/BoutonExport'
import { REMPL_IADE, MOIS_COURT, MOIS_LONG, ANNEES, fmtEur, sum, diffLabel, diffColor, getMasqueMontants, couleurAnnee, ordreAffichage, periodeParDefaut } from '../data/mockData'

const ACCENT = '#EF9F27'

function LegendAnnees({ years, type }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {ordreAffichage(years).map(({ y, rang }) => (
        <span key={y} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
          {type === 'line'
            ? <span style={{ display: 'inline-block', width: 18, height: 0, borderTop: `2px ${rang === 0 ? 'solid' : 'dashed'} ${couleurAnnee(rang, ACCENT)}` }} />
            : <span style={{ display: 'inline-block', width: 10, height: 10, background: couleurAnnee(rang, ACCENT), borderRadius: 2 }} />}
          {y}
        </span>
      ))}
    </div>
  )
}

export default function RemplacantsIADE() {
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
  const serieDe = (y) => (REMPL_IADE[y] || []).slice(de, a + 1)
  const totalDe = (y) => sum(serieDe(y))
  const tPrimary = totalDe(primary)
  const tRef = totalDe(ref)

  const labels = MOIS_COURT.slice(de, a + 1)
  const dataBar = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = serieDe(y)[i] ?? 0 })
    return row
  })
  const dataCumul = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = sum(serieDe(y).slice(0, i + 1)) })
    return row
  })

  const exportsIADE = [{
    label: 'Remplaçants IADE',
    build: () => {
      const col = (y) => `Coût ${y}`
      const lignes = []
      for (let m = de; m <= a; m++) {
        const ligne = { Mois: MOIS_LONG[m] }
        years.forEach(y => { ligne[col(y)] = serieDe(y)[m - de] ?? 0 })
        lignes.push(ligne)
      }
      const total = { Mois: 'TOTAL' }
      years.forEach(y => { total[col(y)] = totalDe(y) })
      lignes.push(total)
      return { nomFichier: `remplacants-iade_${MOIS_COURT[de]}-${MOIS_COURT[a]}_${years.join('-')}.xlsx`, lignes, feuille: 'Remplaçants IADE' }
    }
  }]

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Remplaçants IADE</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, background: '#FAEEDA', color: '#633806', padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>
            Honoraires directs
          </span>
          <BoutonExport exports={exportsIADE} disabled={masque} />
        </div>
      </div>

      <PeriodeFilter
        moisDe={moisDe} setMoisDe={setMoisDe}
        moisA={moisA} setMoisA={setMoisA}
        years={years} setYears={setYears}
        shortcut={shortcut} setShortcut={setShortcut}
        availableYears={ANNEES}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <KpiCard label={`Coût total · ${primary}`} value={fmtEur(tPrimary)} sub={periode} subColor="neutral" />
        <KpiCard
          label={`Coût total · ${ref}`}
          value={fmtEur(tRef)}
          sub={diffLabel(tPrimary, tRef, ref)}
          subColor={diffColor(tPrimary, tRef, true)}
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Coût mensuel — {periode}
          </span>
          <LegendAnnees years={years} type="bar" />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataBar}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            {ordreAffichage(years).map(({ y, rang }) => (
              <Bar key={y} dataKey={y} fill={couleurAnnee(rang, ACCENT)} radius={[3,3,0,0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Coût cumulé — {periode}
          </span>
          <LegendAnnees years={years} type="line" />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dataCumul}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            {ordreAffichage(years).map(({ y, rang }) => (
              <Line
                key={y}
                type="monotone"
                dataKey={y}
                stroke={couleurAnnee(rang, ACCENT)}
                strokeWidth={rang === 0 ? 2 : 1.5}
                strokeDasharray={rang === 0 ? undefined : '5 4'}
                dot={{ r: rang === 0 ? 3 : 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
