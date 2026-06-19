import { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import BoutonExport from '../components/BoutonExport'
import { DEPENSES, MOIS_COURT, MOIS_LONG, ANNEES, fmtEur, sum, diffLabel, diffColor, MOIS_ACTUEL, getMasqueMontants, couleurAnnee, ordreAffichage, periodeParDefaut } from '../data/mockData'

// Légende des années comparées pour le détail d'une catégorie (accent = couleur de la catégorie).
function LegendAnnees({ years, accent, type }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {ordreAffichage(years).map(({ y, rang }) => (
        <span key={y} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
          {type === 'line'
            ? <span style={{ display: 'inline-block', width: 18, height: 0, borderTop: `2px ${rang === 0 ? 'solid' : 'dashed'} ${couleurAnnee(rang, accent)}` }} />
            : <span style={{ display: 'inline-block', width: 10, height: 10, background: couleurAnnee(rang, accent), borderRadius: 2 }} />}
          {y}
        </span>
      ))}
    </div>
  )
}

export default function Depenses() {
  const def = periodeParDefaut(ANNEES)
  const [moisDe, setMoisDe] = useState(def.moisDe)
  const [moisA, setMoisA] = useState(def.moisA)
  const [years, setYears] = useState(def.years)
  const [shortcut, setShortcut] = useState(def.shortcut)
  const [selectedId, setSelectedId] = useState(DEPENSES[0].id)

  const de = Math.min(moisDe, moisA)
  const a = Math.max(moisDe, moisA)
  const masque = getMasqueMontants()
  const labels = MOIS_COURT.slice(de, a + 1)
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]

  const primary = years.at(-1)  // années triées croissant → la plus récente est en dernier
  const ref = years.at(-2)
  const selected = DEPENSES.find(d => d.id === selectedId) || DEPENSES[0]

  // Vue d'ensemble — répartition empilée par catégorie pour l'année principale.
  const dataStack = labels.map((m, i) => {
    const row = { mois: m }
    DEPENSES.forEach(dep => { row[dep.id] = (dep.montants[primary] || [])[de + i] ?? 0 })
    return row
  })

  // Détail de la catégorie sélectionnée — toutes les années comparées.
  const serieDe = (y) => (selected.montants[y] || []).slice(de, a + 1)
  const totalDe = (y) => sum(serieDe(y))
  const tPrimary = totalDe(primary), tRef = totalDe(ref)
  const cumulAujourdhui = sum((selected.montants[primary] || []).slice(0, MOIS_ACTUEL + 1))
  const moyenne = serieDe(primary).length ? tPrimary / serieDe(primary).length : 0

  const dataBar = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = serieDe(y)[i] ?? 0 })
    return row
  })
  const dataCumul = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = sum(serieDe(y).slice(0, i + 1)) })
    return row
  })

  const suffixe = `${MOIS_COURT[de]}-${MOIS_COURT[a]}_${years.join('-')}.xlsx`
  const exports = [
    {
      label: 'Toutes les dépenses',
      build: () => {
        const lignes = labels.map((_, i) => {
          const m = de + i
          const row = { Mois: MOIS_LONG[m] }
          DEPENSES.forEach(dep => {
            years.forEach(y => { row[`${dep.nom} ${y}`] = (dep.montants[y] || [])[m] ?? 0 })
          })
          years.forEach(y => { row[`Total ${y}`] = DEPENSES.reduce((s, dep) => s + ((dep.montants[y] || [])[m] ?? 0), 0) })
          return row
        })
        const totalRow = { Mois: 'TOTAL' }
        DEPENSES.forEach(dep => {
          years.forEach(y => { totalRow[`${dep.nom} ${y}`] = sum((dep.montants[y] || []).slice(de, a + 1)) })
        })
        years.forEach(y => { totalRow[`Total ${y}`] = DEPENSES.reduce((s, dep) => s + sum((dep.montants[y] || []).slice(de, a + 1)), 0) })
        lignes.push(totalRow)
        return { nomFichier: `depenses_toutes_${suffixe}`, lignes, feuille: 'Dépenses' }
      }
    },
    ...DEPENSES.map(dep => ({
      label: dep.nom,
      build: () => {
        const lignes = labels.map((_, i) => {
          const m = de + i
          const row = { Mois: MOIS_LONG[m] }
          years.forEach(y => { row[`${dep.nom} ${y}`] = (dep.montants[y] || [])[m] ?? 0 })
          return row
        })
        const totalRow = { Mois: 'TOTAL' }
        years.forEach(y => { totalRow[`${dep.nom} ${y}`] = sum((dep.montants[y] || []).slice(de, a + 1)) })
        lignes.push(totalRow)
        return { nomFichier: `depenses_${dep.id}_${suffixe}`, lignes, feuille: dep.nom }
      }
    })),
  ]

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Dépenses</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, background: 'var(--color-primary-light)',
            color: 'var(--color-primary-dark)', padding: '3px 10px',
            borderRadius: 20, fontWeight: 500
          }}>SARM · 8 associés</span>
          <BoutonExport exports={exports} disabled={masque} />
        </div>
      </div>

      <PeriodeFilter
        moisDe={moisDe} setMoisDe={setMoisDe}
        moisA={moisA} setMoisA={setMoisA}
        years={years} setYears={setYears}
        shortcut={shortcut} setShortcut={setShortcut}
        availableYears={ANNEES}
      />

      {/* Vue d'ensemble — répartition des dépenses par catégorie (année principale) */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Répartition par catégorie · {primary} — {periode}
          </span>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {DEPENSES.map(dep => (
              <span key={dep.id} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: dep.couleur, borderRadius: 2 }} />
                {dep.nom}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataStack}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(1)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [fmtEur(v), DEPENSES.find(d => d.id === name)?.nom || name]} />
            {DEPENSES.map((dep, i) => (
              <Bar
                key={dep.id}
                dataKey={dep.id}
                stackId="dep"
                fill={dep.couleur}
                radius={i === DEPENSES.length - 1 ? [3,3,0,0] : [0,0,0,0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Sélecteur de catégories */}
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, letterSpacing: '0.04em' }}>
        Catégories — cliquez pour le détail
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {DEPENSES.map(dep => {
          const total = sum((dep.montants[primary] || []).slice(de, a + 1))
          const isSel = dep.id === selectedId
          return (
            <button
              key={dep.id}
              onClick={() => setSelectedId(dep.id)}
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
                background: `${dep.couleur}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, marginBottom: 8
              }}>
                {dep.icon}
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)', marginBottom: 8 }}>{dep.nom}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>{fmtEur(total)}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>total {primary} · {periode}</div>
            </button>
          )
        })}
      </div>

      {/* Détail de la catégorie sélectionnée */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <KpiCard label={`${selected.nom} · ${primary}`} value={fmtEur(tPrimary)} sub={periode} subColor="neutral" />
        <KpiCard
          label={`${selected.nom} · ${ref}`}
          value={fmtEur(tRef)}
          sub={diffLabel(tPrimary, tRef, ref)}
          subColor={diffColor(tPrimary, tRef, true)}
        />
        <KpiCard label="Cumul à ce jour" value={fmtEur(cumulAujourdhui)} sub={`Jan → ${MOIS_COURT[MOIS_ACTUEL]} ${primary}`} subColor="neutral" />
        <KpiCard label="Moyenne mensuelle" value={fmtEur(moyenne)} sub={`sur ${serieDe(primary).length} mois`} subColor="neutral" />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            {selected.nom} — coût mensuel · {periode}
          </span>
          <LegendAnnees years={years} accent={selected.couleur} type="bar" />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataBar}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(1)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            {ordreAffichage(years).map(({ y, rang }) => (
              <Bar key={y} dataKey={y} fill={couleurAnnee(rang, selected.couleur)} radius={[3,3,0,0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            {selected.nom} — coût cumulé · {periode}
          </span>
          <LegendAnnees years={years} accent={selected.couleur} type="line" />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dataCumul}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v/1000).toFixed(1)+'k'} hide={masque} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
            {ordreAffichage(years).map(({ y, rang }) => (
              <Line
                key={y}
                type="monotone"
                dataKey={y}
                stroke={couleurAnnee(rang, selected.couleur)}
                strokeWidth={rang === 0 ? 2 : 1.5}
                strokeDasharray={rang === 0 ? undefined : '5 4'}
                dot={{ r: rang === 0 ? 3 : 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
