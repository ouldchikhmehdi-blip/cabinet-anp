import { useState } from 'react'
import { ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import EtatCompta from '../components/EtatCompta'
import BoutonExport from '../components/BoutonExport'
import { entreeReleve } from '../utils/exportReleve'
import { useCompta } from '../data/compta'
import { usePeriode } from '../data/periode'
import { POSTES, dansPostes } from '../data/postesSalariaux'
import { MOIS_COURT, MOIS_LONG, fmtEur, sum, diffLabel, diffColor, getMasqueMontants } from '../data/mockData'

const TOOLTIP = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }

// Infobulle : chaque poste du mois et le total qui est parti
function InfoMois({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const postes = payload.filter(e => POSTES.some(p => p.id === e.dataKey))
  const ref = payload.find(e => e.dataKey === 'totalRef')
  return (
    <div style={{ ...TOOLTIP, padding: '8px 10px' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {[...postes].reverse().map(e => (
        <div key={e.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
          <span style={{ color: e.color }}>{POSTES.find(p => p.id === e.dataKey).label}</span><span>{fmtEur(e.value)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, borderTop: '0.5px solid #d3d1c7', marginTop: 4, paddingTop: 4, fontWeight: 600 }}>
        <span>Total</span><span>{fmtEur(sum(postes.map(e => Number(e.value) || 0)))}</span>
      </div>
      {ref && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, color: '#888780' }}><span>{ref.name}</span><span>{fmtEur(ref.value)}</span></div>}
      <div style={{ fontSize: 10, color: '#888780', marginTop: 4 }}>Cliquez pour le détail du mois</div>
    </div>
  )
}

// Suivi mensuel de tout ce qui part pour le personnel : salaires CDI, rempla IADE, rempla MAR,
// cotisations et charges. Un clic sur un mois ouvre le détail : chaque poste, ses catégories,
// et les lignes du relevé.
export default function SuiviMensuelCharges() {
  const etat = useCompta()
  const S = etat.series
  const P = usePeriode(S.ANNEES)
  const { de, a, primary, ref, years } = P
  const [actifs, setActifs] = useState(POSTES.map(p => p.id))
  const [moisChoisi, setMoisChoisi] = useState(null)
  const [ouvert, setOuvert] = useState(null) // catégorie dépliée dans le détail

  const masque = getMasqueMontants()
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]
  const postes = POSTES.filter(p => actifs.includes(p.id))
  const basculer = (id) => setActifs(l => l.includes(id) ? (l.length > 1 ? l.filter(x => x !== id) : l) : [...l, id])

  const val = (p, y, m) => (S[p.serie][y] || [])[m] ?? 0
  const totalMois = (y, m) => sum(postes.map(p => val(p, y, m)))
  const moisPeriode = Array.from({ length: a - de + 1 }, (_, i) => de + i)
  const tPrimary = sum(moisPeriode.map(m => totalMois(primary, m)))
  const tRef = ref !== undefined ? sum(moisPeriode.map(m => totalMois(ref, m))) : 0

  const data = moisPeriode.map(m => {
    const row = { mois: MOIS_COURT[m], m }
    postes.forEach(p => { row[p.id] = val(p, primary, m) })
    if (ref !== undefined) row.totalRef = Math.round(totalMois(ref, m) * 100) / 100
    return row
  })

  // Mois détaillé : celui cliqué, sinon le dernier mois de la période qui a des sorties
  const avecSorties = moisPeriode.filter(m => totalMois(primary, m) > 0)
  const moisDetail = moisPeriode.includes(moisChoisi) ? moisChoisi : (avecSorties.at(-1) ?? a)
  const choisir = (st) => {
    const i = Number(st?.activeTooltipIndex)
    if (Number.isInteger(i) && moisPeriode[i] !== undefined) { setMoisChoisi(moisPeriode[i]); setOuvert(null) }
  }

  const prefixe = `${primary}-${String(moisDetail + 1).padStart(2, '0')}-`
  const lignesMois = etat.transactions.filter(t => t.date.startsWith(prefixe) && dansPostes(postes, t))
  const detail = postes.map(p => {
    const ls = lignesMois.filter(t => p.categories.includes(t.categorie))
    const cats = p.categories
      .map(c => ({ c, lignes: ls.filter(t => t.categorie === c).sort((x, y) => x.date.localeCompare(y.date)) }))
      .filter(x => x.lignes.length > 0)
      .map(x => ({ ...x, total: sum(x.lignes.map(t => -t.montant)) }))
    return { ...p, cats, total: sum(cats.map(x => x.total)) }
  })
  const totalDetail = sum(detail.map(p => p.total))

  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Suivi mensuel des charges salariales</h1>
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
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Postes additionnés</span>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <KpiCard label={`Total parti · ${primary}`} value={fmtEur(tPrimary)} sub={periode} subColor="neutral" />
        {ref !== undefined && (
          <KpiCard label={`Total parti · ${ref}`} value={fmtEur(tRef)} sub={diffLabel(tPrimary, tRef, ref)} subColor={diffColor(tPrimary, tRef, true)} />
        )}
        <KpiCard label={`Moyenne mensuelle · ${primary}`} value={fmtEur(moisPeriode.length ? tPrimary / moisPeriode.length : 0)} sub={`sur ${moisPeriode.length} mois`} subColor="neutral" />
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
          Ce qui part chaque mois · {primary}{ref !== undefined ? ` (trait : total ${ref})` : ''} — cliquez sur un mois pour le détail
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} onClick={choisir} style={{ cursor: 'pointer' }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip content={<InfoMois />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            {postes.map((p, i) => (
              <Bar key={p.id} dataKey={p.id} stackId="postes" fill={p.couleur} radius={i === postes.length - 1 ? [3,3,0,0] : 0}>
                {data.map(d => <Cell key={d.m} fillOpacity={d.m === moisDetail ? 1 : 0.5} />)}
              </Bar>
            ))}
            {ref !== undefined && <Line dataKey="totalRef" name={`Total ${ref}`} stroke="#888780" strokeDasharray="5 4" strokeWidth={1.5} dot={{ r: 2 }} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...cardStyle, border: '1px solid var(--color-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Détail {MOIS_LONG[moisDetail].toLowerCase()} {primary}</span>
          <span style={{ fontSize: 20, fontWeight: 600 }}>{fmtEur(totalDetail)}</span>
        </div>
        {totalDetail === 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Aucune sortie de ces postes ce mois-ci.</div>
        )}
        {detail.filter(p => p.total > 0).map(p => (
          <div key={p.id} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `3px solid ${p.couleur}`, padding: '4px 8px', background: 'var(--color-bg)', borderRadius: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{p.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtEur(p.total)}</span>
            </div>
            {p.cats.map(({ c, lignes, total }) => {
              const cle = `${p.id}|${c}`
              const open = ouvert === cle
              return (
                <div key={c} style={{ paddingLeft: 14 }}>
                  <button
                    type="button"
                    onClick={() => setOuvert(open ? null : cle)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px', background: 'none', border: 'none', borderBottom: '0.5px solid var(--color-border)', cursor: 'pointer', textAlign: 'left', color: 'var(--color-text)' }}
                  >
                    <span style={{ fontSize: 10, width: 10, color: 'var(--color-text-tertiary)' }}>{open ? '▾' : '▸'}</span>
                    <span style={{ flex: 1, fontSize: 12 }}>{c}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{lignes.length} ligne{lignes.length > 1 ? 's' : ''}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, minWidth: 90, textAlign: 'right' }}>{fmtEur(total)}</span>
                  </button>
                  {open && lignes.map(t => (
                    <div key={t.fitid} style={{ display: 'flex', gap: 10, fontSize: 11, padding: '3px 0 3px 20px', color: 'var(--color-text-secondary)' }}>
                      <span style={{ width: 72, flexShrink: 0 }}>{t.date.split('-').reverse().join('/')}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.libelle}>{t.tiers || t.libelle}</span>
                      <span style={{ minWidth: 90, textAlign: 'right', color: 'var(--color-text)' }}>{fmtEur(-t.montant)}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div style={{ ...cardStyle, background: '#EEEDFE', border: '0.5px solid #AFA9EC' }}>
        <div style={{ fontSize: 12, color: '#3C3489', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>ℹ</span>
          <span>Cotisations et charges = groupe « Charges sociales et fiscales » (URSSAF, retraite complémentaire, prévoyance et mutuelle salariés, épargne salariale, médecine du travail, autres cotisations patronales, impôts et taxes). Ces lignes restent aussi dans « Dépenses ».</span>
        </div>
      </div>
    </div>
  )
}
