// Sous-onglet « Par chirurgien » : le facturé (FAC, Mt Total) ventilé par chirurgien du séjour,
// navigable comme l'onglet Consultations (spécialité → praticiens). Le chirurgien est retrouvé
// par compta/facturation.js via le numéro de séjour ; ce qui n'a pas pu l'être reste dans des
// buckets affichés à part (consultations, réa / sans chirurgien, séjour non retrouvé, à arbitrer),
// et les chirurgiens absents de src/data/facturationChirurgiens.js sont listés « à classer ».
import { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PeriodeFilter from '../components/PeriodeFilter'
import KpiCard from '../components/KpiCard'
import BoutonExport from '../components/BoutonExport'
import EtatFacturation from '../components/EtatFacturation'
import { useFacturation } from '../data/facturation'
import { usePeriode } from '../data/periode'
import { specialitesFacturation, clesSelection, feuillesActes } from '../data/facturationChirurgiens'
import { chargerActes } from '../data/facturationApi'
import { MOIS_COURT, MOIS_LONG, fmtK, fmtEur, sum, diffLabel, diffColor, getMasqueMontants, couleurAnnee, ordreAffichage } from '../data/mockData'
import { echelle, axeK, sansMoisFuturs } from '../utils/echelle'
import { moisRenseignes, sommeComparable, dernierMoisRenseigne } from '../utils/periodeComparable'

const PALETTE = ['#534AB7', '#1D9E75', '#EF9F27', '#D85A30', '#7A8B99', '#0C447C', '#712B13', '#3C3489', '#085041', '#A32D2D', '#2B7FB8', '#C2476B']
const DASH_ANNEE = [undefined, '7 4', '2 3', '9 3 2 3']
const dashAnnee = rang => DASH_ANNEE[Math.min(rang, DASH_ANNEE.length - 1)]
const GRID_STROKE = 'rgba(128,128,128,0.22)'
const TICK = { fontSize: 11, fill: '#8C8A82' }

// Série mensuelle d'une spécialité : somme des praticiens + bucket `valeurs`
const specMensuel = (sp, year) => {
  const pratPart = Array.from({ length: 12 }, (_, m) => sum((sp.praticiens || []).map(p => (p.valeurs[year] || [])[m] ?? 0)))
  const valPart = (sp.valeurs || {})[year] || Array(12).fill(0)
  return Array.from({ length: 12 }, (_, m) => pratPart[m] + (valPart[m] || 0))
}

function LegendAnnees({ years, accent, type }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {ordreAffichage(years).map(({ y, rang }) => (
        <span key={y} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
          {type === 'line'
            ? <svg width="22" height="8" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}><line x1="1" y1="4" x2="21" y2="4" stroke={couleurAnnee(rang, accent)} strokeWidth="2.4" strokeDasharray={dashAnnee(rang)} strokeLinecap="round" /></svg>
            : <span style={{ display: 'inline-block', width: 10, height: 10, background: couleurAnnee(rang, accent), borderRadius: 2 }} />}
          {y}
        </span>
      ))}
    </div>
  )
}

export default function FacturationChirurgiens() {
  const etat = useFacturation()
  const S = etat.series
  const P = usePeriode(S.ANNEES)
  const { years, de, a, primary, ref } = P
  const masque = getMasqueMontants()
  const periode = MOIS_COURT[de] + ' → ' + MOIS_COURT[a]
  const labels = MOIS_COURT.slice(de, a + 1)

  const specialites = specialitesFacturation(S.PAR_CHIRURGIEN, S.ANNEES)
  const [specId, setSpecId] = useState(specialites[0].id)
  const [pratSel, setPratSel] = useState([])
  const [vueAgregee, setVueAgregee] = useState(true)

  // Mois réellement importés de l'année principale : la référence est ramenée sur la même fenêtre
  const moisPleins = moisRenseignes(S.RENSEIGNE[primary]?.map(v => (v ? 1 : 0)), de, a)
  const periodePartielle = moisPleins.length > 0 && moisPleins.length < (a - de + 1)
  const refRenseignee = ref !== undefined && (S.RENSEIGNE[ref] || []).some(Boolean)
  const sumComparable = (serie) => (refRenseignee ? sommeComparable(serie, moisPleins) : 0)
  const dernierMoisPlein = dernierMoisRenseigne(S.RENSEIGNE[primary]?.map(v => (v ? 1 : 0)))

  const totalDe = (y) => sum((S.FACTURE[y] || []).slice(de, a + 1))
  const t1 = totalDe(primary)
  const t2 = sumComparable(S.FACTURE[ref])
  const attribue = sum(specialites.filter(s => !s.id.startsWith('__')).map(s => sum(specMensuel(s, primary).slice(de, a + 1))))
  const cumulAujourdhui = dernierMoisPlein >= 0 ? sum((S.FACTURE[primary] || []).slice(0, dernierMoisPlein + 1)) : 0

  const spec = specialites.find(s => s.id === specId) || specialites[0]
  const specSerieDe = (y) => specMensuel(spec, y).slice(de, a + 1)
  const specTprimary = sum(specSerieDe(primary)), specTref = sumComparable(specMensuel(spec, ref))

  const hasPrat = (spec.praticiens || []).length > 0
  const pratsVisibles = hasPrat ? spec.praticiens : []
  const colorOf = p => PALETTE[Math.max(0, pratsVisibles.findIndex(x => x.id === p.id)) % PALETTE.length]
  const selValides = (hasPrat && !vueAgregee) ? pratSel.filter(id => pratsVisibles.some(p => p.id === id)) : []
  const isAllPrat = hasPrat && !vueAgregee && selValides.length === 0
  const isSinglePrat = hasPrat && selValides.length === 1
  const isMultiPrat = hasPrat && selValides.length >= 2
  const showMulti = isAllPrat || isMultiPrat
  const detailPrats = isMultiPrat ? pratsVisibles.filter(p => selValides.includes(p.id)) : pratsVisibles
  const prat = isSinglePrat ? pratsVisibles.find(p => p.id === selValides[0]) : null

  const aColor = prat ? colorOf(prat) : spec.couleur
  const aSerieDe = (y) => (prat ? (prat.valeurs[y] || []).slice(de, a + 1) : specSerieDe(y))
  const aTprimary = sum(aSerieDe(primary))
  const aTref = sumComparable(prat ? prat.valeurs[ref] : specMensuel(spec, ref))
  const aBar = sansMoisFuturs(labels.map((m, i) => { const row = { mois: m }; years.forEach(y => { row[y] = aSerieDe(y)[i] ?? 0 }); return row }), S, de)
  const aCumul = sansMoisFuturs(labels.map((m, i) => { const row = { mois: m }; years.forEach(y => { row[y] = sum(aSerieDe(y).slice(0, i + 1)) }); return row }), S, de)

  const detailTprimary = sum(detailPrats.map(p => sum((p.valeurs[primary] || []).slice(de, a + 1))))
  const detailTref = sum(detailPrats.map(p => sumComparable(p.valeurs[ref])))

  // Bucket « non attribué » de la spécialité (ex. chirurgie bariatrique dans Gastro) : compté dans
  // le total de la spécialité, montré comme une série à part en vue « Tous », jamais sur un praticien.
  const autreValues = spec.bucketNom && spec.valeurs ? (spec.valeurs[primary] || Array(12).fill(0)) : null
  const autreT = autreValues ? sum(autreValues.slice(de, a + 1)) : 0
  const hasAutre = !!autreValues && autreValues.some(v => v !== 0)
  const showAutre = isAllPrat && hasAutre
  const AUTRE_COULEUR = '#B4B2A9'

  const pratBar = showMulti ? sansMoisFuturs(labels.map((m, i) => {
    const row = { mois: m }
    detailPrats.forEach(p => { row[p.id] = (p.valeurs[primary] || [])[de + i] ?? 0 })
    if (showAutre) row.__autre = autreValues[de + i] ?? 0
    return row
  }), S, de, primary) : []
  const pratCumul = showMulti ? sansMoisFuturs(labels.map((m, i) => {
    const row = { mois: m }
    detailPrats.forEach(p => { row[p.id] = sum((p.valeurs[primary] || []).slice(de, de + i + 1)) })
    if (showAutre) row.__autre = sum(autreValues.slice(de, de + i + 1))
    return row
  }), S, de, primary) : []

  const exports = [{
    label: 'Facturé par chirurgien (année principale)',
    build: () => {
      const lignes = []
      for (const sp of specialites) {
        const serie = specMensuel(sp, primary)
        const ajouter = (nom, s) => {
          const ligne = { Spécialité: sp.nom, Chirurgien: nom }
          for (let m = de; m <= a; m++) ligne[MOIS_LONG[m]] = S.RENSEIGNE[primary]?.[m] ? s[m] : ''
          ligne.Total = sum(s.slice(de, a + 1))
          lignes.push(ligne)
        }
        for (const p of sp.praticiens || []) ajouter(p.nom, p.valeurs[primary] || Array(12).fill(0))
        if (sp.bucketNom && sp.valeurs?.[primary]) ajouter(`${sp.bucketNom} (non attribué)`, sp.valeurs[primary])
        if (!(sp.praticiens || []).length) ajouter('(total)', serie)
      }
      return { nomFichier: `facture-par-chirurgien_${primary}_${MOIS_COURT[de]}-${MOIS_COURT[a]}.xlsx`, lignes, feuille: `Chirurgiens ${primary}` }
    },
  }]

  // Actes de ce qui est sélectionné : la spécialité entière, ou le(s) praticien(s) choisi(s) —
  // lus en base à la demande (facturation_actes, sans nom de patient), une feuille par année comparée
  const idsSel = isSinglePrat || isMultiPrat ? selValides : []
  const cibleNom = prat ? `${prat.nom} (${spec.nom})` : isMultiPrat ? `${spec.nom} · ${selValides.length} praticiens` : spec.nom
  const fichier = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  exports.unshift({
    label: `Actes · ${cibleNom} · ${[...years].sort().join(', ')}`,
    build: async () => {
      const actes = await chargerActes({ annees: years, cles: clesSelection(spec, idsSel), de, a })
      if (!actes.length) throw new Error('aucun acte en base pour cette sélection et cette période (les lignes d\'actes sont-elles importées ?)')
      return { nomFichier: `actes_${fichier(cibleNom)}_${MOIS_COURT[de]}-${MOIS_COURT[a]}_${[...years].sort().join('-')}.xlsx`, feuilles: feuillesActes(actes, years) }
    },
  })

  const tooltipStyle = { backgroundColor: '#fff', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 12 }
  const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }
  const pillBase = { fontSize: 11, padding: '4px 12px', borderRadius: 16, border: '0.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }
  const pillActive = { ...pillBase, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '0.5px solid var(--color-primary)', fontWeight: 500 }
  const nomCourt = (p) => p.nom.replace(/^(Dr|Mme|M\.)\s+/, '')
  const nomDe = (id) => (id === '__autre' ? `${spec.bucketNom} · non attribué` : (pratsVisibles.find(p => p.id === id)?.nom || id))
  const kpiRef = (v1, v2) => (refRenseignee ? diffLabel(v1, v2, ref) : periode)
  const kpiCouleur = (v1, v2) => (refRenseignee ? diffColor(v1, v2) : 'neutral')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>Facturé par chirurgien</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>{years.join(' · ')}</span>
          <BoutonExport exports={exports} disabled={masque} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: -6 }}>
        Chaque ligne facturée est rattachée au <strong>chirurgien ou gastro-entérologue de son séjour</strong> (numéro de séjour
        recoupé avec les exports d'actes). Les consultations, la réanimation / USC et les séjours non retrouvés sont
        montrés à part, en fin de liste, pas devinés.
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
          ℹ️ {primary} n'est importé que jusqu'à <strong>{MOIS_COURT[moisPleins.at(-1)]}</strong>. Les comparaisons portent sur les mois importés, pas sur des zéros.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <KpiCard label={`Facturé · ${primary}`} value={fmtK(t1)} sub={kpiRef(t1, t2)} subColor={kpiCouleur(t1, t2)} />
        <KpiCard label="Attribué à un chirurgien" value={fmtK(attribue)} sub={`${t1 ? Math.round(attribue / t1 * 100) : 0} % du facturé · ${periode}`} subColor="neutral" />
        <KpiCard label="Non attribué" value={fmtK(t1 - attribue)} sub="consultations, réa, séjours non retrouvés" subColor="neutral" />
        <KpiCard label="Cumul à ce jour" value={fmtK(cumulAujourdhui)} sub={dernierMoisPlein >= 0 ? `Jan → ${MOIS_COURT[dernierMoisPlein]} ${primary}` : `${primary}`} subColor="neutral" />
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, letterSpacing: '0.04em', marginTop: 6 }}>
        Par spécialité — cliquez pour le détail
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {specialites.map(sp => {
          const total = sum(specMensuel(sp, primary).slice(de, a + 1))
          const isSel = sp.id === spec.id
          const n = (sp.praticiens || []).length
          return (
            <button
              key={sp.id}
              onClick={() => { setSpecId(sp.id); setPratSel([]); setVueAgregee(true) }}
              style={{ background: isSel ? 'var(--color-primary-light)' : 'var(--color-surface)', border: isSel ? '1.5px solid var(--color-primary)' : '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', opacity: sp.id.startsWith('__') ? 0.85 : 1 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: sp.couleur, borderRadius: 3 }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{sp.nom}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>{fmtEur(total)}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                {t1 ? Math.round(total / t1 * 100) : 0} % du facturé {primary} · {periode}{n ? ` · ${n} chirurgien${n > 1 ? 's' : ''}` : ''}
              </div>
            </button>
          )
        })}
      </div>

      {spec.note && (
        <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>{spec.nom} : {spec.note}.</div>
      )}
      {hasAutre && (
        <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
          Le total {spec.nom} comprend <strong>{fmtEur(autreT)}</strong> de {spec.bucketNom}, comptés dans la spécialité sans être attribués à un praticien.
        </div>
      )}
      {spec.aClasser && (
        <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', background: 'var(--color-bg)', border: '0.5px solid var(--color-border)', borderRadius: 8, padding: '7px 12px' }}>
          Ces chirurgiens ne sont pas encore rattachés à une spécialité (table <code>src/data/facturationChirurgiens.js</code>). Leur facturé est montré tel quel en attendant.
        </div>
      )}

      {hasPrat && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginRight: 2 }}>Chirurgien</span>
          <button onClick={() => { setVueAgregee(false); setPratSel([]) }} style={isAllPrat ? pillActive : pillBase}>Tous</button>
          <button onClick={() => { setVueAgregee(true); setPratSel([]) }} style={vueAgregee ? pillActive : pillBase} title={`${spec.nom} — total agrégé (comparable d'une année à l'autre)`}>
            <span style={{ display: 'inline-block', width: 8, height: 8, background: spec.couleur, borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }} />
            {spec.nom}
          </button>
          {pratsVisibles.map((p, i) => {
            const on = selValides.includes(p.id)
            return (
              <button key={p.id} onClick={() => { setVueAgregee(false); setPratSel(sel => (sel.includes(p.id) ? sel.filter(x => x !== p.id) : [...sel, p.id])) }} style={on ? pillActive : pillBase}>
                <span style={{ display: 'inline-block', width: 8, height: 8, background: PALETTE[i % PALETTE.length], borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }} />
                {nomCourt(p)}
              </button>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        <span>Actes de la sélection : <strong style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{cibleNom}</strong> · {periode} · {[...years].sort().join(', ')}</span>
        <BoutonExport exports={[exports[0]]} disabled={masque} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {isSinglePrat ? (
          <>
            <KpiCard label={`${prat.nom} · ${primary}`} value={fmtEur(aTprimary)} sub={periode} subColor="neutral" />
            <KpiCard label={`${prat.nom} · ${ref ?? '—'}`} value={fmtEur(aTref)} sub={kpiRef(aTprimary, aTref)} subColor={kpiCouleur(aTprimary, aTref)} />
            <KpiCard label="Part de la spécialité" value={`${specTprimary ? Math.round(aTprimary / specTprimary * 100) : 0} %`} sub={`de ${spec.nom} · ${periode}`} subColor="neutral" />
          </>
        ) : isMultiPrat ? (
          <>
            <KpiCard label={`${detailPrats.length} chirurgiens · ${primary}`} value={fmtEur(detailTprimary)} sub={periode} subColor="neutral" />
            <KpiCard label={`${detailPrats.length} chirurgiens · ${ref ?? '—'}`} value={fmtEur(detailTref)} sub={kpiRef(detailTprimary, detailTref)} subColor={kpiCouleur(detailTprimary, detailTref)} />
            <KpiCard label="Part de la spécialité" value={`${specTprimary ? Math.round(detailTprimary / specTprimary * 100) : 0} %`} sub={`de ${spec.nom} · ${periode}`} subColor="neutral" />
          </>
        ) : (
          <>
            <KpiCard label={`${spec.nom} · ${primary}`} value={fmtEur(specTprimary)} sub={periode} subColor="neutral" />
            <KpiCard label={`${spec.nom} · ${ref ?? '—'}`} value={fmtEur(specTref)} sub={kpiRef(specTprimary, specTref)} subColor={kpiCouleur(specTprimary, specTref)} />
            <KpiCard label="Part du facturé" value={`${t1 ? Math.round(specTprimary / t1 * 100) : 0} %`} sub={`du total ${primary} · ${periode}`} subColor="neutral" />
          </>
        )}
      </div>

      {showMulti ? (
        <>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                {spec.nom} — {isMultiPrat ? 'chirurgiens sélectionnés' : 'répartition par chirurgien'} · {primary} · {periode}
              </span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {detailPrats.map(p => (
                  <span key={p.id} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: colorOf(p), borderRadius: 2 }} />
                    {nomCourt(p)}
                  </span>
                ))}
                {showAutre && (
                  <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: AUTRE_COULEUR, borderRadius: 2 }} />
                    {spec.bucketNom}
                  </span>
                )}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={pratBar}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="mois" tick={TICK} />
                <YAxis {...echelle(pratBar, { empile: true })} tick={TICK} tickFormatter={axeK} hide={masque} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [fmtEur(v), nomDe(name)]} />
                {detailPrats.map((p, i) => (
                  <Bar key={p.id} dataKey={p.id} stackId="prat" fill={colorOf(p)} radius={i === detailPrats.length - 1 && !showAutre ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                ))}
                {showAutre && <Bar dataKey="__autre" stackId="prat" fill={AUTRE_COULEUR} radius={[3, 3, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={cardStyle}>
            <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
              {spec.nom} — cumulé par chirurgien{isMultiPrat ? ' (sélection)' : ''} · {primary} · {periode}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={pratCumul}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="mois" tick={TICK} />
                <YAxis {...echelle(pratCumul)} tick={TICK} tickFormatter={axeK} hide={masque} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [fmtEur(v), nomDe(name)]} />
                {detailPrats.map(p => (
                  <Line key={p.id} type="monotone" dataKey={p.id} stroke={colorOf(p)} strokeWidth={2} dot={{ r: 2 }} />
                ))}
                {showAutre && <Line type="monotone" dataKey="__autre" stroke={AUTRE_COULEUR} strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{prat ? prat.nom : spec.nom} — facturé par mois · {periode}</span>
              <LegendAnnees years={years} accent={aColor} type="bar" />
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart key={years.join('-')} data={aBar}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="mois" tick={TICK} />
                <YAxis {...echelle(aBar)} tick={TICK} tickFormatter={axeK} hide={masque} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
                {ordreAffichage(years).map(({ y, rang }) => (
                  <Bar key={y} dataKey={y} fill={couleurAnnee(rang, aColor)} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{prat ? prat.nom : spec.nom} — cumulé · {periode}</span>
              <LegendAnnees years={years} accent={aColor} type="line" />
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={aCumul}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="mois" tick={TICK} />
                <YAxis {...echelle(aCumul)} tick={TICK} tickFormatter={axeK} hide={masque} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => fmtEur(v)} />
                {ordreAffichage(years).map(({ y, rang }) => (
                  <Line key={y} type="monotone" dataKey={y} stroke={couleurAnnee(rang, aColor)} strokeWidth={rang === 0 ? 2.6 : 2} strokeDasharray={dashAnnee(rang)} dot={{ r: rang === 0 ? 3 : 2.4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
