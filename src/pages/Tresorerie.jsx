import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
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
          <span style={{ display: 'inline-block', width: 18, height: 0, borderTop: `2px ${rang === 0 ? 'solid' : 'dashed'} ${couleurAnnee(rang, ACCENT)}` }} />
          {y}
        </span>
      ))}
    </div>
  )
}

export default function Tresorerie() {
  const etat = useCompta()
  const S = etat.series
  const P = usePeriode(S.ANNEES)
  const { years, de, a, primary, ref } = P
  const masque = getMasqueMontants()
  const labels = MOIS_COURT.slice(de, a + 1)
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]

  // Un solde vaut null quand il est inconnu (pas d'ancre de relevé) : les KPI
  // l'ignorent et affichent « — » s'il n'en reste aucun ; le graphe saute le point.
  const soldeDe = (y) => (S.SOLDES[y] || []).slice(de, a + 1)
  const entDe = (y) => (S.ENTREES[y] || []).slice(de, a + 1)
  const sorDe = (y) => (S.SORTIES[y] || []).slice(de, a + 1)
  const connus = (arr) => arr.filter(v => v !== null && v !== undefined)

  const tEnt1 = sum(entDe(primary)), tEnt2 = sum(entDe(ref))
  const tSor1 = sum(sorDe(primary)), tSor2 = sum(sorDe(ref))
  const solPrimary = soldeDe(primary)
  const solConnus = connus(solPrimary)
  const minSol = solConnus.length ? Math.min(...solConnus) : null
  const minIdx = minSol === null ? -1 : solPrimary.indexOf(minSol)
  const moySol1 = solConnus.length ? Math.round(sum(solConnus) / solConnus.length) : null
  const solRefConnus = connus(soldeDe(ref))
  const moySol2 = solRefConnus.length ? Math.round(sum(solRefConnus) / solRefConnus.length) : null
  // Dernier solde connu de l'année principale (toute l'année, pas seulement la période)
  const soldeActuel = connus(S.SOLDES[primary] || []).at(-1) ?? null
  const fmtSolde = (v) => (v === null ? '—' : fmtEur(v))

  const dataSolde = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = soldeDe(y)[i] ?? null })
    return row
  })
  // Entrées vs sorties : année principale.
  const dataFlux = labels.map((m, i) => ({ mois: m, entrees: entDe(primary)[i] ?? 0, sorties: sorDe(primary)[i] ?? 0 }))

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Trésorerie</h1>
        <span style={{
          fontSize: 12, background: '#E1F5EE', color: '#085041',
          padding: '4px 12px', borderRadius: 20, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 6
        }}>
          ✓ Solde actuel : {fmtSolde(soldeActuel)}
        </span>
      </div>

      <EtatCompta etat={etat} />

      <PeriodeFilter
        moisDe={P.moisDe} setMoisDe={P.setMoisDe}
        moisA={P.moisA} setMoisA={P.setMoisA}
        years={P.years} setYears={P.setYears}
        shortcut={P.shortcut} setShortcut={P.setShortcut}
        availableYears={S.ANNEES}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <KpiCard
          label={`Entrées · ${primary}`}
          value={fmtEur(tEnt1)}
          sub={diffLabel(tEnt1, tEnt2, ref)}
          subColor={diffColor(tEnt1, tEnt2)}
        />
        <KpiCard
          label={`Sorties · ${primary}`}
          value={fmtEur(tSor1)}
          sub={diffLabel(tSor1, tSor2, ref)}
          subColor={diffColor(tSor1, tSor2, true)}
        />
        <KpiCard
          label="Solde minimum"
          value={fmtSolde(minSol)}
          sub={`Point bas en ${labels[minIdx] || '-'} · ${primary}`}
          subColor="neutral"
        />
        <KpiCard
          label="Solde moyen mensuel"
          value={fmtSolde(moySol1)}
          sub={moySol1 === null || moySol2 === null ? 'Solde inconnu : importez un relevé' : diffLabel(moySol1, moySol2, ref)}
          subColor={moySol1 === null || moySol2 === null ? 'neutral' : diffColor(moySol1, moySol2)}
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Évolution du solde — {periode}
          </span>
          <LegendAnnees years={years} />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dataSolde}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            {ordreAffichage(years).map(({ y, rang }) => (
              <Line
                key={y}
                type="monotone"
                dataKey={y}
                stroke={couleurAnnee(rang, ACCENT)}
                strokeWidth={rang === 0 ? 2 : 1.5}
                strokeDasharray={rang === 0 ? undefined : '5 4'}
                dot={{ r: rang === 0 ? 3 : 2 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Entrées vs sorties · {primary} — {periode}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#1D9E75', borderRadius: 2 }} /> Entrées
            </span>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#D85A30', borderRadius: 2 }} /> Sorties
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataFlux}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(0)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            <Bar dataKey="entrees" fill="#1D9E75" radius={[3,3,0,0]} name="Entrées" />
            <Bar dataKey="sorties" fill="#D85A30" radius={[3,3,0,0]} name="Sorties" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
