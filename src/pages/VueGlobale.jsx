import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import EtatCompta from '../components/EtatCompta'
import BoutonExport from '../components/BoutonExport'
import { entreeReleve } from '../utils/exportReleve'
import { useCompta } from '../data/compta'
import { usePeriode } from '../data/periode'
import { MOIS_COURT, fmtK, fmtEur, sum, diffLabel, diffColor, getMasqueMontants, couleurAnnee, ordreAffichage } from '../data/mockData'
import { echelleVisible, axeK, sansMoisFuturs } from '../utils/echelle'

function LegendAnnees({ years, accent }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {ordreAffichage(years).map(({ y, rang }) => (
        <span key={y} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 18, height: 0, borderTop: `2px ${rang === 0 ? 'solid' : 'dashed'} ${couleurAnnee(rang, accent)}` }} />
          {y}
        </span>
      ))}
    </div>
  )
}

export default function VueGlobale() {
  const etat = useCompta()
  const S = etat.series
  const P = usePeriode(S.ANNEES)
  const { years, de, a, primary, ref } = P
  const masque = getMasqueMontants()
  const moisActuel = S.moisActuel(primary)  // dernier mois ayant des lignes pour l'année principale

  const caDe = (y) => (S.CA[y] || []).slice(de, a + 1)
  const chDe = (y) => (S.CHARGES[y] || []).slice(de, a + 1)

  const totalCA1 = sum(caDe(primary)), totalCA2 = sum(caDe(ref))
  const totalCH1 = sum(chDe(primary)), totalCH2 = sum(chDe(ref))
  const res1 = totalCA1 - totalCH1, res2 = totalCA2 - totalCH2

  const f = S.RETRO_FIXE[primary] || []
  const v = S.RETRO_VARIABLE[primary] || []
  const cumulRetro = sum(f.slice(0, moisActuel + 1)) + sum(v.slice(0, moisActuel + 1))
  // Débits encore « À arbitrer » sur la période : à classer avant de lire les charges comme définitives
  const nonClasse = sum((S.NON_CLASSE[primary] || []).slice(de, a + 1))

  const labels = MOIS_COURT.slice(de, a + 1)
  const dataCA = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = caDe(y)[i] ?? 0 })
    return row
  })
  const dataCH = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = chDe(y)[i] ?? 0 })
    return row
  })

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }

  const renderLignes = (accent) => ordreAffichage(years).map(({ y, rang }) => (
    <Line
      key={y}
      type="monotone"
      dataKey={y}
      stroke={couleurAnnee(rang, accent)}
      strokeWidth={rang === 0 ? 2 : 1.5}
      strokeDasharray={rang === 0 ? undefined : '5 4'}
      dot={{ r: rang === 0 ? 3 : 2 }}
    />
  ))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Vue globale</h1>
        <span style={{
          fontSize: 11, background: 'var(--color-primary-light)',
          color: 'var(--color-primary-dark)', padding: '3px 10px',
          borderRadius: 20, fontWeight: 500
        }}>SARM · 8 associés</span>
        <BoutonExport
          exports={[entreeReleve({ label: 'Tout le relevé (une feuille par année)', page: 'complet', transactions: etat.transactions, years, de, a })]}
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <KpiCard
          label={`Chiffre d'affaires ${primary}`}
          value={fmtK(totalCA1)}
          sub={diffLabel(totalCA1, totalCA2, ref)}
          subColor={diffColor(totalCA1, totalCA2)}
        />
        <KpiCard
          label={`Charges totales ${primary}`}
          value={fmtK(totalCH1)}
          sub={diffLabel(totalCH1, totalCH2, ref)}
          subColor={diffColor(totalCH1, totalCH2, true)}
        />
        <KpiCard
          label={`Résultat net ${primary}`}
          value={fmtK(res1)}
          sub={diffLabel(res1, res2, ref)}
          subColor={diffColor(res1, res2)}
        />
        <KpiCard
          label="Virements versés / associé"
          value={fmtEur(cumulRetro)}
          sub={`Jan → ${MOIS_COURT[moisActuel]} ${primary} · cumul`}
          subColor="neutral"
        />
      </div>

      {nonClasse > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <KpiCard
            label={`Non classé ${primary}`}
            value={fmtEur(nonClasse)}
            sub="Débits à arbitrer"
            subColor="neutral"
          />
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Chiffre d'affaires mensuel
          </span>
          <LegendAnnees years={years} accent="#534AB7" />
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={sansMoisFuturs(dataCA, S, de)}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis domain={echelleVisible} tick={{ fontSize: 11 }} tickFormatter={axeK} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            {renderLignes('#534AB7')}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Charges mensuelles
          </span>
          <LegendAnnees years={years} accent="#D85A30" />
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={sansMoisFuturs(dataCH, S, de)}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis domain={echelleVisible} tick={{ fontSize: 11 }} tickFormatter={axeK} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            {renderLignes('#D85A30')}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
