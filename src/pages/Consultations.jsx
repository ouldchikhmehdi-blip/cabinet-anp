import { useState, useCallback } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import ImportConsultations from '../components/ImportConsultations'
import GestionPraticiens from '../components/GestionPraticiens'
import { getConsultData } from '../data/consultations'
import { MOIS_COURT, ANNEES, sum, diffLabel, diffColor, MOIS_ACTUEL, couleurAnnee, ordreAffichage, periodeParDefaut } from '../data/mockData'

const fmtNb = v => Math.round(v).toLocaleString('fr-FR')
const PALETTE = ['#534AB7', '#1D9E75', '#EF9F27', '#D85A30', '#7A8B99']

// Motif de pointillés d'une courbe selon le RANG de l'année (rang 0 = trait plein). Couplé à la couleur
// distincte (couleurAnnee), il rend chaque année identifiable même superposée : plein → tirets → pointillés
// → tiret-point. Réutilisé par la légende pour qu'elle reproduise EXACTEMENT le trait du graphique.
const DASH_ANNEE = [undefined, '7 4', '2 3', '9 3 2 3']
const dashAnnee = rang => DASH_ANNEE[Math.min(rang, DASH_ANNEE.length - 1)]

// Grille et axes neutres (gris moyen) → lisibles en thème CLAIR comme SOMBRE, sans dépendre du fond.
const GRID_STROKE = 'rgba(128,128,128,0.22)'
const TICK = { fontSize: 11, fill: '#8C8A82' }

// Tableau mensuel d'une spécialité : somme des praticiens + bucket valeurs (consultations non attribuées)
const specMensuel = (sp, year) => {
  if (!sp.praticiens) return (sp.valeurs || {})[year] || Array(12).fill(0)
  const pratPart = Array.from({ length: 12 }, (_, m) =>
    sum(sp.praticiens.map(p => (p.valeurs[year] || [])[m] ?? 0))
  )
  const valPart = (sp.valeurs || {})[year] || Array(12).fill(0)
  return Array.from({ length: 12 }, (_, m) => pratPart[m] + (valPart[m] || 0))
}

// Légende des années comparées (carré = barres, trait = courbes).
function LegendAnnees({ years, accent, type }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {ordreAffichage(years).map(({ y, rang }) => (
        <span key={y} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
          {type === 'line'
            ? (
              <svg width="22" height="8" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
                <line
                  x1="1" y1="4" x2="21" y2="4"
                  stroke={couleurAnnee(rang, accent)} strokeWidth="2.4"
                  strokeDasharray={dashAnnee(rang)} strokeLinecap="round"
                />
              </svg>
            )
            : <span style={{ display: 'inline-block', width: 10, height: 10, background: couleurAnnee(rang, accent), borderRadius: 2 }} />}
          {y}
        </span>
      ))}
    </div>
  )
}

export default function Consultations() {
  const [consultData, setConsultData] = useState(() => getConsultData())
  const { global: CONSULTATIONS, teleconsultations: TELECONSULTATIONS, specialites: CONSULT_SPECIALITES } = consultData

  const rafraichir = useCallback(() => setConsultData(getConsultData()), [])

  const def = periodeParDefaut([...new Set([...ANNEES, ...Object.keys(CONSULTATIONS).map(Number)])])
  const [moisDe, setMoisDe] = useState(def.moisDe)
  const [moisA, setMoisA] = useState(def.moisA)
  const [years, setYears] = useState(def.years)
  const [shortcut, setShortcut] = useState(def.shortcut)
  const [specId, setSpecId] = useState(CONSULT_SPECIALITES[0].id)
  // Sélection de praticiens (multi). Liste vide = « Tous ».
  const [pratSel, setPratSel] = useState([])
  // Vue agrégée : une seule courbe = total de la spécialité (somme des praticiens), comparable année/année.
  // Vue par défaut : c'est la donnée la plus parlante (évolution annuelle de la spécialité entière).
  const [vueAgregee, setVueAgregee] = useState(true)

  // Années disponibles : union de ANNEES (mock) et des années présentes dans le store
  const anneesDispos = [...new Set([...ANNEES, ...Object.keys(CONSULTATIONS).map(Number)])].sort((a, b) => b - a)

  // Spécialités affichées = les spécialités du store + une catégorie « Téléconsultation » dérivée
  // de TELECONSULTATIONS (suivi global, sans praticien) — pour la visualiser comme les autres.
  const specialitesAffichees = [
    ...CONSULT_SPECIALITES,
    { id: 'teleconsultation', nom: 'Téléconsultation', couleur: '#0E7490', valeurs: TELECONSULTATIONS },
  ]

  const de = Math.min(moisDe, moisA)
  const a = Math.max(moisDe, moisA)
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]
  const labels = MOIS_COURT.slice(de, a + 1)

  const primary = years.at(-1)  // années triées croissant → la plus récente est en dernier
  const ref = years.at(-2)

  // ── Niveau global (toutes consultations) ──
  const consultDe = (y) => (CONSULTATIONS[y] || []).slice(de, a + 1)
  const t1 = sum(consultDe(primary)), t2 = sum(consultDe(ref))
  const allPrimary = CONSULTATIONS[primary] || []
  const cumulAujourdhui = sum(allPrimary.slice(0, MOIS_ACTUEL + 1))
  const moyenne = consultDe(primary).length ? t1 / consultDe(primary).length : 0

  const tc1 = sum((TELECONSULTATIONS[primary] || []).slice(de, a + 1))
  const tc2 = sum((TELECONSULTATIONS[ref] || []).slice(de, a + 1))
  const partTele = t1 ? Math.round(tc1 / t1 * 100) : 0

  const dataBar = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = consultDe(y)[i] ?? 0 })
    return row
  })
  const dataCumul = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = sum(consultDe(y).slice(0, i + 1)) })
    return row
  })

  // Spécialité sélectionnée
  const spec = specialitesAffichees.find(s => s.id === specId) || specialitesAffichees[0]
  const specSerieDe = (y) => specMensuel(spec, y).slice(de, a + 1)
  const specTprimary = sum(specSerieDe(primary)), specTref = sum(specSerieDe(ref))

  // Praticiens visibles (non masqués) pour le détail — les masqués restent dans les totaux via specMensuel
  const hasPrat = !!spec.praticiens
  const pratsVisibles = hasPrat ? spec.praticiens.filter(p => !p.masque) : []

  // Couleur stable d'un praticien : indexée sur sa position dans la liste visible
  const colorOf = p => PALETTE[Math.max(0, pratsVisibles.findIndex(x => x.id === p.id)) % PALETTE.length]

  // Sélection courante : on ne garde que des praticiens encore visibles (garde-fou contre un masqué)
  const selValides = (hasPrat && !vueAgregee) ? pratSel.filter(id => pratsVisibles.some(p => p.id === id)) : []
  const isAllPrat = hasPrat && !vueAgregee && selValides.length === 0   // « Tous »
  const isSinglePrat = hasPrat && selValides.length === 1   // un seul → comparaison année vs année
  const isMultiPrat = hasPrat && selValides.length >= 2     // plusieurs → courbes superposées
  const showMulti = isAllPrat || isMultiPrat                // graphiques multi-praticiens (année principale)

  // Praticiens affichés dans les graphiques de détail : la sélection, ou tous si « Tous »
  const detailPrats = isMultiPrat ? pratsVisibles.filter(p => selValides.includes(p.id)) : pratsVisibles

  // Praticien isolé (un seul sélectionné) : conserve la comparaison année vs année
  const prat = isSinglePrat ? pratsVisibles.find(p => p.id === selValides[0]) : null

  // Série « année vs année » active (spécialité entière sans praticiens, OU un praticien isolé) — toutes les années.
  const aColor = prat ? colorOf(prat) : spec.couleur
  const aSerieDe = (y) => prat ? (prat.valeurs[y] || []).slice(de, a + 1) : specSerieDe(y)
  const aTprimary = sum(aSerieDe(primary)), aTref = sum(aSerieDe(ref))

  const aBar = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = aSerieDe(y)[i] ?? 0 })
    return row
  })
  const aCumul = labels.map((m, i) => {
    const row = { mois: m }
    years.forEach(y => { row[y] = sum(aSerieDe(y).slice(0, i + 1)) })
    return row
  })

  // Totaux du groupe de praticiens affichés (KPI multi-sélection) — année principale vs référence
  const detailTprimary = sum(detailPrats.map(p => sum((p.valeurs[primary] || []).slice(de, a + 1))))
  const detailTref = sum(detailPrats.map(p => sum((p.valeurs[ref] || []).slice(de, a + 1))))

  // Bucket « non attribué » : consultations au niveau spécialité, sur l'année principale
  const autreValues = hasPrat && spec.valeurs ? (spec.valeurs[primary] || Array(12).fill(0)) : null
  const hasAutre = !!autreValues && autreValues.some(v => v > 0)
  const showAutre = isAllPrat && hasAutre   // bucket affiché seulement en vue « Tous »

  // Données multi-praticiens (année principale) : empilé (mensuel) + multi-lignes (cumul)
  const pratBar = showMulti ? labels.map((m, i) => {
    const row = { mois: m }
    detailPrats.forEach(p => { row[p.id] = (p.valeurs[primary] || [])[de + i] ?? 0 })
    if (showAutre) row['__autre'] = autreValues[de + i] ?? 0
    return row
  }) : []
  const pratCumul = showMulti ? labels.map((m, i) => {
    const row = { mois: m }
    detailPrats.forEach(p => { row[p.id] = sum((p.valeurs[primary] || []).slice(de, de + i + 1)) })
    if (showAutre) row['__autre'] = sum(autreValues.slice(de, de + i + 1))
    return row
  }) : []

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }
  const pillBase = {
    fontSize: 11, padding: '4px 12px', borderRadius: 16,
    border: '0.5px solid var(--color-border)', background: 'var(--color-surface)',
    color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
  }
  const pillActive = { ...pillBase, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', borderColor: 'var(--color-primary)', fontWeight: 500 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Consultations</h1>
        <span style={{
          fontSize: 11, background: 'var(--color-primary-light)',
          color: 'var(--color-primary-dark)', padding: '3px 10px',
          borderRadius: 20, fontWeight: 500
        }}>Activité · nombre</span>
      </div>

      <ImportConsultations onImportValide={rafraichir} />

      <PeriodeFilter
        moisDe={moisDe} setMoisDe={setMoisDe}
        moisA={moisA} setMoisA={setMoisA}
        years={years} setYears={setYears}
        shortcut={shortcut} setShortcut={setShortcut}
        availableYears={anneesDispos}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        <KpiCard label={`Consultations · ${primary}`} value={fmtNb(t1)} sub={periode} subColor="neutral" />
        <KpiCard label={`Consultations · ${ref}`} value={fmtNb(t2)} sub={diffLabel(t1, t2, ref)} subColor={diffColor(t1, t2)} />
        <KpiCard label={`Téléconsultations · ${primary}`} value={fmtNb(tc1)} sub={`${partTele} % · ${diffLabel(tc1, tc2, ref)}`} subColor="neutral" />
        <KpiCard label="Cumul à ce jour" value={fmtNb(cumulAujourdhui)} sub={`Jan → ${MOIS_COURT[MOIS_ACTUEL]} ${primary}`} subColor="neutral" />
        <KpiCard label="Moyenne mensuelle" value={fmtNb(moyenne)} sub={`sur ${consultDe(primary).length} mois`} subColor="neutral" />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Consultations par mois — {periode}
          </span>
          <LegendAnnees years={years} accent="#1D9E75" type="bar" />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataBar}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="mois" tick={TICK} />
            <YAxis tick={TICK} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => `${fmtNb(v)} consult.`} />
            {ordreAffichage(years).map(({ y, rang }) => (
              <Bar key={y} dataKey={y} fill={couleurAnnee(rang, '#1D9E75')} radius={[3,3,0,0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Consultations cumulées — {periode}
          </span>
          <LegendAnnees years={years} accent="#1D9E75" type="line" />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dataCumul}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="mois" tick={TICK} />
            <YAxis tick={TICK} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => `${fmtNb(v)} consult.`} />
            {ordreAffichage(years).map(({ y, rang }) => (
              <Line
                key={y}
                type="monotone"
                dataKey={y}
                stroke={couleurAnnee(rang, '#1D9E75')}
                strokeWidth={rang === 0 ? 2.6 : 2}
                strokeDasharray={dashAnnee(rang)}
                dot={{ r: rang === 0 ? 3 : 2.4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Sélecteur de spécialités */}
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, letterSpacing: '0.04em', marginTop: 6 }}>
        Par spécialité — cliquez pour le détail
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {specialitesAffichees.map(sp => {
          const total = sum(specMensuel(sp, primary).slice(de, a + 1))
          const isSel = sp.id === specId
          return (
            <button
              key={sp.id}
              onClick={() => { setSpecId(sp.id); setPratSel([]); setVueAgregee(true) }}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: sp.couleur, borderRadius: 3 }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{sp.nom}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>{fmtNb(total)}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                consultations {primary} · {periode}{sp.praticiens ? ` · ${sp.praticiens.filter(p => !p.masque).length} praticien${sp.praticiens.filter(p => !p.masque).length > 1 ? 's' : ''}` : ''}
              </div>
            </button>
          )
        })}
      </div>

      {/* Pills praticiens + gestion (uniquement si la spécialité en a) */}
      {hasPrat && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginRight: 2 }}>Praticien</span>
            <button onClick={() => { setVueAgregee(false); setPratSel([]) }} style={isAllPrat ? pillActive : pillBase}>Tous</button>
            <button
              onClick={() => { setVueAgregee(true); setPratSel([]) }}
              style={vueAgregee ? pillActive : pillBase}
              title={`${spec.nom} — total agrégé en une seule courbe (comparable d'une année à l'autre)`}
            >
              <span style={{ display: 'inline-block', width: 8, height: 8, background: spec.couleur, borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }} />
              {spec.nom}
            </button>
            {pratsVisibles.map((p, i) => {
              const on = selValides.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => { setVueAgregee(false); setPratSel(sel => sel.includes(p.id) ? sel.filter(x => x !== p.id) : [...sel, p.id]) }}
                  style={on ? pillActive : pillBase}
                >
                  <span style={{ display: 'inline-block', width: 8, height: 8, background: PALETTE[i % PALETTE.length], borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }} />
                  {p.nom.replace(/^Dr\s+/, '')}
                </button>
              )
            })}
          </div>
          <GestionPraticiens spec={spec} onChange={rafraichir} />
        </>
      )}

      {/* Détail */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {isSinglePrat ? (
          <>
            <KpiCard label={`${prat.nom} · ${primary}`} value={fmtNb(aTprimary)} sub={periode} subColor="neutral" />
            <KpiCard label={`${prat.nom} · ${ref}`} value={fmtNb(aTref)} sub={diffLabel(aTprimary, aTref, ref)} subColor={diffColor(aTprimary, aTref)} />
            <KpiCard label="Part de la spécialité" value={`${specTprimary ? Math.round(aTprimary / specTprimary * 100) : 0} %`} sub={`de ${spec.nom} · ${periode}`} subColor="neutral" />
          </>
        ) : isMultiPrat ? (
          <>
            <KpiCard label={`${detailPrats.length} praticiens · ${primary}`} value={fmtNb(detailTprimary)} sub={periode} subColor="neutral" />
            <KpiCard label={`${detailPrats.length} praticiens · ${ref}`} value={fmtNb(detailTref)} sub={diffLabel(detailTprimary, detailTref, ref)} subColor={diffColor(detailTprimary, detailTref)} />
            <KpiCard label="Part de la spécialité" value={`${specTprimary ? Math.round(detailTprimary / specTprimary * 100) : 0} %`} sub={`de ${spec.nom} · ${periode}`} subColor="neutral" />
          </>
        ) : (
          <>
            <KpiCard label={`${spec.nom} · ${primary}`} value={fmtNb(specTprimary)} sub={periode} subColor="neutral" />
            <KpiCard label={`${spec.nom} · ${ref}`} value={fmtNb(specTref)} sub={diffLabel(specTprimary, specTref, ref)} subColor={diffColor(specTprimary, specTref)} />
            <KpiCard label="Part des consultations" value={`${t1 ? Math.round(specTprimary / t1 * 100) : 0} %`} sub={`du total ${primary} · ${periode}`} subColor="neutral" />
          </>
        )}
      </div>

      {showMulti ? (
        <>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                {spec.nom} — {isMultiPrat ? 'praticiens sélectionnés' : 'répartition par praticien'} · {primary} · {periode}
              </span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {detailPrats.map(p => (
                  <span key={p.id} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: colorOf(p), borderRadius: 2 }} />
                    {p.nom.replace(/^Dr\s+/, '')}
                  </span>
                ))}
                {showAutre && (
                  <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: '#B4B2A9', borderRadius: 2 }} />
                    Autre / non attribué
                  </span>
                )}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={pratBar}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="mois" tick={TICK} />
                <YAxis tick={TICK} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [
                  `${fmtNb(v)} consult.`,
                  name === '__autre' ? 'Autre / non attribué' : (pratsVisibles.find(p => p.id === name)?.nom || name),
                ]} />
                {detailPrats.map((p, i) => (
                  <Bar
                    key={p.id}
                    dataKey={p.id}
                    stackId="prat"
                    fill={colorOf(p)}
                    radius={i === detailPrats.length - 1 && !showAutre ? [3,3,0,0] : [0,0,0,0]}
                  />
                ))}
                {showAutre && (
                  <Bar dataKey="__autre" stackId="prat" fill="#B4B2A9" radius={[3,3,0,0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                {spec.nom} — cumulé par praticien{isMultiPrat ? ' (sélection)' : ''} · {primary} · {periode}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={pratCumul}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="mois" tick={TICK} />
                <YAxis tick={TICK} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [
                  `${fmtNb(v)} consult.`,
                  name === '__autre' ? 'Autre / non attribué' : (pratsVisibles.find(p => p.id === name)?.nom || name),
                ]} />
                {detailPrats.map(p => (
                  <Line key={p.id} type="monotone" dataKey={p.id} stroke={colorOf(p)} strokeWidth={2} dot={{ r: 2 }} />
                ))}
                {showAutre && (
                  <Line type="monotone" dataKey="__autre" stroke="#B4B2A9" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                {prat ? prat.nom : spec.nom} — par mois · {periode}
              </span>
              <LegendAnnees years={years} accent={aColor} type="bar" />
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={aBar}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="mois" tick={TICK} />
                <YAxis tick={TICK} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => `${fmtNb(v)} consult.`} />
                {ordreAffichage(years).map(({ y, rang }) => (
                  <Bar key={y} dataKey={y} fill={couleurAnnee(rang, aColor)} radius={[3,3,0,0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                {prat ? prat.nom : spec.nom} — cumulé · {periode}
              </span>
              <LegendAnnees years={years} accent={aColor} type="line" />
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={aCumul}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="mois" tick={TICK} />
                <YAxis tick={TICK} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => `${fmtNb(v)} consult.`} />
                {ordreAffichage(years).map(({ y, rang }) => (
                  <Line
                    key={y}
                    type="monotone"
                    dataKey={y}
                    stroke={couleurAnnee(rang, aColor)}
                    strokeWidth={rang === 0 ? 2.6 : 2}
                    strokeDasharray={dashAnnee(rang)}
                    dot={{ r: rang === 0 ? 3 : 2.4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
