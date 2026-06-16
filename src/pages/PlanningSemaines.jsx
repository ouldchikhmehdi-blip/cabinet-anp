import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES, semainesDansPlage, listerSemaines, formatJJMM, feriesEnSemaine, numeroSemaineISO, parseISO } from '../utils/calendrier'
import { ANNEE_DEFAUT, normaliser } from '../utils/desiderata'
import { ASSOCIES } from '../data/associes'
import { listerRecueils, chargerTousDesiderata, chargerProfilsAvecInitiales } from '../utils/desiderataApi'
import { chargerCalendrier } from '../utils/calendrierApi'
import { chargerObjectifs } from '../utils/objectifsApi'
import { chargerWeekends } from '../utils/weekendsApi'
import { chargerVacances } from '../utils/vacancesApi'
import { chargerRea } from '../utils/reaApi'
import { chargerTrames } from '../utils/tramesApi'
import { chargerSemaines, sauverSemaines } from '../utils/semainesApi'
import {
  proposerSemaines, affectationResolue, analyserSemaineColonnes,
  gardesWeekendParAssocie, gardesSemaineParAssocie,
} from '../utils/semaines'
import { colonnesSelectionnables } from '../utils/trames'
import { exporterCalendrierExcel } from '../utils/exportCalendrier'
import TrameGrille from '../components/planning/TrameGrille'
import BoutonVerrou from '../components/planning/BoutonVerrou'
import PanneauConflits from '../components/planning/PanneauConflits'

// getUTCDay() → jour de semaine (lun→ven) ; samedi/dimanche ignorés (jours off de semaine seulement).
const JOUR_SEMAINE = { 1: 'lun', 2: 'mar', 3: 'mer', 4: 'jeu', 5: 'ven' }

// Étape « En semaine » : trame par semaine + remplissage des colonnes (qui occupe quoi), avec
// équilibre des gardes de semaine (période molle / année dure) et espacement (≥ 1 semaine).
export default function PlanningSemaines({ annee: anneeProp, onChangeAnnee, onStatut } = {}) {
  const { session, profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [anneeInterne, setAnneeInterne] = useState(ANNEE_DEFAUT)
  const annee = anneeProp ?? anneeInterne
  const setAnnee = onChangeAnnee ?? setAnneeInterne

  const [recueils, setRecueils] = useState([])
  const [recueilId, setRecueilId] = useState(null)
  const [profils, setProfils] = useState([])
  const [desideratas, setDesideratas] = useState([])
  const [tramesData, setTramesData] = useState(null)
  const [vacancesData, setVacancesData] = useState(null)
  const [calendrier, setCalendrier] = useState(null)
  const [objectifs, setObjectifs] = useState(null)
  const [weekends, setWeekends] = useState(null)
  const [reaData, setReaData] = useState(null)
  const [data, setData] = useState(null)        // { v, trameParSemaine, affectations, verrous }
  const [erreur, setErreur] = useState(null)
  const [enregistre, setEnregistre] = useState(false)
  const [exportEnCours, setExportEnCours] = useState(false)
  const [filtreArbitrer, setFiltreArbitrer] = useState(false)
  const [apercus, setApercus] = useState(() => new Set())

  // Recueils « normaux » (l'été se gère par colonnes, hors de cette étape).
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    listerRecueils(annee)
      .then(rs => {
        if (annule) return
        const normaux = rs.filter(r => r.type !== 'ete')
        setRecueils(normaux)
        setRecueilId(prev => (normaux.some(r => r.id === prev) ? prev : (normaux[0]?.id ?? null)))
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger les recueils.') })
    return () => { annule = true }
  }, [annee, estFaiseur])

  // Profils (mapping user_id → initiales), une fois.
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    chargerProfilsAvecInitiales().then(ps => { if (!annule) setProfils(ps) }).catch(() => {})
    return () => { annule = true }
  }, [estFaiseur])

  // Trames + cumul des étapes précédentes + choix/affectations de cette étape.
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    Promise.all([
      chargerTrames(annee), chargerVacances(annee), chargerCalendrier(annee), chargerSemaines(annee),
      chargerObjectifs(annee), chargerWeekends(annee), chargerRea(annee),
    ])
      .then(([tr, vac, cal, sem, obj, we, rea]) => {
        if (annule) return
        setTramesData(tr); setVacancesData(vac); setCalendrier(cal); setData(sem)
        setObjectifs(obj); setWeekends(we); setReaData(rea)
        onStatut?.('vierge')
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger les données de planning.') })
    return () => { annule = true }
  }, [annee, estFaiseur, onStatut])

  // Desiderata du recueil sélectionné (souhaits de colonne + jours off).
  useEffect(() => {
    if (!estFaiseur || !recueilId) return
    let annule = false
    chargerTousDesiderata(recueilId).then(rows => { if (!annule) setDesideratas(rows) }).catch(() => {})
    return () => { annule = true }
  }, [recueilId, estFaiseur])

  const recueil = useMemo(() => recueils.find(r => r.id === recueilId) ?? null, [recueils, recueilId])
  const trames = useMemo(() => tramesData?.trames ?? [], [tramesData])
  const principaleId = tramesData?.principaleId ?? null
  const tramesById = useMemo(() => {
    const m = {}
    for (const t of trames) m[t.id] = t
    return m
  }, [trames])

  const vacancesParSemaine = useMemo(() => vacancesData?.vacances ?? {}, [vacancesData])
  const scolairesSet = useMemo(() => new Set(calendrier?.vacancesScolaires ?? []), [calendrier])
  const feriesParSemaine = useMemo(() => feriesEnSemaine(annee), [annee])
  const trameParSemaine = useMemo(() => data?.trameParSemaine ?? {}, [data])
  const affectationsLibres = useMemo(() => data?.affectations ?? {}, [data])
  const verrousData = useMemo(() => data?.verrous ?? {}, [data])

  const contexteAmont = useMemo(() => ({
    rea: reaData?.rea ?? {}, vacances: vacancesData?.vacances ?? {}, weekendAff: weekends?.affectations ?? {},
  }), [reaData, vacancesData, weekends])

  // Desiderata dérivés : souhaits de colonne et jours off (par jour de semaine).
  const parUser = useMemo(() => {
    const m = {}
    for (const p of profils) m[p.id] = p.initiales
    return m
  }, [profils])
  const colonnesSouhaiteesParAssocie = useMemo(() => {
    const m = {}
    for (const row of desideratas) {
      const ini = parUser[row.user_id]
      if (ini) m[ini] = normaliser(row.data).colonnesSouhaitees ?? {}
    }
    return m
  }, [desideratas, parUser])
  const joursOffDetailParAssocie = useMemo(() => {
    const m = {}
    for (const row of desideratas) {
      const ini = parUser[row.user_id]
      if (!ini) continue
      const parSem = {}
      for (const iso of (normaliser(row.data).joursOffSouhaites ?? [])) {
        try {
          const d = parseISO(iso)
          const jour = JOUR_SEMAINE[d.getUTCDay()]
          if (!jour) continue
          ;(parSem[numeroSemaineISO(d)] ??= new Set()).add(jour)
        } catch { /* date invalide ignorée */ }
      }
      m[ini] = parSem
    }
    return m
  }, [desideratas, parUser])

  const semaines = useMemo(
    () => (recueil ? semainesDansPlage(annee, recueil.semaine_debut, recueil.semaine_fin) : []),
    [annee, recueil]
  )
  const allNums = useMemo(() => listerSemaines(annee).map(s => s.num), [annee])

  // Trame résolue d'une semaine + si c'est la trame principale (souhaits de colonne).
  const trameDe = useCallback((num) => {
    const id = trameParSemaine[num] ?? principaleId
    return id != null ? (tramesById[id] ?? null) : null
  }, [trameParSemaine, principaleId, tramesById])
  const estPrincipaleSem = useCallback((num) => ((trameParSemaine[num] ?? principaleId) === principaleId), [trameParSemaine, principaleId])

  // Gardes sur l'année : dates (week-ends toute l'année + gardes de semaine résolues) + compteurs.
  const gardesAnnee = useMemo(() => {
    if (!calendrier) return { dates: {}, comptes: {} }
    const gWE = gardesWeekendParAssocie(allNums, annee, contexteAmont.weekendAff)
    const gSem = gardesSemaineParAssocie(allNums, annee, calendrier, trameDe, contexteAmont, affectationsLibres)
    const dates = {}
    for (const ini of ASSOCIES) dates[ini] = [...(gWE[ini] ?? []), ...(gSem.dates[ini] ?? [])]
    return { dates, comptes: gSem.comptes }
  }, [allNums, annee, calendrier, trameDe, contexteAmont, affectationsLibres])

  const comptesPeriode = useMemo(() => {
    if (!calendrier) return {}
    const nums = semaines.map(s => s.num)
    return gardesSemaineParAssocie(nums, annee, calendrier, trameDe, contexteAmont, affectationsLibres).comptes
  }, [semaines, annee, calendrier, trameDe, contexteAmont, affectationsLibres])

  // Analyse par semaine : repères « à arbitrer » (2+ vacances, pont) + repère scolaire.
  const analyses = useMemo(() => {
    const m = {}
    for (const sem of semaines) {
      const vacanciers = vacancesParSemaine[sem.num] ?? []
      const feries = feriesParSemaine[sem.num] ?? []
      const multiVacances = vacanciers.length >= 2
      const pont = feries.length > 0
      m[sem.num] = { vacanciers, feries, multiVacances, pont, scolaire: scolairesSet.has(sem.num), aArbitrer: multiVacances || pont }
    }
    return m
  }, [semaines, vacancesParSemaine, feriesParSemaine, scolairesSet])

  // Alertes liées au remplissage des colonnes (gardes rapprochées, non plaçables, colonnes vides…).
  const alertesColonnes = useMemo(() => {
    if (!calendrier) return {}
    const m = {}
    for (const sem of semaines) {
      const trame = trameDe(sem.num)
      if (!trame) continue
      const affR = affectationResolue(trame, sem.num, contexteAmont, affectationsLibres)
      m[sem.num] = analyserSemaineColonnes(trame, sem.num, annee, calendrier, affR, gardesAnnee.dates, {
        souhaitsParAssocie: colonnesSouhaiteesParAssocie,
        vacanciers: contexteAmont.vacances[sem.num] ?? [],
        estPrincipale: estPrincipaleSem(sem.num),
      })
    }
    return m
  }, [semaines, trameDe, contexteAmont, affectationsLibres, annee, calendrier, gardesAnnee, colonnesSouhaiteesParAssocie, estPrincipaleSem])

  const conflits = useMemo(() => {
    const out = []
    for (const sem of semaines) {
      const al = alertesColonnes[sem.num]
      if (!al) continue
      if (al.nonPlaces.length) out.push({ severite: 'amber', semaine: sem.num, message: `S${sem.num} — associé(s) non placé(s) : ${al.nonPlaces.join(', ')} (pas assez de colonnes libres).` })
      if (al.colonnesVides.length) out.push({ severite: 'amber', semaine: sem.num, message: `S${sem.num} — colonne(s) libre(s) non pourvue(s) : ${al.colonnesVides.map(c => `C${c + 1}`).join(', ')}.` })
      if (al.multiVacances) out.push({ severite: 'amber', semaine: sem.num, message: `S${sem.num} — ≥ 2 associés en vacances : la trame n'a qu'une colonne vacances, placez le 2ᵉ congé à la main ou choisissez une autre trame.` })
    }
    return out
  }, [semaines, alertesColonnes])

  const nbArbitrer = useMemo(() => semaines.filter(s => analyses[s.num]?.aArbitrer).length, [semaines, analyses])
  const semainesAffichees = useMemo(
    () => (filtreArbitrer ? semaines.filter(s => analyses[s.num]?.aArbitrer) : semaines),
    [semaines, analyses, filtreArbitrer]
  )

  // ── Handlers ──
  function majTrameSemaine(num, trameId) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const map = { ...(prev?.trameParSemaine ?? {}) }
      if (trameId == null || trameId === principaleId) delete map[num]
      else map[num] = trameId
      return { ...prev, trameParSemaine: map }
    })
  }

  // Placer un associé sur une colonne libre VERROUILLE la case ; « — » la remet en automatique.
  function majAffectationColonne(num, col, ini) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const aff = { ...(prev.affectations ?? {}) }
      const cols = { ...(aff[num] ?? {}) }
      const ver = { ...(prev.verrous ?? {}) }
      const vcols = new Set(ver[num] ?? [])
      if (ini) { cols[col] = ini; vcols.add(col) }
      else { delete cols[col]; vcols.delete(col) }
      if (Object.keys(cols).length) aff[num] = cols; else delete aff[num]
      if (vcols.size) ver[num] = [...vcols].sort((a, b) => a - b); else delete ver[num]
      return { ...prev, affectations: aff, verrous: ver }
    })
  }

  function basculerVerrouColonne(num, col) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      if (prev.affectations?.[num]?.[col] == null) return prev
      const ver = { ...(prev.verrous ?? {}) }
      const vcols = new Set(ver[num] ?? [])
      if (vcols.has(col)) vcols.delete(col); else vcols.add(col)
      if (vcols.size) ver[num] = [...vcols].sort((a, b) => a - b); else delete ver[num]
      return { ...prev, verrous: ver }
    })
  }

  function toggleApercu(num) {
    setApercus(prev => {
      const s = new Set(prev)
      if (s.has(num)) s.delete(num); else s.add(num)
      return s
    })
  }

  function proposer() {
    if (!recueil) return
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const debut = recueil.semaine_debut, fin = recueil.semaine_fin
      const trameInfo = (num) => {
        const id = (prev.trameParSemaine?.[num] ?? principaleId)
        const trame = id != null ? (tramesById[id] ?? null) : null
        return trame ? { trame, estPrincipale: id === principaleId } : null
      }
      // Socle d'équilibre annuel : gardes hors-plage (week-ends toute l'année + gardes de semaine hors-plage).
      const horsNums = allNums.filter(n => n < debut || n > fin)
      const gWE = gardesWeekendParAssocie(allNums, annee, contexteAmont.weekendAff)
      const gSemHors = gardesSemaineParAssocie(horsNums, annee, calendrier, (n) => trameInfo(n)?.trame ?? null, contexteAmont, prev.affectations ?? {})
      const gardesInitiales = {}
      for (const ini of ASSOCIES) gardesInitiales[ini] = [...(gWE[ini] ?? []), ...(gSemHors.dates[ini] ?? [])]
      // Verrous de la plage = colonnes forcées à préserver.
      const fixes = {}
      for (const sem of semaines) {
        const cols = prev.verrous?.[sem.num] ?? []
        if (!cols.length) continue
        const m = {}
        for (const c of cols) if (prev.affectations?.[sem.num]?.[c] != null) m[c] = prev.affectations[sem.num][c]
        if (Object.keys(m).length) fixes[sem.num] = m
      }
      const proposees = proposerSemaines({
        semainesPlage: semaines, annee, calendrier, trameInfo, contexteAmont,
        desiderata: { colonnesSouhaiteesParAssocie, joursOffDetailParAssocie },
        gardesInitiales, compteAnneeInitial: gSemHors.comptes, fixes,
      })
      const aff = { ...(prev.affectations ?? {}) }
      for (const sem of semaines) {
        const m = proposees[sem.num] ?? {}
        if (Object.keys(m).length) aff[sem.num] = m; else delete aff[sem.num]
      }
      return { ...prev, affectations: aff }
    })
  }

  async function enregistrer() {
    setErreur(null)
    try {
      await sauverSemaines(annee, data, session.user.id)
      setEnregistre(true); onStatut?.('enregistre')
      setTimeout(() => setEnregistre(false), 3000)
    } catch {
      setErreur('Enregistrement impossible (réservé au faiseur).')
    }
  }

  // Récap « Trames par semaine » pour l'export Excel (2ᵉ feuille).
  const recapTrames = useMemo(() => semaines.map(sem => {
    const a = analyses[sem.num]
    const choisi = trameParSemaine[sem.num] ?? null
    const effId = choisi ?? principaleId
    const trame = effId != null ? tramesById[effId] : null
    const motif = [a?.multiVacances ? `${a.vacanciers.length} en vacances` : null, a?.pont ? 'pont' : null].filter(Boolean).join(', ')
    return {
      label: `S${sem.num} · ${formatJJMM(sem.lundi)} → ${formatJJMM(sem.dimanche)}`,
      trame: trame ? trame.nom : '—',
      specifique: choisi != null && choisi !== principaleId,
      arbitrer: !!a?.aArbitrer,
      motif,
    }
  }), [semaines, analyses, trameParSemaine, tramesById, principaleId])

  async function exporter() {
    setErreur(null); setExportEnCours(true)
    try {
      await exporterCalendrierExcel(
        annee, calendrier, objectifs, weekends?.affectations, vacancesData?.vacances, reaData?.rea,
        recueil ? { debut: recueil.semaine_debut, fin: recueil.semaine_fin } : null,
        recapTrames,
      )
    } catch {
      setErreur('Export Excel impossible.')
    } finally {
      setExportEnCours(false)
    }
  }

  // ── Styles ──
  const s = {
    select: {
      padding: '8px 12px', fontSize: 14, border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    bouton: {
      padding: '10px 20px', background: 'var(--color-primary)', color: '#fff', border: 'none',
      borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500,
    },
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '8px 14px', marginBottom: 24,
    },
    ligne: (arbitrer) => ({
      padding: '8px 10px', marginBottom: 6, borderRadius: 'var(--radius-md)',
      border: `0.5px solid ${arbitrer ? 'var(--color-amber)' : 'var(--color-border)'}`,
      background: arbitrer ? 'var(--color-amber-light)' : 'var(--color-bg)',
    }),
    haut: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    libSemaine: { fontSize: 13, fontWeight: 600, color: 'var(--color-text)', minWidth: 168 },
    badges: { display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 },
    badge: (couleur, fond) => ({
      fontSize: 11, fontWeight: 600, color: couleur, background: fond,
      border: `0.5px solid ${couleur}`, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
    }),
    selTrame: {
      padding: '6px 8px', fontSize: 13, borderRadius: 'var(--radius-md)',
      border: '0.5px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    meta: { fontSize: 11, color: 'var(--color-text-tertiary)' },
    lienApercu: {
      background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer',
      fontSize: 12, padding: 0, whiteSpace: 'nowrap',
    },
    apercu: { marginTop: 8, overflowX: 'auto' },
    compteurs: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
    chip: { fontSize: 12, padding: '5px 9px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-border)', background: 'var(--color-surface)' },
    colonnesEdit: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 },
    colEdit: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 },
    colLabel: { fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)' },
    selCol: {
      padding: '4px 6px', fontSize: 12, borderRadius: 'var(--radius-md)',
      border: '0.5px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    alerteSem: { fontSize: 12, color: 'var(--color-amber)', marginTop: 6 },
  }

  if (!estFaiseur) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>En semaine</h1>
        <div style={{ ...s.carte, color: 'var(--color-text-secondary)', fontSize: 14, padding: 24 }}>
          Cette page est réservée au faiseur de planning.
        </div>
      </div>
    )
  }

  const pret = data !== null && tramesData !== null && calendrier !== null

  return (
    <div style={{ maxWidth: 1180 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>En semaine {annee}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        Choisissez la <strong>trame</strong> de chaque semaine puis lancez le <strong>remplissage
        automatique</strong> : l'outil répartit les associés sur les colonnes (Réa, Vacances, avant/après
        week-end sont pré-remplies) en équilibrant les <strong>gardes de semaine</strong> (mardi, et jeudi
        si garde) sur la période, en respectant les souhaits de colonne et les jours off, et en évitant les
        gardes trop rapprochées. Vous gardez la main (override + cadenas).
      </p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Année</label>
          <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={s.select}>
            {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Période (recueil)</label>
          <select value={recueilId ?? ''} onChange={e => setRecueilId(e.target.value || null)} style={s.select} disabled={recueils.length === 0}>
            {recueils.length === 0 && <option value="">Aucun recueil</option>}
            {recueils.map(r => <option key={r.id} value={r.id}>{r.nom} · S{r.semaine_debut}→S{r.semaine_fin}</option>)}
          </select>
        </div>
        <button type="button" onClick={proposer} disabled={!pret || !recueil || principaleId == null} style={{ ...s.bouton, padding: '8px 14px', fontSize: 13, opacity: (!pret || !recueil || principaleId == null) ? 0.5 : 1 }}>
          Proposer automatiquement
        </button>
        <button type="button" onClick={enregistrer} disabled={!pret} style={{ ...s.bouton, padding: '8px 14px', fontSize: 13, opacity: !pret ? 0.5 : 1 }}>
          Enregistrer
        </button>
        <button
          type="button"
          onClick={exporter}
          disabled={!pret || !recueil || exportEnCours}
          style={{ ...s.bouton, padding: '8px 14px', fontSize: 13, background: 'transparent', color: 'var(--color-primary)', border: '0.5px solid var(--color-primary)', opacity: (!pret || !recueil || exportEnCours) ? 0.6 : 1 }}
          title="Génère un fichier Excel : base calendrier + objectifs + week-ends + vacances + réa, plus la trame par semaine"
        >
          {exportEnCours ? 'Export…' : '⬇ Exporter en Excel'}
        </button>
        {enregistre && <span style={{ fontSize: 13, color: 'var(--color-success)', alignSelf: 'center' }}>Enregistré ✓</span>}
      </div>

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          {erreur}
        </div>
      )}

      {pret && principaleId == null && (
        <div style={{ fontSize: 13, color: 'var(--color-amber)', background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          Aucune <strong>trame principale</strong> désignée. Choisissez-en une dans l'onglet <strong>Trames</strong> (Suivi des desiderata) pour pouvoir remplir.
        </div>
      )}

      {!recueil ? (
        <div style={{ ...s.carte, color: 'var(--color-text-secondary)', fontSize: 14, padding: 20 }}>
          Aucune période disponible. Créez un recueil « normal » dans <strong>Suivi desiderata</strong>.
        </div>
      ) : !pret ? (
        <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Chargement…</div>
      ) : (
        <>
          {/* Compteurs de gardes de semaine : période / année */}
          <div style={s.compteurs}>
            {ASSOCIES.map(ini => (
              <span key={ini} style={s.chip} title="Gardes de semaine — période / année">
                <strong>{ini}</strong> : {comptesPeriode[ini] ?? 0} / {gardesAnnee.comptes[ini] ?? 0}
              </span>
            ))}
          </div>

          <PanneauConflits conflits={conflits} />

          <div style={{ fontSize: 13, marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: nbArbitrer ? 'var(--color-amber)' : 'var(--color-text-tertiary)' }}>
              {nbArbitrer ? `🌉 ${nbArbitrer} semaine${nbArbitrer > 1 ? 's' : ''} à arbitrer` : '✓ Aucune semaine à arbitrer'}
            </span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filtreArbitrer} onChange={e => setFiltreArbitrer(e.target.checked)} />
              N'afficher que les semaines à arbitrer
            </label>
          </div>

          <div style={s.carte}>
            {semainesAffichees.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: 8 }}>Aucune semaine à afficher.</div>
            ) : semainesAffichees.map(sem => {
              const a = analyses[sem.num]
              const choisi = trameParSemaine[sem.num] ?? null
              const effectiveId = choisi ?? principaleId
              const trame = effectiveId != null ? tramesById[effectiveId] : null
              const ouvert = apercus.has(sem.num)
              const affR = trame ? affectationResolue(trame, sem.num, contexteAmont, affectationsLibres) : {}
              const al = alertesColonnes[sem.num]
              const tropProche = al?.tropProche ?? {}
              const visibles = trame ? trame.colonnes.map((_, i) => i).filter(i => i !== trame.rea && i !== trame.vacances) : []
              return (
                <div key={sem.num} style={s.ligne(a.aArbitrer)}>
                  <div style={s.haut}>
                    <span style={s.libSemaine}>S{sem.num} · {formatJJMM(sem.lundi)} → {formatJJMM(sem.dimanche)}</span>
                    <span style={s.badges}>
                      {a.multiVacances && (
                        <span style={s.badge('var(--color-amber)', 'var(--color-amber-light)')} title="Au moins deux associés en vacances cette semaine">
                          🏖️ {a.vacanciers.length} en vacances : {a.vacanciers.join(', ')}
                        </span>
                      )}
                      {a.pont && (
                        <span style={s.badge('var(--color-amber)', 'var(--color-amber-light)')} title="Jour férié tombant un jour ouvré">
                          🌉 Pont : {a.feries.map(f => `${f.nom} (${f.jourLabel})`).join(', ')}
                        </span>
                      )}
                      {a.scolaire && (
                        <span style={s.badge('var(--color-text-tertiary)', 'transparent')} title="Semaine de vacances scolaires">🎒 Vacances scolaires</span>
                      )}
                      {Object.keys(tropProche).length > 0 && (
                        <span style={s.badge('var(--color-amber)', 'var(--color-amber-light)')} title="Gardes trop rapprochées (< 1 semaine)">
                          🟠 Gardes rapprochées : {Object.entries(tropProche).map(([i, e]) => `${i} (${e} j)`).join(', ')}
                        </span>
                      )}
                    </span>
                    <select
                      value={effectiveId == null ? '' : String(effectiveId)}
                      onChange={e => majTrameSemaine(sem.num, e.target.value === '' ? null : Number(e.target.value))}
                      style={s.selTrame}
                      disabled={trames.length === 0}
                    >
                      <option value="">—</option>
                      {trames.map(t => (
                        <option key={t.id} value={t.id}>{t.nom}{t.id === principaleId ? ' (principale)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ ...s.haut, marginTop: 4, justifyContent: 'space-between' }}>
                    <span style={s.meta}>
                      {trame
                        ? `${trame.colonnes.length} colonne${trame.colonnes.length > 1 ? 's' : ''}${trame.remplacants?.length ? ` · ${trame.remplacants.length} remplaçant${trame.remplacants.length > 1 ? 's' : ''}` : ''}${choisi != null && choisi !== principaleId ? ' · trame spécifique' : ''}`
                        : 'Aucune trame'}
                    </span>
                    {trame && (
                      <button type="button" onClick={() => toggleApercu(sem.num)} style={s.lienApercu}>
                        {ouvert ? 'Masquer l’aperçu' : 'Aperçu & affectation'}
                      </button>
                    )}
                  </div>
                  {ouvert && trame && (
                    <div style={s.apercu}>
                      <TrameGrille
                        colonnes={trame.colonnes}
                        roles={{ rea: trame.rea, vacances: trame.vacances, avantWE: trame.avantWE, apresWE: trame.apresWE, remplacants: trame.remplacants }}
                        colonnesVisibles={visibles}
                        associeParColonne={affR}
                      />
                      <div style={s.colonnesEdit}>
                        {colonnesSelectionnables(trame).map(c => {
                          const cur = affectationsLibres[sem.num]?.[c] ?? ''
                          const verrou = (verrousData[sem.num] ?? []).includes(c)
                          const placesAilleurs = new Set(Object.entries(affR).filter(([cc]) => Number(cc) !== c).map(([, i]) => i))
                          const opts = ASSOCIES.filter(x => x === cur || !placesAilleurs.has(x))
                          return (
                            <span key={c} style={s.colEdit}>
                              <span style={s.colLabel}>C{c + 1}</span>
                              <select value={cur} onChange={e => majAffectationColonne(sem.num, c, e.target.value)} style={s.selCol}>
                                <option value="">—</option>
                                {opts.map(x => <option key={x} value={x}>{x}</option>)}
                              </select>
                              {cur && <BoutonVerrou verrouille={verrou} onToggle={() => basculerVerrouColonne(sem.num, c)} />}
                            </span>
                          )
                        })}
                      </div>
                      {al?.souhaitNonSatisfait?.length > 0 && (
                        <div style={s.alerteSem}>🟠 Souhait de colonne non satisfait : {al.souhaitNonSatisfait.join(', ')}</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
