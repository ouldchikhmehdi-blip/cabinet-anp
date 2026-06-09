import { useState, useEffect } from 'react'
import { SALARIES, MOIS_COURT, ANNEES, fmtEur, pct, diffLabel, MOIS_ACTUEL } from '../data/mockData'
import { charger, sauver } from '../utils/stockage'

const initialesDe = (nom) =>
  nom.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

export default function SalariesCDI() {
  const [salaries, setSalaries] = useState(() => charger('sarm:salaries', SALARIES))
  const [selectedId, setSelectedId] = useState(salaries[0]?.id ?? null)
  const [year1, setYear1] = useState(2024)
  const [year2, setYear2] = useState(2023)

  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const [fNom, setFNom] = useState('')
  const [fPoste, setFPoste] = useState('IADE · temps plein')
  const [fc, setFc] = useState({ 2024: '', 2023: '', 2022: '' })

  useEffect(() => sauver('sarm:salaries', salaries), [salaries])

  const selected = salaries.find(s => s.id === selectedId) || salaries[0] || null

  const coutN = selected ? (selected.couts[year1] || 0) : 0
  const coutN1 = selected ? (selected.couts[year2] || 0) : 0
  const cumulAujourdhui = Math.round(coutN / 12 * (MOIS_ACTUEL + 1))

  const ajouterSalarie = () => {
    if (!fNom.trim()) return
    const nouveau = {
      id: Date.now(),
      initiales: initialesDe(fNom),
      nom: fNom.trim(),
      poste: fPoste.trim(),
      type: 'CDI',
      couts: { 2022: Number(fc[2022]) || 0, 2023: Number(fc[2023]) || 0, 2024: Number(fc[2024]) || 0 },
    }
    setSalaries(prev => [...prev, nouveau])
    setSelectedId(nouveau.id)
    setFNom(''); setFPoste('IADE · temps plein'); setFc({ 2024: '', 2023: '', 2022: '' })
    setAjoutOuvert(false)
  }

  const retirer = (id) => {
    setSalaries(prev => prev.filter(s => s.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

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

  const champStyle = { ...selectStyle, padding: '6px 8px' }

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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, letterSpacing: '0.04em' }}>
          CDI — cliquez sur un salarié pour le détail
        </span>
        <button
          onClick={() => setAjoutOuvert(o => !o)}
          style={{
            fontSize: 11, padding: '4px 10px',
            borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-border)',
            background: ajoutOuvert ? 'var(--color-primary-light)' : 'var(--color-surface)',
            color: ajoutOuvert ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)', cursor: 'pointer',
          }}
        >
          + Ajouter un salarié CDI
        </button>
      </div>

      {ajoutOuvert && (
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input style={{ ...champStyle, flex: 1, minWidth: 150 }} placeholder="Nom (ex. Julie P.)" value={fNom} onChange={e => setFNom(e.target.value)} />
          <input style={{ ...champStyle, flex: 1, minWidth: 150 }} placeholder="Poste" value={fPoste} onChange={e => setFPoste(e.target.value)} />
          <input style={{ ...champStyle, width: 110 }} type="number" placeholder={`Coût ${year1}`} value={fc[2024]} onChange={e => setFc(p => ({ ...p, 2024: e.target.value }))} />
          <input style={{ ...champStyle, width: 110 }} type="number" placeholder="Coût 2023" value={fc[2023]} onChange={e => setFc(p => ({ ...p, 2023: e.target.value }))} />
          <input style={{ ...champStyle, width: 110 }} type="number" placeholder="Coût 2022" value={fc[2022]} onChange={e => setFc(p => ({ ...p, 2022: e.target.value }))} />
          <button
            onClick={ajouterSalarie}
            disabled={!fNom.trim()}
            style={{
              fontSize: 11, padding: '6px 14px', borderRadius: 'var(--radius-md)',
              border: '0.5px solid #1D9E75',
              background: fNom.trim() ? '#E1F5EE' : 'var(--color-bg)',
              color: fNom.trim() ? '#085041' : 'var(--color-text-tertiary)',
              cursor: fNom.trim() ? 'pointer' : 'default',
            }}
          >
            Ajouter
          </button>
        </div>
      )}

      {salaries.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          Aucun salarié CDI — ajoutez-en un avec le bouton ci-dessus.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {salaries.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              style={{
                background: selected && selected.id === s.id ? 'var(--color-primary-light)' : 'var(--color-surface)',
                border: selected && selected.id === s.id ? '1.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: selected && selected.id === s.id ? '#AFA9EC' : 'var(--color-primary-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 500,
                color: selected && selected.id === s.id ? '#26215C' : 'var(--color-primary)',
                marginBottom: 8
              }}>
                {s.initiales}
              </div>
              <div style={{ fontSize: 11, background: '#E1F5EE', color: '#085041', padding: '1px 6px', borderRadius: 10, display: 'inline-block', marginBottom: 4 }}>
                {s.type || 'CDI'}
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
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{selected.poste}</div>
            </div>
            <button onClick={() => retirer(selected.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius-md)', border: '0.5px solid #F09595', background: 'transparent', color: '#A32D2D', cursor: 'pointer' }}>
              Retirer ce salarié
            </button>
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
      )}

      <div style={{ ...cardStyle, background: '#EEEDFE', border: '0.5px solid #AFA9EC' }}>
        <div style={{ fontSize: 12, color: '#3C3489', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>ℹ</span>
          <span>Les ajouts et retraits sont enregistrés sur cet appareil. Pour relier un virement à un salarié, ajoutez la règle correspondante dans « Virements / Règles virements ».</span>
        </div>
      </div>
    </div>
  )
}
