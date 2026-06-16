import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES, semainesDansPlage, listerSemaines, formatJJMM, feriesEnSemaine, numeroSemaineISO, parseISO, typeDuJour } from '../utils/calendrier'
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
  gardesWeekendParAssocie, gardesSemaineParAssocie, resoudreTrame,
} from '../utils/semaines'
import { colonnesSelectionnables, capaciteVacances } from '../utils/trames'
import { exporterCalendrierExcel } from '../utils/exportCalendrier'
import TrameGrille from '../components/planning/TrameGrille'
import AffectationAssocies from '../components/planning/AffectationAssocies'
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

  // Trame résolue d'une semaine, AVEC repli automatique selon le nombre de vacanciers → { trame,
  // estPrincipale, repli }. Source unique de vérité (affichage, analyses, proposer, export).
  const resoudreSem = useCallback((num) => resoudreTrame({
    trames, tramesById, principaleId,
    choisiId: trameParSemaine[num] ?? null,
    nbVacanciers: (vacancesParSemaine[num] ?? []).length,
  }), [trames, tramesById, principaleId, trameParSemaine, vacancesParSemaine])
  const trameDe = useCallback((num) => resoudreSem(num).trame, [resoudreSem])
  const estPrincipaleSem = useCallback((num) => resoudreSem(num).estPrincipale, [resoudreSem])

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

  // Analyse par semaine : repères informatifs (2+ vacances, pont, scolaire). La catégorie
  // « à arbitrer » / « à surveiller » est calculée séparément (cf. categorieSem).
  const analyses = useMemo(() => {
    const m = {}
    for (const sem of semaines) {
      const vacanciers = vacancesParSemaine[sem.num] ?? []
      const feries = feriesParSemaine[sem.num] ?? []
      m[sem.num] = { vacanciers, feries, multiVacances: vacanciers.length >= 2, pont: feries.length > 0, scolaire: scolairesSet.has(sem.num) }
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

  // Deux catégories distinctes :
  //  - BLOQUANT (« À arbitrer ») : planning invalide tant que non résolu (non placé, colonne de travail
  //    vide, capacité vacances dépassée, vacancier désigné au week-end/réa).
  //  - SURVEILLER (non bloquant) : planning valide mais à vérifier (pont, gardes rapprochées, souhait ignoré).
  const { conflitsBloquants, conflitsSurveiller, semainesBloquantes, semainesSurveiller } = useMemo(() => {
    const bloquants = []
    const surveiller = []
    for (const sem of semaines) {
      const num = sem.num
      const al = alertesColonnes[num]
      const a = analyses[num]
      // — Bloquants —
      if (al?.nonPlaces.length) bloquants.push({ severite: 'danger', semaine: num, message: `S${num} — associé(s) non placé(s) : ${al.nonPlaces.join(', ')} (pas assez de colonnes de travail).` })
      if (al?.colonnesVides.length) bloquants.push({ severite: 'amber', semaine: num, message: `S${num} — colonne(s) de travail non pourvue(s) : ${al.colonnesVides.map(c => `C${c + 1}`).join(', ')}.` })
      const nbVac = a?.vacanciers.length ?? 0
      const capVac = capaciteVacances(trameDe(num))
      if (nbVac > capVac) bloquants.push({ severite: 'amber', semaine: num, message: `S${num} — ${nbVac} associés en vacances mais la trame n'a que ${capVac} colonne(s) vacances : placez le(s) congé(s) en trop à la main ou choisissez une autre trame.` })
      const enVac = new Set(contexteAmont.vacances[num] ?? [])
      const incoherents = new Set()
      if (enVac.has(contexteAmont.weekendAff[num])) incoherents.add(contexteAmont.weekendAff[num])
      if (enVac.has(contexteAmont.weekendAff[num - 1])) incoherents.add(contexteAmont.weekendAff[num - 1])
      if (enVac.has(contexteAmont.rea[num])) incoherents.add(contexteAmont.rea[num])
      if (incoherents.size) bloquants.push({ severite: 'danger', semaine: num, message: `S${num} — ${[...incoherents].join(', ')} en vacances mais désigné(s) au week-end / à la réa : à corriger en amont (étape Week-ends / Réa).` })
      // — À surveiller (non bloquant) —
      if (a?.pont) surveiller.push({ severite: 'info', semaine: num, message: `S${num} — pont : ${a.feries.map(f => `${f.nom} (${f.jourLabel})`).join(', ')} (couverture à vérifier).` })
      if (al?.tropProche && Object.keys(al.tropProche).length) surveiller.push({ severite: 'info', semaine: num, message: `S${num} — gardes rapprochées (< 1 sem.) : ${Object.entries(al.tropProche).map(([i, e]) => `${i} (${e} j)`).join(', ')}.` })
      if (al?.souhaitsIgnoresTrame?.length) surveiller.push({ severite: 'info', semaine: num, message: `S${num} — souhait de colonne ignoré (trame ≠ principale) : ${al.souhaitsIgnoresTrame.join(', ')}.` })
    }
    return {
      conflitsBloquants: bloquants,
      conflitsSurveiller: surveiller,
      semainesBloquantes: new Set(bloquants.map(c => c.semaine)),
      semainesSurveiller: new Set(surveiller.map(c => c.semaine)),
    }
  }, [semaines, alertesColonnes, analyses, trameDe, contexteAmont])

  // Catégorie d'une semaine : 'bloquant' (orange) > 'surveiller' (bleu) > null (neutre).
  const categorieSem = useCallback((num) => (
    semainesBloquantes.has(num) ? 'bloquant' : (semainesSurveiller.has(num) ? 'surveiller' : null)
  ), [semainesBloquantes, semainesSurveiller])

  const nbArbitrer = semainesBloquantes.size
  const nbSurveiller = semainesSurveiller.size
  const semainesAffichees = useMemo(
    () => (filtreArbitrer ? semaines.filter(s => semainesBloquantes.has(s.num)) : semaines),
    [semaines, semainesBloquantes, filtreArbitrer]
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
        const { trame, estPrincipale } = resoudreTrame({
          trames, tramesById, principaleId,
          choisiId: prev.trameParSemaine?.[num] ?? null,
          nbVacanciers: (contexteAmont.vacances[num] ?? []).length,
        })
        return trame ? { trame, estPrincipale } : null
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

  // Affectation quotidienne par semaine (période) pour l'export : { num: { ini: colObject } }.
  // colObject = la colonne de la trame attribuée à l'associé (porte lun..ven + service).
  const affectationsSemaine = useMemo(() => {
    if (!calendrier) return {}
    const m = {}
    for (const sem of semaines) {
      const trame = trameDe(sem.num)
      if (!trame) continue
      const affR = affectationResolue(trame, sem.num, contexteAmont, affectationsLibres)
      const parIni = {}
      for (const [col, ini] of Object.entries(affR)) {
        if (ASSOCIES.includes(ini) && trame.colonnes[Number(col)]) parIni[ini] = trame.colonnes[Number(col)]
      }
      m[sem.num] = parIni
    }
    return m
  }, [semaines, trameDe, contexteAmont, affectationsLibres, calendrier])

  // Bilan CUMULÉ sur l'année par associé (export, comparaison aux objectifs annuels) :
  // G week-end, A/G vendredi, semaines de réa, gardes de semaine (mardi+jeudi), semaines de vacances.
  const bilan = useMemo(() => {
    const b = {}
    for (const ini of ASSOCIES) {
      b[ini] = { gWeekend: 0, aVendredi: 0, gVendredi: 0, rea: 0, gardeSemaine: gardesAnnee.comptes[ini] ?? 0, vacances: 0 }
    }
    const { weekendAff = {}, rea: reaAff = {}, vacances: vac = {} } = contexteAmont
    for (const num of allNums) {
      const wk = weekendAff[num]; if (wk && b[wk]) b[wk].gWeekend++
      const r = reaAff[num]; if (r && b[r]) b[r].rea++
      for (const ini of (vac[num] ?? [])) if (b[ini]) b[ini].vacances++
      if (!calendrier) continue
      const trame = trameDe(num)
      if (!trame) continue
      const affR = affectationResolue(trame, num, contexteAmont, affectationsLibres)
      for (const [col, ini] of Object.entries(affR)) {
        if (!ASSOCIES.includes(ini)) continue
        if (trame.colonnes[Number(col)]?.service?.ven) {
          const t = typeDuJour(calendrier, num, 4)
          if (t === 'A') b[ini].aVendredi++
          else if (t === 'G') b[ini].gVendredi++
        }
      }
    }
    return b
  }, [allNums, contexteAmont, gardesAnnee, trameDe, affectationsLibres, calendrier])

  // Récap « Trames par semaine » pour l'export Excel (2ᵉ feuille).
  const recapTrames = useMemo(() => semaines.map(sem => {
    const a = analyses[sem.num]
    const { trame, estPrincipale, repli } = resoudreSem(sem.num)
    const motif = [a?.multiVacances ? `${a.vacanciers.length} en vacances` : null, a?.pont ? 'pont' : null].filter(Boolean).join(', ')
    return {
      label: `S${sem.num} · ${formatJJMM(sem.lundi)} → ${formatJJMM(sem.dimanche)}`,
      trame: trame ? trame.nom : '—',
      specifique: trame != null && !estPrincipale,
      repli: !!repli,
      arbitrer: semainesBloquantes.has(sem.num),
      motif,
    }
  }), [semaines, analyses, resoudreSem, semainesBloquantes])

  async function exporter() {
    setErreur(null); setExportEnCours(true)
    try {
      await exporterCalendrierExcel(
        annee, calendrier, objectifs, weekends?.affectations, vacancesData?.vacances, reaData?.rea,
        recueil ? { debut: recueil.semaine_debut, fin: recueil.semaine_fin } : null,
        recapTrames, affectationsSemaine, bilan,
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
    // Couleur de carte par catégorie : 'bloquant' (orange) > 'surveiller' (bleu) > neutre.
    ligne: (categorie) => ({
      padding: '8px 10px', marginBottom: 6, borderRadius: 'var(--radius-md)',
      border: `0.5px solid ${categorie === 'bloquant' ? 'var(--color-amber)' : categorie === 'surveiller' ? 'var(--color-primary)' : 'var(--color-border)'}`,
      background: categorie === 'bloquant' ? 'var(--color-amber-light)' : categorie === 'surveiller' ? 'var(--color-primary-light)' : 'var(--color-bg)',
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

          <PanneauConflits conflits={conflitsBloquants} titre="⚠ À arbitrer" couleurBordure="var(--color-danger)" messageVide="Rien à arbitrer ✓" />
          <PanneauConflits conflits={conflitsSurveiller} titre="👁 À surveiller" couleurBordure="var(--color-primary)" messageVide="Rien à surveiller ✓" />

          <div style={{ fontSize: 13, marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: nbArbitrer ? 'var(--color-amber)' : 'var(--color-text-tertiary)' }}>
              {nbArbitrer ? `⚠ ${nbArbitrer} à arbitrer` : '✓ Aucune semaine à arbitrer'}
            </span>
            <span style={{ color: nbSurveiller ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}>
              {nbSurveiller ? `👁 ${nbSurveiller} à surveiller` : '✓ Rien à surveiller'}
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
              const { trame, repli } = resoudreSem(sem.num)
              const effectiveId = trame ? trame.id : null
              const ouvert = apercus.has(sem.num)
              const affR = trame ? affectationResolue(trame, sem.num, contexteAmont, affectationsLibres) : {}
              const al = alertesColonnes[sem.num]
              const tropProche = al?.tropProche ?? {}
              const remplaCols = trame ? new Set((trame.remplacants ?? []).map(r => r.col)) : new Set()
              const visibles = trame ? trame.colonnes.map((_, i) => i).filter(i => i !== trame.rea && !trame.vacances.includes(i) && !remplaCols.has(i)) : []
              // ≥ 2 vacanciers : ne proposer que les trames à capacité suffisante (+ la trame courante).
              const vReq = a.vacanciers.length
              const tramesOptions = trames.filter(t => vReq < 2 || capaciteVacances(t) >= vReq || t.id === effectiveId)
              const nbMasquees = trames.length - tramesOptions.length
              return (
                <div key={sem.num} style={s.ligne(categorieSem(sem.num))}>
                  <div style={s.haut}>
                    <span
                      style={{ ...s.libSemaine, cursor: trame ? 'pointer' : 'default' }}
                      onClick={trame ? () => toggleApercu(sem.num) : undefined}
                      title={trame ? 'Cliquer pour voir/masquer l’affectation de la semaine' : undefined}
                    >
                      S{sem.num} · {formatJJMM(sem.lundi)} → {formatJJMM(sem.dimanche)}
                    </span>
                    <span style={s.badges}>
                      {a.multiVacances && (
                        <span style={s.badge('var(--color-text-secondary)', 'transparent')} title="Au moins deux associés en vacances cette semaine (information)">
                          🏖️ {a.vacanciers.length} en vacances : {a.vacanciers.join(', ')}
                        </span>
                      )}
                      {a.pont && (
                        <span style={s.badge('var(--color-primary)', 'var(--color-primary-light)')} title="À surveiller — jour férié tombant un jour ouvré">
                          🌉 Pont : {a.feries.map(f => `${f.nom} (${f.jourLabel})`).join(', ')}
                        </span>
                      )}
                      {a.scolaire && (
                        <span style={s.badge('var(--color-text-tertiary)', 'transparent')} title="Semaine de vacances scolaires">🎒 Vacances scolaires</span>
                      )}
                      {Object.keys(tropProche).length > 0 && (
                        <span style={s.badge('var(--color-primary)', 'var(--color-primary-light)')} title="À surveiller — gardes trop rapprochées (< 1 semaine)">
                          🔵 Gardes rapprochées : {Object.entries(tropProche).map(([i, e]) => `${i} (${e} j)`).join(', ')}
                        </span>
                      )}
                      {al?.souhaitsIgnoresTrame?.length > 0 && (
                        <span style={s.badge('var(--color-primary)', 'var(--color-primary-light)')} title="À surveiller — trame spécifique : la colonne demandée (sur la trame principale) ne s'applique pas">
                          🔵 Souhait colonne ignoré (trame ≠ principale) : {al.souhaitsIgnoresTrame.join(', ')}
                        </span>
                      )}
                    </span>
                    <select
                      value={trameParSemaine[sem.num] != null ? String(trameParSemaine[sem.num]) : ''}
                      onChange={e => majTrameSemaine(sem.num, e.target.value === '' ? null : Number(e.target.value))}
                      style={s.selTrame}
                      disabled={trames.length === 0}
                    >
                      <option value="">Automatique (selon les vacances)</option>
                      {tramesOptions.map(t => {
                        const insuffisante = vReq >= 2 && capaciteVacances(t) < vReq
                        return (
                          <option key={t.id} value={t.id}>
                            {t.nom}{t.id === principaleId ? ' (principale)' : ''}{insuffisante ? ' — colonnes vacances insuffisantes' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                  {trameParSemaine[sem.num] == null && trame && (
                    <div style={{ ...s.meta, marginTop: 2, color: 'var(--color-primary-dark)' }}>
                      ↪ Automatique : « {trame.nom} » — {capaciteVacances(trame)} colonne{capaciteVacances(trame) > 1 ? 's' : ''} vacances pour {vReq} vacancier{vReq > 1 ? 's' : ''} cette semaine{repli ? ' (la principale n’a pas assez de colonnes vacances)' : ''}.
                    </div>
                  )}
                  {nbMasquees > 0 && (
                    <div style={{ ...s.meta, marginTop: 2 }}>
                      {nbMasquees} autre{nbMasquees > 1 ? 's' : ''} trame{nbMasquees > 1 ? 's' : ''} non proposée{nbMasquees > 1 ? 's' : ''} dans la liste : moins de {vReq} colonnes vacances pour les {vReq} congés de cette semaine.
                    </div>
                  )}
                  <div style={{ ...s.haut, marginTop: 4, justifyContent: 'space-between' }}>
                    <span style={s.meta}>
                      {trame
                        ? `${trame.colonnes.length} colonne${trame.colonnes.length > 1 ? 's' : ''}${trame.remplacants?.length ? ` · ${trame.remplacants.length} remplaçant${trame.remplacants.length > 1 ? 's' : ''}` : ''}${trameParSemaine[sem.num] != null && trameParSemaine[sem.num] !== principaleId ? ' · trame spécifique' : ''}`
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
                      <AffectationAssocies trame={trame} affResolue={affR} annee={annee} num={sem.num} calendrier={calendrier} />
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
