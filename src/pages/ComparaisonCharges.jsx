import { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import EtatCompta from '../components/EtatCompta'
import { useCompta } from '../data/compta'
import { usePeriode } from '../data/periode'
import { MOIS_COURT, fmtEur, sum, diffLabel, diffColor, getMasqueMontants } from '../data/mockData'

// Les trois postes du personnel, mêmes couleurs que leurs sous-onglets.
const POSTES = [
  { id: 'cdi', label: 'Salariés CDI', serie: 'SALAIRES_CDI', couleur: '#534AB7' },
  { id: 'iade', label: 'Rempla IADE', serie: 'REMPL_IADE', couleur: '#EF9F27' },
  { id: 'mar', label: 'Rempla MAR', serie: 'REMPL_MAR', couleur: '#D85A30' },
]

// Comparaison dans le temps des trois postes, sur les mois et années choisis.
// Chaque poste se coche ou se décoche ; il en reste toujours au moins un.
export default function ComparaisonCharges() {
  const etat = useCompta()
  const S = etat.series
  const P = usePeriode(S.ANNEES)
  const { de, a, primary, ref, years } = P
  const [actifs, setActifs] = useState(POSTES.map(p => p.id))

  const masque = getMasqueMontants()
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]
  const postes = POSTES.filter(p => actifs.includes(p.id))
  const basculer = (id) => setActifs(l => l.includes(id) ? (l.length > 1 ? l.filter(x => x !== id) : l) : [...l, id])

  const mois = (p, y) => (S[p.serie][y] || Array(12).fill(0)).slice(de, a + 1)
  const total = (p, y) => sum(mois(p, y))
  const totalSel = (y) => sum(postes.map(p => total(p, y)))

  // Totaux de la période, une barre empilée par année
  const dataAnnees = years.map(y => {
    const row = { annee: String(y) }
    postes.forEach(p => { row[p.id] = total(p, y) })
    return row
  })
  // Mois après mois, années bout à bout
  const dataTemps = years.flatMap(y => MOIS_COURT.slice(de, a + 1).map((m, i) => {
    const row = { mois: `${m} ${String(y).slice(2)}` }
    postes.forEach(p => { row[p.id] = mois(p, y)[i] ?? 0 })
    return row
  }))

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }
  const nomPoste = (id) => POSTES.find(p => p.id === id)?.label ?? id
  const th = { fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', textAlign: 'right', padding: '6px 8px', borderBottom: '0.5px solid var(--color-border)' }
  const td = { fontSize: 12, textAlign: 'right', padding: '6px 8px', borderBottom: '0.5px solid var(--color-border)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <h1 style={{ fontSize: 18, fontWeight: 500 }}>Comparaison CDI · rempla IADE · rempla MAR</h1>

      <EtatCompta etat={etat} />

      <PeriodeFilter
        moisDe={P.moisDe} setMoisDe={P.setMoisDe}
        moisA={P.moisA} setMoisA={P.setMoisA}
        years={P.years} setYears={P.setYears}
        shortcut={P.shortcut} setShortcut={P.setShortcut}
        availableYears={S.ANNEES}
      />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Postes comparés</span>
        {POSTES.map(p => {
          const on = actifs.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => basculer(p.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12, padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                border: `0.5px solid ${on ? p.couleur : 'var(--color-border)'}`,
                background: on ? p.couleur + '1A' : 'var(--color-bg)',
                color: on ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                fontWeight: on ? 500 : 400,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 2, background: on ? p.couleur : 'var(--color-border)' }} />
              {p.label}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${postes.length + (postes.length > 1 ? 1 : 0)}, 1fr)`, gap: 8 }}>
        {postes.map(p => (
          <KpiCard
            key={p.id}
            label={`${p.label} · ${primary}`}
            value={fmtEur(total(p, primary))}
            sub={diffLabel(total(p, primary), total(p, ref), ref)}
            subColor={diffColor(total(p, primary), total(p, ref), true)}
          />
        ))}
        {postes.length > 1 && (
          <KpiCard
            label={`Total sélection · ${primary}`}
            value={fmtEur(totalSel(primary))}
            sub={diffLabel(totalSel(primary), totalSel(ref), ref)}
            subColor={diffColor(totalSel(primary), totalSel(ref), true)}
          />
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
          Total par année — {periode}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dataAnnees}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="annee" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, id) => [fmtEur(v), nomPoste(id)]} />
            {postes.map((p, i) => (
              <Bar key={p.id} dataKey={p.id} stackId="postes" fill={p.couleur} radius={i === postes.length - 1 ? [3,3,0,0] : 0} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
          Évolution mois par mois — {periode}, {years.join(', ')}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dataTemps}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, id) => [fmtEur(v), nomPoste(id)]} />
            {postes.map(p => (
              <Line key={p.id} type="monotone" dataKey={p.id} stroke={p.couleur} strokeWidth={2} dot={{ r: 2 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>{periode}</th>
              {years.map(y => <th key={y} style={th}>{y}</th>)}
              <th style={th}>{primary} vs {ref}</th>
            </tr>
          </thead>
          <tbody>
            {postes.map(p => (
              <tr key={p.id}>
                <td style={{ ...td, textAlign: 'left' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: p.couleur, marginRight: 6 }} />
                  {p.label}
                </td>
                {years.map(y => <td key={y} style={td}>{fmtEur(total(p, y))}</td>)}
                <td style={{ ...td, color: diffColor(total(p, primary), total(p, ref), true) === 'down' ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {diffLabel(total(p, primary), total(p, ref), ref)}
                </td>
              </tr>
            ))}
            {postes.length > 1 && (
              <tr>
                <td style={{ ...td, textAlign: 'left', fontWeight: 500 }}>Total sélection</td>
                {years.map(y => <td key={y} style={{ ...td, fontWeight: 500 }}>{fmtEur(totalSel(y))}</td>)}
                <td style={{ ...td, fontWeight: 500, color: diffColor(totalSel(primary), totalSel(ref), true) === 'down' ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {diffLabel(totalSel(primary), totalSel(ref), ref)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ ...cardStyle, background: '#EEEDFE', border: '0.5px solid #AFA9EC' }}>
        <div style={{ fontSize: 12, color: '#3C3489', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>ℹ</span>
          <span>Montants virés depuis le compte : salaires nets des CDI, salaires des IADE en CDD, honoraires et frais des MAR remplaçants. Les charges sociales (URSSAF, retraite, prévoyance) n'y sont pas, elles sont dans « Dépenses ».</span>
        </div>
      </div>
    </div>
  )
}
