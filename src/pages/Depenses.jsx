import { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import BoutonExport from '../components/BoutonExport'
import { entreeReleve } from '../utils/exportReleve'
import EtatCompta from '../components/EtatCompta'
import { useCompta, GROUPES_DEPENSES } from '../data/compta'
import ContenuCategorie from '../components/ContenuCategorie'
import { usePeriode } from '../data/periode'
import { couleurGroupe } from '../data/categories'
import { MOIS_COURT, MOIS_LONG, fmtEur, sum, diffLabel, diffColor, getMasqueMontants, couleurAnnee, ordreAffichage } from '../data/mockData'
import { echelle, axeK, sansMoisFuturs } from '../utils/echelle'

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
  const etat = useCompta()
  const S = etat.series
  const DEPENSES = S.DEPENSES
  const P = usePeriode(S.ANNEES)
  const { moisDe, setMoisDe, moisA, setMoisA, years, setYears, shortcut, setShortcut, de, a, primary, ref } = P

  // La liste des dépenses peut être vide ou changer après chargement : on resélectionne la première
  // (état réinitialisé pendant le rendu quand la liste des ids change, sans effet).
  const idsCle = DEPENSES.map(d => d.id).join('|')
  const [selectedId, setSelectedId] = useState(idsCle.split('|')[0] || null)
  const [idsVus, setIdsVus] = useState(idsCle)
  if (idsVus !== idsCle) {
    setIdsVus(idsCle)
    setSelectedId(idsCle.split('|')[0] || null)
  }

  const masque = getMasqueMontants()
  const labels = MOIS_COURT.slice(de, a + 1)
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]
  const moisActuel = S.moisActuel(primary)

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }

  const enTete = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <h1 style={{ fontSize: 18, fontWeight: 500 }}>Dépenses</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 11, background: 'var(--color-primary-light)',
          color: 'var(--color-primary-dark)', padding: '3px 10px',
          borderRadius: 20, fontWeight: 500
        }}>SARM · 8 associés</span>
        {DEPENSES.length > 0 && <BoutonExport exports={[...exportsReleveDe(etat.transactions, DEPENSES.find(d => d.id === selectedId) || DEPENSES[0], years, de, a), ...exportsDe(DEPENSES, labels, de, a, years)]} disabled={masque} />}
      </div>
    </div>
  )

  if (DEPENSES.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
        {enTete}
        <EtatCompta etat={etat} />
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          Aucune dépense classée — classez des débits en « Charges sociales et fiscales » ou « Fonctionnement » dans « Règles virements ».
        </div>
      </div>
    )
  }

  const selected = DEPENSES.find(d => d.id === selectedId) || DEPENSES[0]
  const groupes = [...new Set(DEPENSES.map(d => d.groupe))]

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
  const cumulAujourdhui = sum((selected.montants[primary] || []).slice(0, moisActuel + 1))
  const moyenne = serieDe(primary).length ? tPrimary / serieDe(primary).length : 0

  const dataBar = sansMoisFuturs(labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = serieDe(y)[i] ?? 0 })
    return row
  }), S, de)
  const dataCumul = sansMoisFuturs(labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = sum(serieDe(y).slice(0, i + 1)) })
    return row
  }), S, de)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      {enTete}
      <EtatCompta etat={etat} />

      <PeriodeFilter
        moisDe={moisDe} setMoisDe={setMoisDe}
        moisA={moisA} setMoisA={setMoisA}
        years={years} setYears={setYears}
        shortcut={shortcut} setShortcut={setShortcut}
        availableYears={S.ANNEES}
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
            <YAxis {...echelle(dataStack, { empile: true })} tick={{ fontSize: 11 }} tickFormatter={axeK} hide={masque} />
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

      {/* Sélecteur de catégories, groupé par groupe de la taxonomie */}
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, letterSpacing: '0.04em' }}>
        Catégories — cliquez pour le détail
      </div>
      {groupes.map(groupe => (
        <div key={groupe} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...couleurGroupe(groupe), fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10 }}>{groupe}</span>
            <span style={{ flex: 1, borderTop: '0.5px solid var(--color-border)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {DEPENSES.filter(d => d.groupe === groupe).map(dep => {
              const total = sum((dep.montants[primary] || []).slice(de, a + 1))
              const isSel = dep.id === selected.id
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
                    marginBottom: 8
                  }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: dep.couleur }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)', marginBottom: 8 }}>{dep.nom}</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>{fmtEur(total)}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>total {primary} · {periode}</div>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Détail de la catégorie sélectionnée */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <KpiCard label={`${selected.nom} · ${primary}`} value={fmtEur(tPrimary)} sub={periode} subColor="neutral" />
        {ref !== undefined && (
          <KpiCard
            label={`${selected.nom} · ${ref}`}
            value={fmtEur(tRef)}
            sub={diffLabel(tPrimary, tRef, ref)}
            subColor={diffColor(tPrimary, tRef, true)}
          />
        )}
        <KpiCard label="Cumul à ce jour" value={fmtEur(cumulAujourdhui)} sub={`Jan → ${MOIS_COURT[moisActuel]} ${primary}`} subColor="neutral" />
        <KpiCard label="Moyenne mensuelle" value={fmtEur(moyenne)} sub={`sur ${serieDe(primary).length} mois`} subColor="neutral" />
      </div>

      <ContenuCategorie
        key={selected.id}
        categorie={selected.nom}
        doc={etat.doc}
        transactions={etat.transactions}
        annee={primary} de={de} a={a} periode={periode}
        cardStyle={cardStyle}
        sens="debit"
      />

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            {selected.nom} — coût mensuel · {periode}
          </span>
          <LegendAnnees years={years} accent={selected.couleur} type="bar" />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart key={years.join('-')} data={dataBar}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis {...echelle(dataBar)} tick={{ fontSize: 11 }} tickFormatter={axeK} hide={masque} />
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
            <YAxis {...echelle(dataCumul)} tick={{ fontSize: 11 }} tickFormatter={axeK} hide={masque} />
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

// Exports des lignes du relevé : toutes les dépenses, puis la catégorie sélectionnée
function exportsReleveDe(transactions, selected, years, de, a) {
  const entrees = [entreeReleve({ label: 'Lignes du relevé : toutes les dépenses', page: 'depenses', transactions, years, de, a, filtre: t => t.montant < 0 && GROUPES_DEPENSES.includes(t.groupe) })]
  if (selected) entrees.push(entreeReleve({ label: `Lignes du relevé : ${selected.nom}`, page: `depenses-${selected.id}`, transactions, years, de, a, filtre: t => t.montant < 0 && t.categorie === selected.nom }))
  return entrees
}

// Exports Excel : toutes les dépenses, puis une entrée par catégorie (période et années sélectionnées).
function exportsDe(DEPENSES, labels, de, a, years) {
  const suffixe = `${MOIS_COURT[de]}-${MOIS_COURT[a]}_${years.join('-')}.xlsx`
  return [
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
}
