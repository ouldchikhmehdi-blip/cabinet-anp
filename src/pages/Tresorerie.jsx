import { useState } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import { SOLDES, ENTREES, SORTIES, MOIS_COURT, ANNEES, fmtEur, sum, diffLabel, diffColor, getMasqueMontants } from '../data/mockData'

export default function Tresorerie() {
  const [moisDe, setMoisDe] = useState(0)
  const [moisA, setMoisA] = useState(11)
  const [year1, setYear1] = useState(2024)
  const [year2, setYear2] = useState(2023)
  const [shortcut, setShortcut] = useState('annee')

  const de = Math.min(moisDe, moisA)
  const a = Math.max(moisDe, moisA)
  const masque = getMasqueMontants()

  const sol1 = (SOLDES[year1] || SOLDES[2024]).slice(de, a + 1)
  const sol2 = (SOLDES[year2] || SOLDES[2023]).slice(de, a + 1)
  const ent1 = (ENTREES[year1] || ENTREES[2024]).slice(de, a + 1)
  const ent2 = (ENTREES[year2] || ENTREES[2023]).slice(de, a + 1)
  const sor1 = (SORTIES[year1] || SORTIES[2024]).slice(de, a + 1)
  const sor2 = (SORTIES[year2] || SORTIES[2023]).slice(de, a + 1)
  const labels = MOIS_COURT.slice(de, a + 1)
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]

  const tEnt1 = sum(ent1), tEnt2 = sum(ent2)
  const tSor1 = sum(sor1), tSor2 = sum(sor2)
  const minSol = Math.min(...sol1)
  const minIdx = sol1.indexOf(minSol)
  const moySol1 = Math.round(sum(sol1) / sol1.length)
  const moySol2 = Math.round(sum(sol2) / sol2.length)
  const soldeActuel = SOLDES[year1]?.[11] || 0

  const dataSolde = labels.map((m, i) => ({
    mois: m, [year1]: sol1[i], [year2]: sol2[i]
  }))

  const dataFlux = labels.map((m, i) => ({
    mois: m, entrees: ent1[i], sorties: sor1[i]
  }))

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
        year1={year1} setYear1={setYear1}
        year2={year2} setYear2={setYear2}
        shortcut={shortcut} setShortcut={setShortcut}
        availableYears={ANNEES}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <KpiCard
          label={`Entrées · ${year1}`}
          value={fmtEur(tEnt1)}
          sub={diffLabel(tEnt1, tEnt2, year2)}
          subColor={diffColor(tEnt1, tEnt2)}
        />
        <KpiCard
          label={`Sorties · ${year1}`}
          value={fmtEur(tSor1)}
          sub={diffLabel(tSor1, tSor2, year2)}
          subColor={diffColor(tSor1, tSor2, true)}
        />
        <KpiCard
          label="Solde minimum"
          value={fmtEur(minSol)}
          sub={`Point bas en ${labels[minIdx] || '-'}`}
          subColor="neutral"
        />
        <KpiCard
          label="Solde moyen mensuel"
          value={fmtEur(moySol1)}
          sub={diffLabel(moySol1, moySol2, year2)}
          subColor={diffColor(moySol1, moySol2)}
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Évolution du solde — {periode}
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
          <LineChart data={dataSolde}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            <Line type="monotone" dataKey={year1} stroke="#534AB7" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey={year2} stroke="#B4B2A9" strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Entrées vs sorties — {periode}
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