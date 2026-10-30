import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import EtatCompta from '../components/EtatCompta'
import { useCompta } from '../data/compta'
import { MOIS_COURT, fmtEur, pct, diffLabel, getMasqueMontants } from '../data/mockData'

// Page en lecture seule : la liste des salariés vient du dictionnaire de règles (iade_cdi),
// le coût des virements classés « Salaire IADE CDI ».
export default function SalariesCDI() {
  const etat = useCompta()
  const S = etat.series
  const SALARIES = S.SALARIES

  // Années comparées : les deux plus récentes, resynchronisées quand la liste change
  // (état réinitialisé pendant le rendu, sans effet).
  const anneesCle = S.ANNEES.join(',')
  const [year1, setYear1] = useState(S.ANNEES[0])
  const [year2, setYear2] = useState(S.ANNEES[1])
  const [anneesVues, setAnneesVues] = useState(anneesCle)
  if (anneesVues !== anneesCle) {
    const [a0, a1] = anneesCle.split(',').map(Number)
    setAnneesVues(anneesCle)
    setYear1(a0)
    setYear2(a1)
  }

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

  const coutN = selected ? (selected.couts[year1] || 0) : 0
  const coutN1 = selected ? (selected.couts[year2] || 0) : 0
  const mensuelN = selected ? (selected.mensuel[year1] || Array(12).fill(0)) : Array(12).fill(0)
  const moisActuel = S.moisActuel(year1)
  const cumulAujourdhui = mensuelN.slice(0, moisActuel + 1).reduce((s, v) => s + v, 0)
  const dataMensuel = MOIS_COURT.map((m, i) => ({ mois: m, montant: mensuelN[i] ?? 0 }))

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

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Salariés CDI</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select style={selectStyle} value={year1} onChange={e => setYear1(Number(e.target.value))}>
            {S.ANNEES.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>vs</span>
          <select style={selectStyle} value={year2} onChange={e => setYear2(Number(e.target.value))}>
            {S.ANNEES.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <EtatCompta etat={etat} />

      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, letterSpacing: '0.04em' }}>
        CDI — cliquez sur un salarié pour le détail
      </span>

      {SALARIES.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          Aucun salarié CDI — renseignez la liste des IADE en CDI dans « Règles virements ».
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
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
                  padding: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: isSel ? '#AFA9EC' : 'var(--color-primary-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 500,
                  color: isSel ? '#26215C' : 'var(--color-primary)',
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
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{selected.poste}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
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
                Jan → {MOIS_COURT[moisActuel]} {year1} ({moisActuel + 1} mois)
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            Coût mensuel · {year1}
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={dataMensuel}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(1)+'k'} hide={masque} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
              <Bar dataKey="montant" name="Coût" fill="#534AB7" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ ...cardStyle, background: '#EEEDFE', border: '0.5px solid #AFA9EC' }}>
        <div style={{ fontSize: 12, color: '#3C3489', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>ℹ</span>
          <span>La liste vient du dictionnaire de règles (Règles virements, liste des IADE en CDI) ; le coût = virements de salaire classés « Salaire IADE CDI ».</span>
        </div>
      </div>
    </div>
  )
}
