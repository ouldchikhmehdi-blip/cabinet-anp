// Sous-onglet « Facturé / réglé » : par mois, ce que les associés ont facturé (FAC, Mt Total,
// tous associés et établissements) et ce qui a été réglé (RED, Base Conv + Base DH),
// avec la redevance clinique en information. Les mois non importés restent vides, pas à 0.
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import BoutonExport from '../components/BoutonExport'
import EtatFacturation from '../components/EtatFacturation'
import { useFacturation } from '../data/facturation'
import { usePeriode } from '../data/periode'
import { MOIS_COURT, MOIS_LONG, fmtK, fmtEur, sum, diffLabel, diffColor, getMasqueMontants, couleurAnnee, ordreAffichage } from '../data/mockData'
import { echelle, axeK, sansMoisFuturs } from '../utils/echelle'
import { moisRenseignes, sommeComparable } from '../utils/periodeComparable'

const ACCENT = '#534AB7'     // facturé
const ACCENT_REGLE = '#1D9E75' // réglé
const GRID_STROKE = 'rgba(128,128,128,0.22)'
const TICK = { fontSize: 11, fill: '#8C8A82' }

function Legende({ items }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {items.map(it => (
        <span key={it.label} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
          {it.trait
            ? <span style={{ display: 'inline-block', width: 18, height: 0, borderTop: `2px ${it.trait} ${it.couleur}` }} />
            : <span style={{ display: 'inline-block', width: 10, height: 10, background: it.couleur, borderRadius: 2 }} />}
          {it.label}
        </span>
      ))}
    </div>
  )
}

export default function FacturationMensuel() {
  const etat = useFacturation()
  const S = etat.series
  const P = usePeriode(S.ANNEES)
  const { years, de, a, primary, ref } = P
  const masque = getMasqueMontants()
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]
  const labels = MOIS_COURT.slice(de, a + 1)

  const serie = (T, y) => ((T[y] || []).slice(de, a + 1))
  const moisPleins = moisRenseignes(S.RENSEIGNE[primary]?.map(v => (v ? 1 : 0)), de, a)
  const periodePartielle = moisPleins.length > 0 && moisPleins.length < (a - de + 1)
  const refRenseignee = ref !== undefined && (S.RENSEIGNE[ref] || []).some(Boolean)

  const fPrimary = sum(serie(S.FACTURE, primary))
  const rPrimary = sum(serie(S.REGLE, primary))
  const redPrimary = sum(serie(S.REDEVANCE, primary))
  const dhPrimary = sum(serie(S.DH, primary))
  const fRef = refRenseignee ? sommeComparable(S.FACTURE[ref], moisPleins) : 0
  const rRef = refRenseignee ? sommeComparable(S.REGLE[ref], moisPleins) : 0

  // Barres : facturé et réglé de l'année principale, mois par mois
  const dataBar = sansMoisFuturs(labels.map((m, i) => ({ mois: m, [`f${primary}`]: serie(S.FACTURE, primary)[i] ?? 0, [`r${primary}`]: serie(S.REGLE, primary)[i] ?? 0 })), S, de)
  // Cumuls : facturé (plein) et réglé (pointillé) pour chaque année comparée
  const dataCumul = sansMoisFuturs(labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => {
      row[`f${y}`] = sum(serie(S.FACTURE, y).slice(0, i + 1))
      row[`r${y}`] = sum(serie(S.REGLE, y).slice(0, i + 1))
    })
    return row
  }), S, de)

  const lignesTableau = []
  for (let m = de; m <= a; m++) {
    if (!S.RENSEIGNE[primary]?.[m]) continue
    const f = S.FACTURE[primary][m], r = S.REGLE[primary][m]
    lignesTableau.push({ m, facture: f, regle: r, ecart: r - f, redevance: S.REDEVANCE[primary][m], dh: S.DH[primary][m] })
  }

  const exports = [{
    label: 'Facturé / réglé par mois',
    build: () => {
      const lignes = []
      for (let m = de; m <= a; m++) {
        const ligne = { Mois: MOIS_LONG[m] }
        years.forEach(y => {
          const ok = S.RENSEIGNE[y]?.[m]
          ligne[`Facturé ${y}`] = ok ? S.FACTURE[y][m] : ''
          ligne[`Réglé ${y}`] = ok ? S.REGLE[y][m] : ''
          ligne[`Redevance TTC ${y}`] = ok ? S.REDEVANCE[y][m] : ''
          ligne[`DH facturés ${y}`] = ok ? S.DH[y][m] : ''
        })
        lignes.push(ligne)
      }
      const total = { Mois: 'TOTAL' }
      years.forEach(y => {
        total[`Facturé ${y}`] = sum(serie(S.FACTURE, y)); total[`Réglé ${y}`] = sum(serie(S.REGLE, y))
        total[`Redevance TTC ${y}`] = sum(serie(S.REDEVANCE, y)); total[`DH facturés ${y}`] = sum(serie(S.DH, y))
      })
      lignes.push(total)
      return { nomFichier: `facture-regle_${MOIS_COURT[de]}-${MOIS_COURT[a]}_${years.join('-')}.xlsx`, lignes, feuille: 'Facturé réglé' }
    },
  }]

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }
  const nomSerie = (k) => (k.startsWith('f') ? 'Facturé ' : 'Réglé ') + k.slice(1)
  const td = { padding: '6px 10px', fontSize: 12, textAlign: 'right', borderTop: '0.5px solid var(--color-border)' }
  const th = { ...td, borderTop: 'none', color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 11 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>Facturé et réglé par mois</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>{years.join(' · ')}</span>
          <BoutonExport exports={exports} disabled={masque} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: -6 }}>
        <strong>Facturé</strong> = total des lignes facturées dans le mois par les associés (justificatifs FAC de la clinique,
        tous établissements). <strong>Réglé</strong> = ce qui a été payé dans le mois par les patients, l'AMO et les mutuelles
        (justificatifs RED, base conventionnelle + dépassements), avant la redevance prélevée par la clinique.
      </div>

      <EtatFacturation etat={etat} />

      <PeriodeFilter
        moisDe={P.moisDe} setMoisDe={P.setMoisDe}
        moisA={P.moisA} setMoisA={P.setMoisA}
        years={P.years} setYears={P.setYears}
        shortcut={P.shortcut} setShortcut={P.setShortcut}
        availableYears={S.ANNEES}
      />

      {periodePartielle && (
        <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', background: 'var(--color-bg)', border: '0.5px solid var(--color-border)', borderRadius: 8, padding: '7px 12px' }}>
          ℹ️ {primary} n'est importé que jusqu'à <strong>{MOIS_COURT[moisPleins.at(-1)]}</strong> : les mois suivants ne sont pas comptés comme zéro.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <KpiCard label={`Facturé · ${primary}`} value={fmtK(fPrimary)} sub={refRenseignee ? diffLabel(fPrimary, fRef, ref) : periode} subColor={refRenseignee ? diffColor(fPrimary, fRef) : 'neutral'} />
        <KpiCard label={`Réglé · ${primary}`} value={fmtK(rPrimary)} sub={refRenseignee ? diffLabel(rPrimary, rRef, ref) : periode} subColor={refRenseignee ? diffColor(rPrimary, rRef) : 'neutral'} />
        <KpiCard label="Réglé − facturé" value={(rPrimary - fPrimary >= 0 ? '+' : '') + fmtEur(rPrimary - fPrimary)} sub={`sur ${moisPleins.length} mois importé${moisPleins.length > 1 ? 's' : ''}`} subColor="neutral" />
        <KpiCard label={`Redevance clinique TTC · ${primary}`} value={fmtEur(redPrimary)} sub={rPrimary ? `${Math.round(redPrimary / rPrimary * 100)} % du réglé · DH facturés ${fmtEur(dhPrimary)}` : periode} subColor="neutral" />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Facturé et réglé par mois · {primary} · {periode}</span>
          <Legende items={[{ label: 'Facturé', couleur: ACCENT }, { label: 'Réglé', couleur: ACCENT_REGLE }]} />
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dataBar}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="mois" tick={TICK} />
            <YAxis {...echelle(dataBar)} tick={TICK} tickFormatter={axeK} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, k) => [fmtEur(v), nomSerie(k)]} />
            <Bar dataKey={`f${primary}`} fill={ACCENT} radius={[3, 3, 0, 0]} />
            <Bar dataKey={`r${primary}`} fill={ACCENT_REGLE} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Cumul facturé (plein) et réglé (pointillé) — {periode}</span>
          <Legende items={ordreAffichage(years).flatMap(({ y, rang }) => [
            { label: `Facturé ${y}`, couleur: couleurAnnee(rang, ACCENT), trait: 'solid' },
            { label: `Réglé ${y}`, couleur: couleurAnnee(rang, ACCENT), trait: 'dashed' },
          ])} />
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={dataCumul}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="mois" tick={TICK} />
            <YAxis {...echelle(dataCumul)} tick={TICK} tickFormatter={axeK} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, k) => [fmtEur(v), nomSerie(k)]} />
            {ordreAffichage(years).flatMap(({ y, rang }) => [
              <Line key={`f${y}`} type="monotone" dataKey={`f${y}`} stroke={couleurAnnee(rang, ACCENT)} strokeWidth={rang === 0 ? 2.4 : 1.8} dot={{ r: rang === 0 ? 3 : 2 }} />,
              <Line key={`r${y}`} type="monotone" dataKey={`r${y}`} stroke={couleurAnnee(rang, ACCENT)} strokeWidth={rang === 0 ? 2 : 1.5} strokeDasharray="5 4" dot={{ r: 2 }} />,
            ])}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...cardStyle, padding: '8px 4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Mois {primary}</th>
              <th style={th}>Facturé</th><th style={th}>Réglé</th><th style={th}>Réglé − facturé</th><th style={th}>DH facturés</th><th style={th}>Redevance TTC</th>
            </tr>
          </thead>
          <tbody>
            {lignesTableau.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Aucun mois importé sur la période.</td></tr>
            )}
            {lignesTableau.map(l => (
              <tr key={l.m}>
                <td style={{ ...td, textAlign: 'left' }}>{MOIS_LONG[l.m]}</td>
                <td style={td}>{fmtEur(l.facture)}</td>
                <td style={td}>{fmtEur(l.regle)}</td>
                <td style={{ ...td, color: l.ecart >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{(l.ecart >= 0 ? '+' : '') + fmtEur(l.ecart)}</td>
                <td style={td}>{fmtEur(l.dh)}</td>
                <td style={td}>{fmtEur(l.redevance)}</td>
              </tr>
            ))}
            {lignesTableau.length > 0 && (
              <tr style={{ fontWeight: 600 }}>
                <td style={{ ...td, textAlign: 'left' }}>Total</td>
                <td style={td}>{fmtEur(fPrimary)}</td>
                <td style={td}>{fmtEur(rPrimary)}</td>
                <td style={{ ...td, color: rPrimary - fPrimary >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{(rPrimary - fPrimary >= 0 ? '+' : '') + fmtEur(rPrimary - fPrimary)}</td>
                <td style={td}>{fmtEur(dhPrimary)}</td>
                <td style={td}>{fmtEur(redPrimary)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
