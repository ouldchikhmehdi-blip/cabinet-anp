import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import BoutonExport from '../components/BoutonExport'
import EtatCompta from '../components/EtatCompta'
import { useCompta } from '../data/compta'
import { usePeriode } from '../data/periode'
import { MOIS_COURT, MOIS_LONG, fmtEur, sum, diffLabel, diffColor, getMasqueMontants, couleurAnnee, ordreAffichage } from '../data/mockData'

const ACCENT = '#534AB7'

// Colonnes du tableau « Par associé » : clé dans RETRO_PAR_ASSOCIE[y][ini] → libellé
const COLONNES_ASSOCIE = [
  ['fixe', 'Reversement fixe'],
  ['complement', 'Complément'],
  ['reliquat', 'Reliquat'],
  ['regularisation', 'Régularisation'],
  ['rcp', 'RCP'],
  ['frais', 'Frais remboursés'],
  ['recu', "Reçu de l'associé"],
  ['total', 'Total'],
]

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

export default function Retrocessions() {
  const etat = useCompta()
  const S = etat.series
  const P = usePeriode(S.ANNEES)
  const { de, a, primary, ref, years } = P

  const masque = getMasqueMontants()
  const labels = MOIS_COURT.slice(de, a + 1)
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]
  const moisActuel = S.moisActuel(primary)

  const fixeDe = (y) => (S.RETRO_FIXE[y] || []).slice(de, a + 1)
  const varDe = (y) => (S.RETRO_VARIABLE[y] || []).slice(de, a + 1)
  const totalSerie = (y) => fixeDe(y).map((v, i) => v + (varDe(y)[i] ?? 0))

  const tFixePrimary = sum(fixeDe(primary))
  const tVarPrimary = sum(varDe(primary))
  const tTotPrimary = sum(totalSerie(primary))
  const tTotRef = sum(totalSerie(ref))
  const cumulAujourdhui = sum((S.RETRO_FIXE[primary] || []).slice(0, moisActuel + 1)) + sum((S.RETRO_VARIABLE[primary] || []).slice(0, moisActuel + 1))

  // Barres empilées fixe/variable : année principale.
  const dataBar = labels.map((m, i) => ({ mois: m, fixe: fixeDe(primary)[i] ?? 0, variable: varDe(primary)[i] ?? 0 }))
  // Cumul du total versé : une courbe par année comparée.
  const dataCumul = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = sum(totalSerie(y).slice(0, i + 1)) })
    return row
  })

  // Détail par associé sur l'année principale (année entière, hors filtre de mois).
  const parAssocie = S.RETRO_PAR_ASSOCIE[primary] || {}
  const initiales = Object.keys(parAssocie).sort()
  const totalAssocies = Object.fromEntries(COLONNES_ASSOCIE.map(([k]) => [k, sum(initiales.map(ini => parAssocie[ini][k] || 0))]))

  const exportsRetro = [{
    label: 'Virements associés',
    build: () => {
      const lignes = labels.map((_, i) => {
        const row = { Mois: MOIS_LONG[de + i] }
        years.forEach(y => {
          row[`Fixe ${y}`] = fixeDe(y)[i] ?? 0
          row[`Variable ${y}`] = varDe(y)[i] ?? 0
          row[`Total ${y}`] = (fixeDe(y)[i] ?? 0) + (varDe(y)[i] ?? 0)
        })
        return row
      })
      const total = { Mois: 'TOTAL' }
      years.forEach(y => {
        total[`Fixe ${y}`] = sum(fixeDe(y))
        total[`Variable ${y}`] = sum(varDe(y))
        total[`Total ${y}`] = sum(totalSerie(y))
      })
      lignes.push(total)
      return { nomFichier: `virements-associes_${MOIS_COURT[de]}-${MOIS_COURT[a]}_${years.join('-')}.xlsx`, lignes, feuille: 'Virements associés' }
    }
  }]
  // BoutonExport ne gère qu'une feuille par export : le détail par associé est un 2e export du menu.
  if (initiales.length > 0) {
    exportsRetro.push({
      label: `Par associé · ${primary}`,
      build: () => {
        const ligne = (nom, src) => Object.fromEntries([['Associé', nom], ...COLONNES_ASSOCIE.map(([k, lib]) => [lib, Math.round(src[k] || 0)])])
        const lignes = initiales.map(ini => ligne(ini, parAssocie[ini]))
        lignes.push(ligne('TOTAL', totalAssocies))
        return { nomFichier: `virements-par-associe_${primary}.xlsx`, lignes, feuille: `Par associé ${primary}` }
      }
    })
  }

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }
  const thStyle = { fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', textAlign: 'right', padding: '6px 8px', borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap' }
  const tdStyle = { fontSize: 12, textAlign: 'right', padding: '6px 8px', borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Virements associés</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>
            {S.nbAssocies} associés · parts égales
          </span>
          <BoutonExport exports={exportsRetro} disabled={masque} />
        </div>
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
        <KpiCard label={`Fixe versé · ${primary}`} value={fmtEur(tFixePrimary)} sub={periode} subColor="neutral" />
        <KpiCard label={`Variable versé · ${primary}`} value={fmtEur(tVarPrimary)} sub={periode} subColor="neutral" />
        <KpiCard
          label={`Total / associé · ${primary}`}
          value={fmtEur(tTotPrimary)}
          sub={diffLabel(tTotPrimary, tTotRef, ref)}
          subColor={diffColor(tTotPrimary, tTotRef)}
        />
        <KpiCard
          label="Cumul versé / associé à ce jour"
          value={fmtEur(cumulAujourdhui)}
          sub={`Jan → ${MOIS_COURT[moisActuel]} ${primary}`}
          subColor="neutral"
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Versement mensuel / associé · {primary} — {periode}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#534AB7', borderRadius: 2 }} /> Fixe
            </span>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#1D9E75', borderRadius: 2 }} /> Variable
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataBar}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(1)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            <Bar dataKey="fixe" stackId="s" fill="#534AB7" radius={[0,0,0,0]} name="Fixe" />
            <Bar dataKey="variable" stackId="s" fill="#1D9E75" radius={[3,3,0,0]} name="Variable" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Cumul versé / associé — {periode}
          </span>
          <LegendAnnees years={years} />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dataCumul}>
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
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {initiales.length > 0 && (
        <div style={cardStyle}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
              Par associé · {primary}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Associé</th>
                  {COLONNES_ASSOCIE.map(([k, lib]) => <th key={k} style={thStyle}>{lib}</th>)}
                </tr>
              </thead>
              <tbody>
                {initiales.map(ini => (
                  <tr key={ini}>
                    <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 500 }}>{ini}</td>
                    {COLONNES_ASSOCIE.map(([k]) => (
                      <td key={k} style={{ ...tdStyle, fontWeight: k === 'total' ? 500 : 400 }}>{fmtEur(parAssocie[ini][k] || 0)}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>TOTAL</td>
                  {COLONNES_ASSOCIE.map(([k]) => (
                    <td key={k} style={{ ...tdStyle, fontWeight: 600, borderBottom: 'none' }}>{fmtEur(totalAssocies[k])}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
