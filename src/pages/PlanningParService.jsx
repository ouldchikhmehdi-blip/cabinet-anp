import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES, listerSemaines, semainesDansPlage, premiereSemainePlanning, feriesEnSemaine } from '../utils/calendrier'
import { ANNEE_DEFAUT } from '../utils/desiderata'
import { resoudreTrame } from '../utils/semaines'
import { construireTableParService } from '../utils/planningParService'
import { exporterParServiceExcel } from '../utils/exportParService'
import { chargerTrames } from '../utils/tramesApi'
import { chargerSemaines } from '../utils/semainesApi'
import { chargerRea } from '../utils/reaApi'
import { chargerVacances } from '../utils/vacancesApi'
import { chargerWeekends } from '../utils/weekendsApi'
import { chargerCalendrier } from '../utils/calendrierApi'
import { chargerProfilsAvecInitiales } from '../utils/desiderataApi'

// Onglet « Planning par service » (faiseur) : relit le planning saisi (trames + affectations) et le
// transpose en tableau jours × postes (noms complets), exportable sur une plage de semaines choisie.
export default function PlanningParService() {
  const { profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [annee, setAnnee] = useState(ANNEE_DEFAUT)
  const [tramesData, setTramesData] = useState(null)
  const [semData, setSemData] = useState(null)
  const [reaData, setReaData] = useState(null)
  const [vacancesData, setVacancesData] = useState(null)
  const [weekends, setWeekends] = useState(null)
  const [calendrier, setCalendrier] = useState(null)
  const [profils, setProfils] = useState([])
  const [charge, setCharge] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [semDebut, setSemDebut] = useState(null)
  const [semFin, setSemFin] = useState(null)
  const [exportEnCours, setExportEnCours] = useState(false)

  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bascule en chargement avant la requête réseau
    setCharge(true); setErreur(null)
    Promise.all([
      chargerTrames(annee), chargerSemaines(annee), chargerRea(annee), chargerVacances(annee),
      chargerWeekends(annee), chargerCalendrier(annee), chargerProfilsAvecInitiales(),
    ])
      .then(([tr, sem, rea, vac, we, cal, ps]) => {
        if (annule) return
        setTramesData(tr); setSemData(sem); setReaData(rea); setVacancesData(vac)
        setWeekends(we); setCalendrier(cal); setProfils(ps)
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger les données de planning.') })
      .finally(() => { if (!annule) setCharge(false) })
    return () => { annule = true }
  }, [annee, estFaiseur])

  // Semaines disponibles (à partir de la 1ʳᵉ semaine de planning, après les vacances de Noël).
  const debutPlanning = useMemo(() => premiereSemainePlanning(calendrier?.vacancesScolaires ?? []), [calendrier])
  const semainesAnnee = useMemo(
    () => listerSemaines(annee).filter(s => s.num >= debutPlanning),
    [annee, debutPlanning]
  )

  // Défaut de plage = toute l'année de planning (dérivé, sans effet : null → premières/dernières semaines).
  const debutEff = semDebut ?? semainesAnnee[0]?.num ?? null
  const finEff = semFin ?? semainesAnnee[semainesAnnee.length - 1]?.num ?? null

  // Reconstruction du contexte (comme PlanningSemaines) pour résoudre les trames et les affectations.
  const trames = useMemo(() => tramesData?.trames ?? [], [tramesData])
  const principaleId = tramesData?.principaleId ?? null
  const tramesById = useMemo(() => Object.fromEntries(trames.map(t => [t.id, t])), [trames])
  const trameParSemaine = useMemo(() => semData?.trameParSemaine ?? {}, [semData])
  const affectationsLibres = useMemo(() => semData?.affectations ?? {}, [semData])
  const vacancesParSemaine = useMemo(() => vacancesData?.vacances ?? {}, [vacancesData])
  const contexteAmont = useMemo(() => ({
    rea: reaData?.rea ?? {}, vacances: vacancesData?.vacances ?? {}, weekendAff: weekends?.affectations ?? {},
  }), [reaData, vacancesData, weekends])
  const trameDe = useCallback((num) => resoudreTrame({
    trames, tramesById, principaleId,
    choisiId: trameParSemaine[num] ?? null,
    nbVacanciers: (vacancesParSemaine[num] ?? []).length,
  }).trame, [trames, tramesById, principaleId, trameParSemaine, vacancesParSemaine])

  const nomParIni = useMemo(() => {
    const m = {}
    for (const p of profils) if (p.initiales) m[p.initiales] = p.nom_complet || p.initiales
    return m
  }, [profils])

  const feriesIso = useMemo(() => {
    const set = new Set()
    for (const arr of Object.values(feriesEnSemaine(annee))) for (const f of arr) set.add(f.iso)
    return set
  }, [annee])

  const semainesPlage = useMemo(() => {
    if (debutEff == null || finEff == null) return []
    return semainesDansPlage(annee, Math.min(debutEff, finEff), Math.max(debutEff, finEff))
  }, [annee, debutEff, finEff])

  const table = useMemo(() => {
    if (!calendrier || !semainesPlage.length) return { postes: [], lignes: [] }
    return construireTableParService({ semainesPlage, annee, trameDe, contexteAmont, affectationsLibres, nomParIni, feriesIso })
  }, [calendrier, semainesPlage, annee, trameDe, contexteAmont, affectationsLibres, nomParIni, feriesIso])

  async function exporter() {
    if (!table.lignes.length) return
    setExportEnCours(true)
    try {
      await exporterParServiceExcel(annee, table, { plageDebut: Math.min(debutEff, finEff), plageFin: Math.max(debutEff, finEff) })
    } catch {
      setErreur('Export impossible.')
    } finally {
      setExportEnCours(false)
    }
  }

  const s = {
    select: { padding: '6px 10px', fontSize: 13, border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)' },
    bouton: { padding: '9px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
    th: { padding: '6px 10px', fontSize: 12, fontWeight: 600, textAlign: 'left', borderBottom: '0.5px solid var(--color-border)', position: 'sticky', top: 0, background: 'var(--color-surface)' },
    td: { padding: '5px 10px', fontSize: 12.5, borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap' },
  }

  if (!estFaiseur) {
    return (
      <div style={{ maxWidth: 720 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Planning par service</h1>
        <div style={{ background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 20, color: 'var(--color-text-secondary)', fontSize: 14 }}>
          Cette page est réservée au faiseur de planning.
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Planning par service</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        Vue par poste (SARM 1, SARM 2, Bloc A viscéral, Bloc A NC, Bloc B, USC/Réa), reconstituée à partir du
        planning saisi. Choisissez une plage de semaines puis exportez.
      </p>

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>{erreur}</div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Année
          <select value={annee} onChange={e => { setAnnee(Number(e.target.value)); setSemDebut(null); setSemFin(null) }} style={s.select}>
            {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          De la semaine
          <select value={debutEff ?? ''} onChange={e => setSemDebut(Number(e.target.value))} style={s.select} disabled={!semainesAnnee.length}>
            {semainesAnnee.map(sem => <option key={sem.num} value={sem.num}>S{sem.num}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          à la semaine
          <select value={finEff ?? ''} onChange={e => setSemFin(Number(e.target.value))} style={s.select} disabled={!semainesAnnee.length}>
            {semainesAnnee.map(sem => <option key={sem.num} value={sem.num}>S{sem.num}</option>)}
          </select>
        </label>
        <button type="button" onClick={exporter} disabled={charge || exportEnCours || !table.lignes.length} style={{ ...s.bouton, opacity: (charge || exportEnCours || !table.lignes.length) ? 0.5 : 1 }}>
          {exportEnCours ? 'Export…' : '⬇ Exporter Excel'}
        </button>
      </div>

      {charge ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Chargement…</div>
      ) : !table.lignes.length ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Aucune donnée pour cette plage.</div>
      ) : (
        <div style={{ overflow: 'auto', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-lg)', maxHeight: '70vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={s.th}>Date</th>
                {table.postes.map(p => <th key={p} style={s.th}>{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {table.lignes.map(lg => {
                const grise = lg.estWeekend || lg.estFerie
                return (
                  <tr key={lg.iso} style={{ background: grise ? 'var(--color-bg)' : 'transparent' }}>
                    <td style={{ ...s.td, color: grise ? 'var(--color-text-tertiary)' : 'var(--color-text)' }}>{lg.dateLabel}</td>
                    {table.postes.map(p => {
                      const cell = lg.parPoste?.[p]
                      return (
                        <td key={p} style={{ ...s.td, ...(cell?.estRemplacant ? { color: 'var(--color-danger)', fontWeight: 600 } : null) }}>
                          {cell?.texte ?? ''}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
