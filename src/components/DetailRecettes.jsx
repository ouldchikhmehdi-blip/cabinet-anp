import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { SOURCES, detailRecettes, versementsDe } from '../data/recettes'
import { MOIS_COURT, MOIS_LONG, fmtEur, sum } from '../data/mockData'
import { echelle, axeK } from '../utils/echelle'

const nomSource = Object.fromEntries(SOURCES.map(s => [s.id, s.nom]))
const td = { padding: '5px 8px', fontSize: 12, textAlign: 'right', borderTop: '0.5px solid var(--color-border)', whiteSpace: 'nowrap' }
const th = { ...td, borderTop: 'none', color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 11 }
const cliquable = { cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3 }

// Détail du CA de la page « Chiffre d'affaires » : mois par mois et par source de versement
// (cliniques, tiers payant, CPAM hors tiers payant), le tiers payant par caisse, et la liste des
// virements derrière chaque case (clic sur un montant).
export default function DetailRecettes({ transactions, annee, anneeRef, de, a, periode, masque, cardStyle, tooltipStyle, moisMax }) {
  const [selection, setSelection] = useState(null) // { mois, source | famille | caisse, titre }
  const [ouvertes, setOuvertes] = useState(() => new Set())
  const d = detailRecettes(transactions, annee)
  const dRef = anneeRef !== undefined ? detailRecettes(transactions, anneeRef) : null
  const moisPeriode = []
  for (let m = de; m <= a && m <= moisMax; m++) moisPeriode.push(m)

  const dataBar = moisPeriode.map(m => {
    const row = { mois: MOIS_COURT[m] }
    for (const s of SOURCES) row[s.id] = d.parSource[s.id][m]
    return row
  })
  const totalSource = (id) => sum(moisPeriode.map(m => d.parSource[id][m]))
  const totalPeriode = sum(moisPeriode.map(m => d.total[m]))
  const totalRef = dRef ? sum(moisPeriode.map(m => dRef.total[m])) : 0

  const choisir = (sel) => setSelection(s => (s && s.cle === sel.cle ? null : sel))
  const montant = (v, sel) => (v === 0
    ? <span style={{ color: 'var(--color-text-tertiary)' }}>–</span>
    : <span style={cliquable} onClick={() => choisir(sel)}>{fmtEur(v)}</span>)
  const basculer = (id) => setOuvertes(o => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const lignesSel = selection ? versementsDe(transactions, { annee, ...selection.filtre }) : []

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Détail mensuel par source — {annee}</span>
        <span style={{ flex: 1, borderTop: '0.5px solid var(--color-border)' }} />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>CA mensuel par source · {annee} · {periode}</span>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {SOURCES.map(s => (
              <span key={s.id} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: s.couleur, display: 'inline-block' }} />{s.nom}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dataBar}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis {...echelle(dataBar, { empile: true })} tick={{ fontSize: 11 }} tickFormatter={axeK} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, id) => [fmtEur(v), nomSource[id] || id]} />
            {SOURCES.map((s, i) => (
              <Bar key={s.id} dataKey={s.id} stackId="src" fill={s.couleur} radius={i === SOURCES.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...cardStyle, padding: '8px 4px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Mois {annee}</th>
              {SOURCES.map(s => <th key={s.id} style={th}>{s.nom}</th>)}
              <th style={th}>Total CA</th>
              {dRef && <th style={th}>Total {anneeRef}</th>}
              {dRef && <th style={th}>Écart</th>}
            </tr>
          </thead>
          <tbody>
            {moisPeriode.map(m => {
              const ecart = d.total[m] - (dRef ? dRef.total[m] : 0)
              return (
                <tr key={m}>
                  <td style={{ ...td, textAlign: 'left' }}>{MOIS_LONG[m]}</td>
                  {SOURCES.map(s => (
                    <td key={s.id} style={td}>{montant(d.parSource[s.id][m], { cle: `${m}-${s.id}`, filtre: { mois: m, source: s.id }, titre: `${s.nom} · ${MOIS_LONG[m]} ${annee}` })}</td>
                  ))}
                  <td style={{ ...td, fontWeight: 500 }}>{fmtEur(d.total[m])}</td>
                  {dRef && <td style={td}>{fmtEur(dRef.total[m])}</td>}
                  {dRef && <td style={{ ...td, color: ecart >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{(ecart >= 0 ? '+' : '') + fmtEur(ecart)}</td>}
                </tr>
              )
            })}
            <tr style={{ fontWeight: 600 }}>
              <td style={{ ...td, textAlign: 'left' }}>Total</td>
              {SOURCES.map(s => <td key={s.id} style={td}>{fmtEur(totalSource(s.id))}</td>)}
              <td style={td}>{fmtEur(totalPeriode)}</td>
              {dRef && <td style={td}>{fmtEur(totalRef)}</td>}
              {dRef && <td style={{ ...td, color: totalPeriode - totalRef >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{(totalPeriode - totalRef >= 0 ? '+' : '') + fmtEur(totalPeriode - totalRef)}</td>}
            </tr>
            <tr>
              <td style={{ ...td, textAlign: 'left', color: 'var(--color-text-secondary)' }}>Part du CA</td>
              {SOURCES.map(s => <td key={s.id} style={{ ...td, color: 'var(--color-text-secondary)' }}>{totalPeriode ? Math.round(totalSource(s.id) / totalPeriode * 100) + ' %' : '–'}</td>)}
              <td style={td} />
              {dRef && <td style={td} />}
              {dRef && <td style={td} />}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ ...cardStyle, padding: '8px 4px', overflowX: 'auto' }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', padding: '4px 8px 8px' }}>
          Tiers payant par caisse · {annee} · {periode} — cliquez une famille pour voir ses caisses
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Payeur</th>
              {moisPeriode.map(m => <th key={m} style={th}>{MOIS_COURT[m]}</th>)}
              <th style={th}>Total</th>
              <th style={th}>Virements</th>
            </tr>
          </thead>
          <tbody>
            {d.familles.length === 0 && (
              <tr><td colSpan={moisPeriode.length + 3} style={{ ...td, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Aucun versement de tiers payant sur l'année.</td></tr>
            )}
            {d.familles.map(f => {
              const ouverte = ouvertes.has(f.id)
              return [
                <tr key={f.id} style={{ fontWeight: 500 }}>
                  <td style={{ ...td, textAlign: 'left', cursor: 'pointer' }} onClick={() => basculer(f.id)}>
                    {ouverte ? '▾' : '▸'} {f.nom} <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>({f.caisses.length})</span>
                  </td>
                  {moisPeriode.map(m => <td key={m} style={td}>{montant(f.mois[m], { cle: `${m}-f-${f.id}`, filtre: { mois: m, famille: f.id }, titre: `${f.nom} · ${MOIS_LONG[m]} ${annee}` })}</td>)}
                  <td style={td}>{fmtEur(sum(moisPeriode.map(m => f.mois[m])))}</td>
                  <td style={td}>{f.caisses.reduce((s, c) => s + c.n, 0)}</td>
                </tr>,
                ...(ouverte ? f.caisses.map(c => (
                  <tr key={`${f.id}-${c.nom}`} style={{ color: 'var(--color-text-secondary)' }}>
                    <td style={{ ...td, textAlign: 'left', paddingLeft: 26 }}>{c.nom}</td>
                    {moisPeriode.map(m => <td key={m} style={td}>{montant(c.mois[m], { cle: `${m}-c-${c.nom}`, filtre: { mois: m, caisse: c.nom }, titre: `${c.nom} · ${MOIS_LONG[m]} ${annee}` })}</td>)}
                    <td style={td}>{fmtEur(sum(moisPeriode.map(m => c.mois[m])))}</td>
                    <td style={td}>{c.n}</td>
                  </tr>
                )) : []),
              ]
            })}
          </tbody>
        </table>
      </div>

      {selection && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
              Virements · {selection.titre} · {lignesSel.length} ligne{lignesSel.length > 1 ? 's' : ''} · {fmtEur(sum(lignesSel.map(t => t.montant)))}
            </span>
            <button type="button" onClick={() => setSelection(null)} style={{ background: 'none', border: '0.5px solid var(--color-border)', borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>Fermer</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Date</th>
                <th style={{ ...th, textAlign: 'left' }}>Payeur</th>
                <th style={{ ...th, textAlign: 'left' }}>Libellé</th>
                <th style={th}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {lignesSel.map((t, i) => (
                <tr key={t.fitid || i}>
                  <td style={{ ...td, textAlign: 'left' }}>{t.date.split('-').reverse().join('/')}</td>
                  <td style={{ ...td, textAlign: 'left' }}>{t.tiers}</td>
                  <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', color: 'var(--color-text-secondary)', fontSize: 11 }}>{t.libelle}</td>
                  <td style={td}>{fmtEur(t.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
