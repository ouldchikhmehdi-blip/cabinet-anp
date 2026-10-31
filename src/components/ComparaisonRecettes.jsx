import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import KpiCard from './KpiCard'
import { SOURCES, FAMILLES_TP, detailRecettes, serieDe, ecartsCaisses } from '../data/recettes'
import { MOIS_COURT, MOIS_LONG, fmtEur, sum, couleurAnnee, ordreAffichage, diffLabel, diffColor } from '../data/mockData'
import { echelle, axeK } from '../utils/echelle'

const ACCENT = '#1D9E75'
const td = { padding: '5px 8px', fontSize: 12, textAlign: 'right', borderTop: '0.5px solid var(--color-border)', whiteSpace: 'nowrap' }
const th = { ...td, borderTop: 'none', color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 11 }
const nomFamille = Object.fromEntries(FAMILLES_TP.map(f => [f.id, f.nom]))
const signe = (v) => (v >= 0 ? '+' : '') + fmtEur(v)
const couleurEcart = (v) => (v >= 0 ? 'var(--color-success)' : 'var(--color-danger)')

// Cibles proposées en raccourci ; toutes les familles et caisses sont dans la liste déroulante.
const RACCOURCIS = [
  { cible: 'source:tiersPayant', nom: 'Tiers payant' },
  { cible: 'source:cpamHorsTp', nom: 'CPAM hors tiers payant' },
  { cible: 'assurance', nom: 'Tiers payant + CPAM hors TP' },
  { cible: 'source:millenaire', nom: 'Clinique du Millénaire' },
]

// Série d'une cible, y compris la cible composée « assurance » (tiers payant + CPAM hors TP).
const serieCible = (detail, cible) => {
  if (cible !== 'assurance') return serieDe(detail, cible)
  const tp = serieDe(detail, 'source:tiersPayant'), cpam = serieDe(detail, 'source:cpamHorsTp')
  return { mois: tp.mois.map((v, m) => v + cpam.mois[m]), nb: tp.nb.map((v, m) => v + cpam.nb[m]) }
}
const libelleCible = (cible) => {
  if (cible === 'assurance') return 'Tiers payant + CPAM hors TP'
  const [type, ...r] = cible.split(':'); const id = r.join(':')
  if (type === 'source') return SOURCES.find(s => s.id === id)?.nom || id
  if (type === 'famille') return `Tiers payant · ${nomFamille[id] || id}`
  return `Tiers payant · ${id}`
}

// Comparer deux années (ou plus, celles du filtre) sur une source, une famille ou une caisse :
// courbes mensuelles et cumulées, tableau mois par mois avec nombre de virements, et pour le
// tiers payant, les caisses qui expliquent l'écart.
export default function ComparaisonRecettes({ transactions, years, primary, anneeRef, de, a, periode, masque, cardStyle, tooltipStyle, moisMax }) {
  const [cible, setCible] = useState('source:tiersPayant')
  const [toutVoir, setToutVoir] = useState(false)
  const details = Object.fromEntries(years.map(y => [y, detailRecettes(transactions, y)]))
  const ordre = ordreAffichage(years)
  const couleur = (y) => couleurAnnee(ordre.find(o => o.y === y)?.rang ?? 0, ACCENT)
  const moisPeriode = []
  for (let m = de; m <= a; m++) moisPeriode.push(m)
  // Un mois pas encore écoulé d'une année n'est pas un zéro : il reste vide
  const valeur = (y, m) => (m > moisMax(y) ? null : serieCible(details[y], cible).mois[m])
  const nbDe = (y, m) => (m > moisMax(y) ? null : serieCible(details[y], cible).nb[m])
  const totalDe = (y) => sum(moisPeriode.map(m => valeur(y, m) ?? 0))
  const nbTotalDe = (y) => sum(moisPeriode.map(m => nbDe(y, m) ?? 0))
  // Comparaison à période égale : les mois de la référence limités à ceux écoulés de l'année principale
  const comparable = (y) => sum(moisPeriode.filter(m => m <= moisMax(primary)).map(m => valeur(y, m) ?? 0))

  const data = moisPeriode.map(m => {
    const row = { mois: MOIS_COURT[m] }
    years.forEach(y => { row[y] = valeur(y, m) })
    return row
  })
  const dataCumul = moisPeriode.map((m, i) => {
    const row = { mois: MOIS_COURT[m] }
    years.forEach(y => { row[y] = m > moisMax(y) ? null : sum(moisPeriode.slice(0, i + 1).map(mm => valeur(y, mm) ?? 0)) })
    return row
  })

  // Familles et caisses de toutes les années comparées, pour la liste déroulante
  const familles = FAMILLES_TP.filter(f => years.some(y => details[y].familles.some(x => x.id === f.id)))
  const caisses = new Map()
  for (const y of years) for (const f of details[y].familles) for (const c of f.caisses) caisses.set(c.nom, (caisses.get(c.nom) || 0) + sum(c.mois))
  const caissesTriees = [...caisses.entries()].sort((x, z) => z[1] - x[1]).map(([nom]) => nom)

  const estTp = cible === 'source:tiersPayant' || cible === 'assurance' || cible.startsWith('famille:') || cible.startsWith('caisse:')
  const familleFiltre = cible.startsWith('famille:') ? cible.slice(8) : null
  const ecarts = anneeRef !== undefined && estTp && !cible.startsWith('caisse:')
    ? ecartsCaisses(details[primary], details[anneeRef], de, Math.min(a, moisMax(primary))).filter(l => !familleFiltre || l.famille === familleFiltre)
    : []
  const ecartsVus = toutVoir ? ecarts : ecarts.slice(0, 12)

  const tP = comparable(primary), tR = anneeRef !== undefined ? comparable(anneeRef) : 0
  const nbP = nbTotalDe(primary)
  const moyenne = (y) => { const n = nbTotalDe(y); return n ? totalDe(y) / n : 0 }

  const renderLignes = () => ordre.map(({ y, rang }) => (
    <Line key={y} type="monotone" dataKey={y} stroke={couleur(y)} strokeWidth={rang === 0 ? 2 : 1.5}
      strokeDasharray={rang === 0 ? undefined : '5 4'} dot={{ r: rang === 0 ? 3 : 2 }} connectNulls={false} />
  ))
  const pill = (actif) => ({
    fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
    border: `0.5px solid ${actif ? ACCENT : 'var(--color-border)'}`,
    background: actif ? '#E1F5EE' : 'transparent', color: actif ? '#085041' : 'var(--color-text-secondary)',
  })
  const legende = (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {ordre.map(({ y, rang }) => (
        <span key={y} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 18, height: 0, borderTop: `2px ${rang === 0 ? 'solid' : 'dashed'} ${couleur(y)}` }} />{y}
        </span>
      ))}
    </div>
  )

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Comparer les années — {years.slice().sort().join(' · ')}</span>
        <span style={{ flex: 1, borderTop: '0.5px solid var(--color-border)' }} />
      </div>

      <div style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {RACCOURCIS.map(r => (
          <button key={r.cible} type="button" style={pill(cible === r.cible)} onClick={() => { setCible(r.cible); setToutVoir(false) }}>{r.nom}</button>
        ))}
        <select value={cible} onChange={e => { setCible(e.target.value); setToutVoir(false) }} style={{ fontSize: 12, padding: '3px 6px', marginLeft: 'auto', maxWidth: 320 }}>
          <optgroup label="Sources">
            {SOURCES.map(s => <option key={s.id} value={`source:${s.id}`}>{s.nom}</option>)}
            <option value="assurance">Tiers payant + CPAM hors TP</option>
          </optgroup>
          {familles.length > 0 && (
            <optgroup label="Tiers payant par famille">
              {familles.map(f => <option key={f.id} value={`famille:${f.id}`}>{f.nom}</option>)}
            </optgroup>
          )}
          {caissesTriees.length > 0 && (
            <optgroup label="Tiers payant par caisse">
              {caissesTriees.map(n => <option key={n} value={`caisse:${n}`}>{n}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <KpiCard label={`${libelleCible(cible)} · ${primary}`} value={fmtEur(tP)} sub={`${periode} · ${nbP} virement${nbP > 1 ? 's' : ''}, ${fmtEur(moyenne(primary))} en moyenne`} subColor="neutral" />
        {anneeRef !== undefined && (
          <KpiCard label={`${libelleCible(cible)} · ${anneeRef}`} value={fmtEur(tR)} sub={`à mois égaux (${MOIS_COURT[de]} → ${MOIS_COURT[Math.min(a, moisMax(primary))]}) · ${fmtEur(moyenne(anneeRef))} en moyenne par virement`} subColor="neutral" />
        )}
        {anneeRef !== undefined && (
          <KpiCard label={`Écart ${primary} vs ${anneeRef}`} value={signe(tP - tR)} sub={diffLabel(tP, tR, anneeRef)} subColor={diffColor(tP, tR)} />
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{libelleCible(cible)} — mensuel · {periode}</span>
          {legende}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis {...echelle(data)} tick={{ fontSize: 11 }} tickFormatter={axeK} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            {renderLignes()}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{libelleCible(cible)} — cumulé · {periode}</span>
          {legende}
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dataCumul}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis {...echelle(dataCumul)} tick={{ fontSize: 11 }} tickFormatter={axeK} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            {renderLignes()}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...cardStyle, padding: '8px 4px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Mois</th>
              {ordre.map(({ y }) => <th key={y} style={th} colSpan={2}>{y}</th>)}
              {anneeRef !== undefined && <th style={th}>Écart {primary} − {anneeRef}</th>}
            </tr>
            <tr>
              <th style={th} />
              {ordre.map(({ y }) => [<th key={`${y}-m`} style={th}>Montant</th>, <th key={`${y}-n`} style={th}>Virements</th>])}
              {anneeRef !== undefined && <th style={th} />}
            </tr>
          </thead>
          <tbody>
            {moisPeriode.map(m => {
              const vP = valeur(primary, m), vR = anneeRef !== undefined ? valeur(anneeRef, m) : null
              return (
                <tr key={m}>
                  <td style={{ ...td, textAlign: 'left' }}>{MOIS_LONG[m]}</td>
                  {ordre.map(({ y }) => [
                    <td key={`${y}-m`} style={td}>{valeur(y, m) === null ? '–' : fmtEur(valeur(y, m))}</td>,
                    <td key={`${y}-n`} style={{ ...td, color: 'var(--color-text-secondary)' }}>{nbDe(y, m) ?? '–'}</td>,
                  ])}
                  {anneeRef !== undefined && (
                    <td style={{ ...td, color: vP === null || vR === null ? undefined : couleurEcart(vP - vR) }}>{vP === null || vR === null ? '–' : signe(vP - vR)}</td>
                  )}
                </tr>
              )
            })}
            <tr style={{ fontWeight: 600 }}>
              <td style={{ ...td, textAlign: 'left' }}>Total</td>
              {ordre.map(({ y }) => [
                <td key={`${y}-m`} style={td}>{fmtEur(totalDe(y))}</td>,
                <td key={`${y}-n`} style={td}>{nbTotalDe(y)}</td>,
              ])}
              {anneeRef !== undefined && <td style={{ ...td, color: couleurEcart(tP - tR) }} title="à mois égaux">{signe(tP - tR)}</td>}
            </tr>
          </tbody>
        </table>
      </div>

      {ecarts.length > 0 && (
        <div style={{ ...cardStyle, padding: '8px 4px', overflowX: 'auto' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', padding: '4px 8px 8px' }}>
            Ce qui a bougé dans le tiers payant{familleFiltre ? ` · ${nomFamille[familleFiltre]}` : ''} · {anneeRef} → {primary} · {MOIS_COURT[de]} → {MOIS_COURT[Math.min(a, moisMax(primary))]} — caisses classées par variation
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Caisse</th>
                <th style={{ ...th, textAlign: 'left' }}>Famille</th>
                <th style={th}>{anneeRef}</th>
                <th style={th}>{primary}</th>
                <th style={th}>Écart</th>
                <th style={th}>Virements {anneeRef} → {primary}</th>
              </tr>
            </thead>
            <tbody>
              {ecartsVus.map(l => (
                <tr key={l.nom}>
                  <td style={{ ...td, textAlign: 'left', cursor: 'pointer' }} onClick={() => setCible(`caisse:${l.nom}`)} title="voir cette caisse mois par mois">{l.nom}</td>
                  <td style={{ ...td, textAlign: 'left', color: 'var(--color-text-secondary)' }}>{nomFamille[l.famille]}</td>
                  <td style={td}>{fmtEur(l.b)}</td>
                  <td style={td}>{fmtEur(l.a)}</td>
                  <td style={{ ...td, color: couleurEcart(l.ecart) }}>{signe(l.ecart)}</td>
                  <td style={{ ...td, color: 'var(--color-text-secondary)' }}>{l.nbB} → {l.nbA}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ecarts.length > 12 && (
            <button type="button" onClick={() => setToutVoir(v => !v)} style={{ margin: '8px', background: 'none', border: '0.5px solid var(--color-border)', borderRadius: 6, padding: '2px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              {toutVoir ? 'Réduire' : `Voir les ${ecarts.length} caisses`}
            </button>
          )}
        </div>
      )}
    </>
  )
}
