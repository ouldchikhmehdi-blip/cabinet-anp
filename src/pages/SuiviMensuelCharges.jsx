import { useState } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import EtatCompta from '../components/EtatCompta'
import BoutonExport from '../components/BoutonExport'
import { entreeReleve } from '../utils/exportReleve'
import { useCompta } from '../data/compta'
import { usePeriode } from '../data/periode'
import { POSTES, dansPostes } from '../data/postesSalariaux'
import { MOIS_COURT, MOIS_LONG, fmtEur, sum, diffLabel, diffColor, getMasqueMontants, ordreAffichage } from '../data/mockData'

const TOOLTIP = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
// Clé d'une barre : poste + année (jamais « ref » ni « key », réservés par React)
const cle = (pid, y) => `${pid}_${y}`
// Plus l'année est ancienne, plus sa barre est claire ; la plus récente est pleine
const opaciteAnnee = (rang) => (rang === 0 ? 1 : rang === 1 ? 0.45 : 0.25)

// Infobulle : pour chaque année cochée, chaque poste du mois et le total parti
function InfoMois({ active, payload, label, years }) {
  if (!active || !payload?.length) return null
  const ligne = payload[0].payload
  return (
    <div style={{ ...TOOLTIP, padding: '8px 10px', minWidth: 220 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {[...years].sort((x, y) => y - x).map(y => {
        const postes = POSTES.filter(p => ligne[cle(p.id, y)] !== undefined)
        return (
          <div key={y} style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontWeight: 600, borderTop: '0.5px solid #d3d1c7', paddingTop: 3 }}>
              <span>{y}</span><span>{fmtEur(sum(postes.map(p => ligne[cle(p.id, y)])))}</span>
            </div>
            {postes.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                <span style={{ color: p.couleur }}>{p.label}</span><span>{fmtEur(ligne[cle(p.id, y)])}</span>
              </div>
            ))}
          </div>
        )
      })}
      <div style={{ fontSize: 10, color: '#888780' }}>Cliquez pour le détail du mois</div>
    </div>
  )
}

// Suivi mensuel de tout ce qui part pour le personnel : salaires CDI, rempla IADE, rempla MAR,
// cotisations et charges. Chaque année cochée a sa barre dans chaque mois (la plus récente pleine,
// les autres plus claires). Un clic sur un mois ouvre le détail, année par année : chaque poste,
// ses catégories, et les lignes du relevé.
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
  const annees = ordreAffichage(years) // chronologique, avec le rang de récence

  const val = (p, y, m) => (S[p.serie][y] || [])[m] ?? 0
  const totalMois = (y, m) => sum(postes.map(p => val(p, y, m)))
  const moisPeriode = Array.from({ length: a - de + 1 }, (_, i) => de + i)
  const totalPeriode = (y) => sum(moisPeriode.map(m => totalMois(y, m)))
  const tPrimary = totalPeriode(primary)

  const data = moisPeriode.map(m => {
    const row = { mois: MOIS_COURT[m], m }
    years.forEach(y => postes.forEach(p => { row[cle(p.id, y)] = val(p, y, m) }))
    return row
  })

  // Mois détaillé : celui cliqué, sinon le dernier mois de la période qui a des sorties
  const avecSorties = moisPeriode.filter(m => totalMois(primary, m) > 0)
  const moisDetail = moisPeriode.includes(moisChoisi) ? moisChoisi : (avecSorties.at(-1) ?? a)
  const choisir = (st) => {
    const i = Number(st?.activeTooltipIndex)
    if (Number.isInteger(i) && moisPeriode[i] !== undefined) { setMoisChoisi(moisPeriode[i]); setOuvert(null) }
  }

  // Détail du mois : par poste puis par catégorie, une colonne par année cochée
  const mm = String(moisDetail + 1).padStart(2, '0')
  const lignesMois = etat.transactions.filter(t => years.some(y => t.date.startsWith(`${y}-${mm}-`)) && dansPostes(postes, t))
  const montantDe = (ls, y) => sum(ls.filter(t => t.date.startsWith(`${y}-`)).map(t => -t.montant))
  const detail = postes.map(p => {
    const ls = lignesMois.filter(t => p.categories.includes(t.categorie))
    const cats = p.categories
      .map(c => ({ c, lignes: ls.filter(t => t.categorie === c).sort((x, y) => x.date.localeCompare(y.date)) }))
      .filter(x => x.lignes.length > 0)
    return { ...p, lignes: ls, cats }
  }).filter(p => p.lignes.length > 0)
  const totalDetail = (y) => montantDe(lignesMois, y)
  const ecart = (ls) => montantDe(ls, primary) - montantDe(ls, ref)

  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }
  const colAnnee = { minWidth: 92, textAlign: 'right' }
  const couleurEcart = (d) => (d > 0 ? 'var(--color-danger)' : d < 0 ? 'var(--color-success)' : 'var(--color-text-tertiary)')
  const fmtEcart = (d) => (d > 0 ? '+' : '') + fmtEur(d)

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

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(years.length, 4) + 1}, 1fr)`, gap: 8 }}>
        {[...years].sort((x, y) => y - x).map(y => (
          <KpiCard
            key={y}
            label={`Total parti · ${y}`}
            value={fmtEur(totalPeriode(y))}
            sub={y === primary ? periode : diffLabel(tPrimary, totalPeriode(y), y)}
            subColor={y === primary ? 'neutral' : diffColor(tPrimary, totalPeriode(y), true)}
          />
        ))}
        <KpiCard label={`Moyenne mensuelle · ${primary}`} value={fmtEur(moisPeriode.length ? tPrimary / moisPeriode.length : 0)} sub={`sur ${moisPeriode.length} mois`} subColor="neutral" />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Ce qui part chaque mois — {periode} · cliquez sur un mois pour le détail
          </span>
          {years.length > 1 && (
            <span style={{ display: 'flex', gap: 12, fontSize: 11 }}>
              {annees.map(({ y, rang }) => (
                <span key={y} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#534AB7', opacity: opaciteAnnee(rang) }} />
                  {y}
                </span>
              ))}
              <span style={{ color: 'var(--color-text-tertiary)' }}>(une barre par année, de gauche à droite)</span>
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} onClick={choisir} style={{ cursor: 'pointer' }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip content={<InfoMois years={years} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            {annees.flatMap(({ y, rang }) => postes.map((p, i) => (
              <Bar key={cle(p.id, y)} dataKey={cle(p.id, y)} stackId={`annee-${y}`} fill={p.couleur} radius={i === postes.length - 1 ? [3,3,0,0] : 0}>
                {data.map(d => <Cell key={d.m} fillOpacity={opaciteAnnee(rang) * (d.m === moisDetail ? 1 : 0.7)} />)}
              </Bar>
            )))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...cardStyle, border: '1px solid var(--color-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>Détail {MOIS_LONG[moisDetail].toLowerCase()}</span>
          {annees.map(({ y }) => (
            <span key={y} style={{ ...colAnnee, fontSize: 11, color: 'var(--color-text-secondary)' }}>{y}</span>
          ))}
          {ref !== undefined && <span style={{ ...colAnnee, fontSize: 11, color: 'var(--color-text-secondary)' }}>{primary} vs {ref}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>Total parti</span>
          {annees.map(({ y }) => <span key={y} style={{ ...colAnnee, fontSize: 15, fontWeight: 600 }}>{fmtEur(totalDetail(y))}</span>)}
          {ref !== undefined && <span style={{ ...colAnnee, fontSize: 13, fontWeight: 600, color: couleurEcart(ecart(lignesMois)) }}>{fmtEcart(ecart(lignesMois))}</span>}
        </div>
        {detail.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Aucune sortie de ces postes ce mois-ci.</div>
        )}
        {detail.map(p => (
          <div key={p.id} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderLeft: `3px solid ${p.couleur}`, padding: '4px 8px', background: 'var(--color-bg)', borderRadius: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{p.label}</span>
              {annees.map(({ y }) => <span key={y} style={{ ...colAnnee, fontSize: 13, fontWeight: 600 }}>{fmtEur(montantDe(p.lignes, y))}</span>)}
              {ref !== undefined && <span style={{ ...colAnnee, fontSize: 12, fontWeight: 500, color: couleurEcart(ecart(p.lignes)) }}>{fmtEcart(ecart(p.lignes))}</span>}
            </div>
            {p.cats.map(({ c, lignes }) => {
              const k = `${p.id}|${c}`
              const open = ouvert === k
              return (
                <div key={c} style={{ paddingLeft: 14 }}>
                  <button
                    type="button"
                    onClick={() => setOuvert(open ? null : k)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 2px', background: 'none', border: 'none', borderBottom: '0.5px solid var(--color-border)', cursor: 'pointer', textAlign: 'left', color: 'var(--color-text)' }}
                  >
                    <span style={{ fontSize: 10, width: 10, color: 'var(--color-text-tertiary)' }}>{open ? '▾' : '▸'}</span>
                    <span style={{ flex: 1, fontSize: 12 }}>{c}</span>
                    {annees.map(({ y }) => <span key={y} style={{ ...colAnnee, fontSize: 12 }}>{fmtEur(montantDe(lignes, y))}</span>)}
                    {ref !== undefined && <span style={{ ...colAnnee, fontSize: 11, color: couleurEcart(ecart(lignes)) }}>{fmtEcart(ecart(lignes))}</span>}
                  </button>
                  {open && [...years].sort((x, y) => y - x).map(y => {
                    const ly = lignes.filter(t => t.date.startsWith(`${y}-`))
                    if (ly.length === 0) return null
                    return (
                      <div key={y} style={{ padding: '4px 0 4px 20px' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{y} · {ly.length} ligne{ly.length > 1 ? 's' : ''}</div>
                        {ly.map(t => (
                          <div key={t.fitid} style={{ display: 'flex', gap: 10, fontSize: 11, padding: '2px 0', color: 'var(--color-text-secondary)' }}>
                            <span style={{ width: 72, flexShrink: 0 }}>{t.date.split('-').reverse().join('/')}</span>
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.libelle}>{t.tiers || t.libelle}</span>
                            <span style={{ minWidth: 90, textAlign: 'right', color: 'var(--color-text)' }}>{fmtEur(-t.montant)}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
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
