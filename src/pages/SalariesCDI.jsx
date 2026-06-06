import { useState } from 'react'
import { SALARIES, MOIS_COURT, ANNEES, fmtEur, pct, diffLabel, diffColor, MOIS_ACTUEL } from '../data/mockData'
import KpiCard from '../components/KpiCard'

export default function SalariesCDI() {
  const [selected, setSelected] = useState(SALARIES[0])
  const [year1, setYear1] = useState(2024)
  const [year2, setYear2] = useState(2023)

  const coutN = selected.couts[year1] || 0
  const coutN1 = selected.couts[year2] || 0
  const cumulAujourdhui = Math.round(coutN / 12 * (MOIS_ACTUEL + 1))

  const selectStyle = {
    fontSize: 12, padding: '4px 6px',
    borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
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
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Salariés CDI</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select style={selectStyle} value={year1} onChange={e => setYear1(Number(e.target.value))}>
            {ANNEES.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>vs</span>
          <select style={selectStyle} value={year2} onChange={e => setYear2(Number(e.target.value))}>
            {ANNEES.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, letterSpacing: '0.04em' }}>
        CDI — cliquez sur un salarié pour le détail
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {SALARIES.map(s => (
          <button
            key={s.id}
            onClick={() => setSelected(s)}
            style={{
              background: selected.id === s.id ? 'var(--color-primary-light)' : 'var(--color-surface)',
              border: selected.id === s.id ? '1.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: selected.id === s.id ? '#AFA9EC' : 'var(--color-primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 500,
              color: selected.id === s.id ? '#26215C' : 'var(--color-primary)',
              marginBottom: 8
            }}>
              {s.initiales}
            </div>
            <div style={{ fontSize: 11, background: '#E1F5EE', color: '#085041', padding: '1px 6px', borderRadius: 10, display: 'inline-block', marginBottom: 4 }}>
              CDI
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{s.nom}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 8 }}>{s.poste}</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>
              {fmtEur(s.couts[year1] || 0)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>coût employeur {year1}</div>
          </button>
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: '#AFA9EC', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 11, fontWeight: 500, color: '#26215C'
          }}>
            {selected.initiales}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{selected.nom}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{selected.poste}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 3 }}>
              Coût total {year1}
            </div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtEur(coutN)}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>année complète</div>
          </div>
          <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 3 }}>
              Coût total {year2}
            </div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtEur(coutN1)}</div>
            <div style={{
              fontSize: 10, marginTop: 2,
              color: parseFloat(pct(coutN, coutN1)) > 0 ? 'var(--color-danger)' : 'var(--color-success)'
            }}>
              {diffLabel(coutN, coutN1, year2)}
            </div>
          </div>
          <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 3 }}>
              Coût cumulé Jan → aujourd'hui
            </div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtEur(cumulAujourdhui)}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
              Jan → {MOIS_COURT[MOIS_ACTUEL]} ({MOIS_ACTUEL + 1} mois)
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, background: '#EEEDFE', border: '0.5px solid #AFA9EC' }}>
        <div style={{ fontSize: 12, color: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>ℹ</span>
          <span>Pour ajouter, modifier ou clôturer un contrat, utilisez le panneau d'administration (à venir).</span>
        </div>
      </div>
    </div>
  )
}