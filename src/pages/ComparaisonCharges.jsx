import { useState } from 'react'
import { BarChart, Bar, LineChart, Line, ComposedChart, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import EtatCompta from '../components/EtatCompta'
import BoutonExport from '../components/BoutonExport'
import { entreeReleve } from '../utils/exportReleve'
import { useCompta } from '../data/compta'
import { usePeriode } from '../data/periode'
import { POSTES, dansPostes } from '../data/postesSalariaux'
import { MOIS_COURT, fmtEur, sum, diffLabel, diffColor, getMasqueMontants, couleurAnnee, ordreAffichage } from '../data/mockData'
import { echelle, axeK, sansMoisFuturs } from '../utils/echelle'


const ACCENT_CUMUL = '#534AB7'
const TOOLTIP = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }

// Infobulle de l'histogramme : chaque poste et la somme de la colonne
function InfoTotal({ active, payload, label, periode }) {
  if (!active || !payload?.length) return null
  const somme = payload.reduce((n, e) => n + (Number(e.value) || 0), 0)
  return (
    <div style={{ ...TOOLTIP, padding: '8px 10px' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label} · {periode}</div>
      {[...payload].reverse().map(e => (
        <div key={e.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
          <span style={{ color: e.color }}>{POSTES.find(p => p.id === e.dataKey)?.label ?? e.dataKey}</span><span>{fmtEur(e.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, borderTop: '0.5px solid #d3d1c7', marginTop: 4, paddingTop: 4, fontWeight: 600 }}>
          <span>Total</span><span>{fmtEur(somme)}</span>
        </div>
      )}
      <div style={{ fontSize: 10, color: '#888780', marginTop: 4 }}>Cliquez pour le détail</div>
    </div>
  )
}

// Comparaison dans le temps des postes (CDI, rempla IADE, rempla MAR, cotisations), sur les mois et années choisis.
// Chaque poste se coche ou se décoche ; il en reste toujours au moins un.
export default function ComparaisonCharges() {
  const etat = useCompta()
  const S = etat.series
  const P = usePeriode(S.ANNEES)
  const { de, a, primary, ref, years } = P
  const [actifs, setActifs] = useState(POSTES.map(p => p.id))
  // Année ouverte en détail (clic sur l'histogramme) ; par défaut l'année principale
  const [anneeChoisie, setAnneeChoisie] = useState(null)

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
    // Mois pas encore écoulés : null, la courbe s'arrête au dernier mois connu
    postes.forEach(p => { row[p.id] = de + i > S.moisActuel(y) ? null : (mois(p, y)[i] ?? 0) })
    return row
  }))

  const anneeDetail = years.includes(anneeChoisie) ? anneeChoisie : primary
  const choisirColonne = (st) => {
    const i = Number(st?.activeTooltipIndex)
    if (Number.isInteger(i) && years[i] !== undefined) setAnneeChoisie(years[i])
  }
  // Coût de chaque mois (postes cochés) et cumul depuis le début de la période, une série par année
  const totalMois = (y, i) => sum(postes.map(p => mois(p, y)[i] ?? 0))
  const dataCumul = sansMoisFuturs(MOIS_COURT.slice(de, a + 1).map((m, i) => {
    const row = { mois: m }
    years.forEach(y => {
      row[`m${y}`] = Math.round(totalMois(y, i) * 100) / 100
      row[`c${y}`] = Math.round(sum(Array.from({ length: i + 1 }, (_, k) => totalMois(y, k))) * 100) / 100
    })
    return row
  }), S, de)
  const totalDetail = totalSel(anneeDetail)

  const tooltipStyle = TOOLTIP
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }
  const nomPoste = (id) => POSTES.find(p => p.id === id)?.label ?? (id === 'cumul' ? 'Cumul' : id)

  const th = { fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', textAlign: 'right', padding: '6px 8px', borderBottom: '0.5px solid var(--color-border)' }
  const td = { fontSize: 12, textAlign: 'right', padding: '6px 8px', borderBottom: '0.5px solid var(--color-border)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Comparaison des charges salariales</h1>
        <BoutonExport
          exports={[entreeReleve({ label: 'Lignes du relevé des postes cochés', page: 'charges-salariales', transactions: etat.transactions, years, de, a, filtre: t => dansPostes(postes, t) })]}
          disabled={masque}
        />
      </div>

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
          Total par année — {periode} · cliquez sur une année pour le détail
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dataAnnees} onClick={choisirColonne} style={{ cursor: 'pointer' }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="annee" tick={{ fontSize: 11 }} />
            <YAxis {...echelle(dataAnnees, { empile: true })} tick={{ fontSize: 11 }} tickFormatter={axeK} hide={masque} />
            <Tooltip content={<InfoTotal periode={periode} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            {postes.map((p, i) => (
              <Bar key={p.id} dataKey={p.id} stackId="postes" fill={p.couleur} radius={i === postes.length - 1 ? [3,3,0,0] : 0}>
                {dataAnnees.map(d => <Cell key={d.annee} fillOpacity={Number(d.annee) === anneeDetail ? 1 : 0.4} />)}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...cardStyle, border: '1px solid var(--color-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Détail {anneeDetail} — {periode}</span>
          <span style={{ fontSize: 20, fontWeight: 600 }}>{fmtEur(totalDetail)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {postes.map(p => {
            const v = total(p, anneeDetail)
            return (
              <div key={p.id} style={{ flex: '1 1 150px', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: '8px 10px', borderLeft: `3px solid ${p.couleur}` }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{p.label}</div>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{fmtEur(v)}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  {totalDetail ? Math.round(v / totalDetail * 100) : 0} % du total
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Coût par mois (barres) et cumul (courbes) — {years.join(', ')}
          </span>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {ordreAffichage(years).map(({ y, rang }) => (
              <span key={y} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: couleurAnnee(rang, ACCENT_CUMUL), borderRadius: 2 }} />
                {y}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart key={years.join('-')} data={dataCumul}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis {...echelle(dataCumul, { cles: k => /^m\d{4}$/.test(k) })} yAxisId="mois" tick={{ fontSize: 11 }} tickFormatter={axeK} hide={masque} />
            <YAxis {...echelle(dataCumul, { cles: k => /^c\d{4}$/.test(k) })} yAxisId="cumul" orientation="right" tick={{ fontSize: 11 }} tickFormatter={axeK} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, nom) => [fmtEur(v), nom]} />
            {ordreAffichage(years).map(({ y, rang }) => (
              <Bar key={`m${y}`} yAxisId="mois" dataKey={`m${y}`} name={`${y} · mois`} fill={couleurAnnee(rang, ACCENT_CUMUL)} fillOpacity={0.55} radius={[3,3,0,0]} />
            ))}
            {ordreAffichage(years).map(({ y, rang }) => (
              <Line
                key={`c${y}`}
                yAxisId="cumul"
                type="monotone"
                dataKey={`c${y}`}
                name={`${y} · cumul`}
                stroke={couleurAnnee(rang, ACCENT_CUMUL)}
                strokeWidth={rang === 0 ? 2.5 : 1.5}
                strokeDasharray={rang === 0 ? undefined : '5 4'}
                dot={{ r: rang === 0 ? 3 : 2 }}
              />
            ))}
          </ComposedChart>
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
            <YAxis {...echelle(dataTemps)} tick={{ fontSize: 11 }} tickFormatter={axeK} hide={masque} />
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
              {ref !== undefined && <th style={th}>{primary} vs {ref}</th>}
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
                {ref !== undefined && (
                  <td style={{ ...td, color: diffColor(total(p, primary), total(p, ref), true) === 'down' ? 'var(--color-danger)' : 'var(--color-success)' }}>
                    {diffLabel(total(p, primary), total(p, ref), ref)}
                  </td>
                )}
              </tr>
            ))}
            {postes.length > 1 && (
              <tr>
                <td style={{ ...td, textAlign: 'left', fontWeight: 500 }}>Total sélection</td>
                {years.map(y => <td key={y} style={{ ...td, fontWeight: 500 }}>{fmtEur(totalSel(y))}</td>)}
                {ref !== undefined && (
                  <td style={{ ...td, fontWeight: 500, color: diffColor(totalSel(primary), totalSel(ref), true) === 'down' ? 'var(--color-danger)' : 'var(--color-success)' }}>
                    {diffLabel(totalSel(primary), totalSel(ref), ref)}
                  </td>
                )}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ ...cardStyle, background: '#EEEDFE', border: '0.5px solid #AFA9EC' }}>
        <div style={{ fontSize: 12, color: '#3C3489', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>ℹ</span>
          <span>Montants virés depuis le compte : salaires nets des CDI, salaires des IADE en CDD, honoraires et frais des MAR remplaçants, et cotisations et charges (URSSAF, retraite, prévoyance et mutuelle, épargne salariale, médecine du travail, impôts et taxes), qui restent aussi dans « Dépenses ».</span>
        </div>
      </div>
    </div>
  )
}
