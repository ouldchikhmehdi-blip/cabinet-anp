import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import EtatCompta from '../components/EtatCompta'
import { useCompta } from '../data/compta'
import { usePeriode } from '../data/periode'
import { MOIS_COURT, fmtEur, sum, diffLabel, diffColor, getMasqueMontants, couleurAnnee, ordreAffichage } from '../data/mockData'

const ACCENT = '#534AB7'

function LegendAnnees({ years }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {ordreAffichage(years).map(({ y, rang }) => (
        <span key={y} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: couleurAnnee(rang, ACCENT), borderRadius: 2 }} />
          {y}
        </span>
      ))}
    </div>
  )
}

// Page en lecture seule : la liste des salariés vient du dictionnaire de règles (iade_cdi),
// le coût des virements classés « Salaire IADE CDI ». Même filtre de période que les
// autres pages finance : les montants sont ceux des mois choisis, années comparées.
export default function SalariesCDI() {
  const etat = useCompta()
  const S = etat.series
  const SALARIES = S.SALARIES
  const P = usePeriode(S.ANNEES)
  const { de, a, primary, ref, years } = P

  // Salarié sélectionné : le premier de la liste à chaque changement de liste.
  const idsCle = SALARIES.map(s => s.id).join('|')
  const [selectedId, setSelectedId] = useState(idsCle.split('|')[0] || null)
  const [idsVus, setIdsVus] = useState(idsCle)
  if (idsVus !== idsCle) {
    setIdsVus(idsCle)
    setSelectedId(idsCle.split('|')[0] || null)
  }

  const selected = SALARIES.find(s => s.id === selectedId) || SALARIES[0] || null
  const masque = getMasqueMontants()
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]

  const coutPeriode = (s, y) => sum((s.mensuel[y] || []).slice(de, a + 1))
  const totalCdi = (y) => sum((S.SALAIRES_CDI[y] || []).slice(de, a + 1))
  const tPrimary = totalCdi(primary)
  const tRef = totalCdi(ref)
  const sPrimary = selected ? coutPeriode(selected, primary) : 0
  const sRef = selected ? coutPeriode(selected, ref) : 0

  const dataMensuel = MOIS_COURT.slice(de, a + 1).map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = selected ? (selected.mensuel[y] || [])[de + i] ?? 0 : 0 })
    return row
  })

  const cardStyle = {
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '14px 16px',
  }

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <h1 style={{ fontSize: 18, fontWeight: 500 }}>Salariés CDI</h1>

      <EtatCompta etat={etat} />

      <PeriodeFilter
        moisDe={P.moisDe} setMoisDe={P.setMoisDe}
        moisA={P.moisA} setMoisA={P.setMoisA}
        years={P.years} setYears={P.setYears}
        shortcut={P.shortcut} setShortcut={P.setShortcut}
        availableYears={S.ANNEES}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <KpiCard label={`Total salaires CDI · ${primary}`} value={fmtEur(tPrimary)} sub={periode} subColor="neutral" />
        {ref !== undefined && <KpiCard label={`Total salaires CDI · ${ref}`} value={fmtEur(tRef)} sub={diffLabel(tPrimary, tRef, ref)} subColor={diffColor(tPrimary, tRef, true)} />}
      </div>

      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, letterSpacing: '0.04em' }}>
        CDI — cliquez sur un salarié pour le détail · coût {periode} {primary}
      </span>

      {SALARIES.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          Aucun salarié CDI — renseignez la liste des IADE en CDI dans « Règles virements ».
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
          {SALARIES.map(s => {
            const isSel = selected && selected.id === s.id
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                style={{
                  background: isSel ? 'var(--color-primary-light)' : 'var(--color-surface)',
                  border: isSel ? '1.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '7px 9px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 24, height: 24, flexShrink: 0, borderRadius: '50%',
                  background: isSel ? '#AFA9EC' : 'var(--color-primary-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 500,
                  color: isSel ? '#26215C' : 'var(--color-primary)',
                }}>
                  {s.initiales}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nom}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{fmtEur(coutPeriode(s, primary))}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: '#AFA9EC', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 11, fontWeight: 500, color: '#26215C'
            }}>
              {selected.initiales}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{selected.nom}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{selected.poste} · {selected.type || 'CDI'}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
            <KpiCard label={`Coût · ${primary}`} value={fmtEur(sPrimary)} sub={periode} subColor="neutral" />
            {ref !== undefined && <KpiCard label={`Coût · ${ref}`} value={fmtEur(sRef)} sub={diffLabel(sPrimary, sRef, ref)} subColor={diffColor(sPrimary, sRef, true)} />}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
              Coût mensuel — {periode}
            </span>
            <LegendAnnees years={years} />
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart key={years.join('-')} data={dataMensuel}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(1)+'k'} hide={masque} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
              {ordreAffichage(years).map(({ y, rang }) => (
                <Bar key={y} dataKey={y} fill={couleurAnnee(rang, ACCENT)} radius={[3,3,0,0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ ...cardStyle, background: '#EEEDFE', border: '0.5px solid #AFA9EC' }}>
        <div style={{ fontSize: 12, color: '#3C3489', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>ℹ</span>
          <span>La liste vient du dictionnaire de règles (Règles virements, liste des IADE en CDI) ; le coût = virements de salaire classés « Salaire IADE CDI » (salaire net viré, hors charges sociales).</span>
        </div>
      </div>
    </div>
  )
}
