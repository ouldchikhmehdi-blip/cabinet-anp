import { useState } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import { SOLDES, ENTREES, SORTIES, MOIS_COURT, ANNEES, fmtEur, sum, diffLabel, diffColor, getMasqueMontants, couleurAnnee, periodeParDefaut } from '../data/mockData'

const ACCENT = '#534AB7'

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

export default function Tresorerie() {
  const def = periodeParDefaut(ANNEES)
  const [moisDe, setMoisDe] = useState(def.moisDe)
  const [moisA, setMoisA] = useState(def.moisA)
  const [years, setYears] = useState(def.years)
  const [shortcut, setShortcut] = useState(def.shortcut)

  const de = Math.min(moisDe, moisA)
  const a = Math.max(moisDe, moisA)
  const masque = getMasqueMontants()
  const labels = MOIS_COURT.slice(de, a + 1)
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]

  const primary = years[0]
  const ref = years[1]
  const soldeDe = (y) => (SOLDES[y] || []).slice(de, a + 1)
  const entDe = (y) => (ENTREES[y] || []).slice(de, a + 1)
  const sorDe = (y) => (SORTIES[y] || []).slice(de, a + 1)

  const tEnt1 = sum(entDe(primary)), tEnt2 = sum(entDe(ref))
  const tSor1 = sum(sorDe(primary)), tSor2 = sum(sorDe(ref))
  const solPrimary = soldeDe(primary)
  const minSol = solPrimary.length ? Math.min(...solPrimary) : 0
  const minIdx = solPrimary.indexOf(minSol)
  const moySol1 = solPrimary.length ? Math.round(sum(solPrimary) / solPrimary.length) : 0
  const solRef = soldeDe(ref)
  const moySol2 = solRef.length ? Math.round(sum(solRef) / solRef.length) : 0
  const soldeActuel = SOLDES[primary]?.[11] || 0

  const dataSolde = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = soldeDe(y)[i] ?? 0 })
    return row
  })
  // Entrées vs sorties : année principale.
  const dataFlux = labels.map((m, i) => ({ mois: m, entrees: entDe(primary)[i] ?? 0, sorties: sorDe(primary)[i] ?? 0 }))

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Trésorerie</h1>
        <span style={{
          fontSize: 12, background: '#E1F5EE', color: '#085041',
          padding: '4px 12px', borderRadius: 20, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 6
        }}>
          ✓ Solde actuel : {fmtEur(soldeActuel)}
        </span>
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
          label={`Entrées · ${primary}`}
          value={fmtEur(tEnt1)}
          sub={diffLabel(tEnt1, tEnt2, ref)}
          subColor={diffColor(tEnt1, tEnt2)}
        />
        <KpiCard
          label={`Sorties · ${primary}`}
          value={fmtEur(tSor1)}
          sub={diffLabel(tSor1, tSor2, ref)}
          subColor={diffColor(tSor1, tSor2, true)}
        />
        <KpiCard
          label="Solde minimum"
          value={fmtEur(minSol)}
          sub={`Point bas en ${labels[minIdx] || '-'} · ${primary}`}
          subColor="neutral"
        />
        <KpiCard
          label="Solde moyen mensuel"
          value={fmtEur(moySol1)}
          sub={diffLabel(moySol1, moySol2, ref)}
          subColor={diffColor(moySol1, moySol2)}
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Évolution du solde — {periode}
          </span>
          <LegendAnnees years={years} />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dataSolde}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            {years.map((y, rang) => (
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

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Entrées vs sorties · {primary} — {periode}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#1D9E75', borderRadius: 2 }} /> Entrées
            </span>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#D85A30', borderRadius: 2 }} /> Sorties
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataFlux}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            <Bar dataKey="entrees" fill="#1D9E75" radius={[3,3,0,0]} name="Entrées" />
            <Bar dataKey="sorties" fill="#D85A30" radius={[3,3,0,0]} name="Sorties" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
