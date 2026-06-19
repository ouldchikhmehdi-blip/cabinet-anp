import { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import BoutonExport from '../components/BoutonExport'
import { RETRO_FIXE, RETRO_VARIABLE, MOIS_COURT, MOIS_LONG, ANNEES, fmtEur, sum, diffLabel, diffColor, MOIS_ACTUEL, getMasqueMontants, couleurAnnee, periodeParDefaut } from '../data/mockData'

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

export default function Retrocessions() {
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
  const fixeDe = (y) => (RETRO_FIXE[y] || []).slice(de, a + 1)
  const varDe = (y) => (RETRO_VARIABLE[y] || []).slice(de, a + 1)
  const totalSerie = (y) => fixeDe(y).map((v, i) => v + (varDe(y)[i] ?? 0))

  const tFixePrimary = sum(fixeDe(primary))
  const tVarPrimary = sum(varDe(primary))
  const tTotPrimary = sum(totalSerie(primary))
  const tTotRef = sum(totalSerie(ref))
  const cumulAujourdhui = sum((RETRO_FIXE[primary] || []).slice(0, MOIS_ACTUEL + 1)) + sum((RETRO_VARIABLE[primary] || []).slice(0, MOIS_ACTUEL + 1))

  // Barres empilées fixe/variable : année principale.
  const dataBar = labels.map((m, i) => ({ mois: m, fixe: fixeDe(primary)[i] ?? 0, variable: varDe(primary)[i] ?? 0 }))
  // Cumul du total versé : une courbe par année comparée.
  const dataCumul = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = sum(totalSerie(y).slice(0, i + 1)) })
    return row
  })

  const exportsRetro = [{
    label: 'Virements associés',
    build: () => {
      const lignes = labels.map((_, i) => {
        const row = { Mois: MOIS_LONG[de + i] }
        years.forEach(y => {
          row[`Fixe ${y}`] = fixeDe(y)[i] ?? 0
          row[`Variable ${y}`] = varDe(y)[i] ?? 0
          row[`Total ${y}`] = (fixeDe(y)[i] ?? 0) + (varDe(y)[i] ?? 0)
        })
        return row
      })
      const total = { Mois: 'TOTAL' }
      years.forEach(y => {
        total[`Fixe ${y}`] = sum(fixeDe(y))
        total[`Variable ${y}`] = sum(varDe(y))
        total[`Total ${y}`] = sum(totalSerie(y))
      })
      lignes.push(total)
      return { nomFichier: `virements-associes_${MOIS_COURT[de]}-${MOIS_COURT[a]}_${years.join('-')}.xlsx`, lignes, feuille: 'Virements associés' }
    }
  }]

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Virements associés</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>
            8 associés · parts égales
          </span>
          <BoutonExport exports={exportsRetro} disabled={masque} />
        </div>
      </div>

      <PeriodeFilter
        moisDe={moisDe} setMoisDe={setMoisDe}
        moisA={moisA} setMoisA={setMoisA}
        years={years} setYears={setYears}
        shortcut={shortcut} setShortcut={setShortcut}
        availableYears={ANNEES}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <KpiCard label={`Fixe versé · ${primary}`} value={fmtEur(tFixePrimary)} sub={periode} subColor="neutral" />
        <KpiCard label={`Variable versé · ${primary}`} value={fmtEur(tVarPrimary)} sub={periode} subColor="neutral" />
        <KpiCard
          label={`Total / associé · ${primary}`}
          value={fmtEur(tTotPrimary)}
          sub={diffLabel(tTotPrimary, tTotRef, ref)}
          subColor={diffColor(tTotPrimary, tTotRef)}
        />
        <KpiCard
          label="Cumul versé / associé à ce jour"
          value={fmtEur(cumulAujourdhui)}
          sub={`Jan → ${MOIS_COURT[MOIS_ACTUEL]} ${primary}`}
          subColor="neutral"
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Versement mensuel / associé · {primary} — {periode}
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
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(1)+'k'} hide={masque} />
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
          <LegendAnnees years={years} />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dataCumul}>
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
    </div>
  )
}
