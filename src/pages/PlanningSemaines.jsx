import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES, semainesDansPlage, listerSemaines, formatJJMM, feriesEnSemaine, numeroSemaineISO, parseISO, typeDuJour } from '../utils/calendrier'
import { ANNEE_DEFAUT, normaliser } from '../utils/desiderata'
import { ASSOCIES } from '../data/associes'
import { listerRecueils, chargerTousDesiderata, chargerProfilsAvecInitiales, definirStatutRecueil, supprimerDesiderataRecueil } from '../utils/desiderataApi'
import { uploaderArchive } from '../utils/archivesApi'
import { chargerCalendrier } from '../utils/calendrierApi'
import { chargerObjectifs } from '../utils/objectifsApi'
import { chargerWeekends } from '../utils/weekendsApi'
import { chargerVacances } from '../utils/vacancesApi'
import { chargerRea } from '../utils/reaApi'
import { chargerTrames } from '../utils/tramesApi'
import { chargerSemaines, sauverSemaines } from '../utils/semainesApi'
import { chargerNoel } from '../utils/noelApi'
import { bilanNoel } from '../utils/noel'
import { cleEcart } from '../utils/ponts'
import {
  proposerSemaines, ameliorerEspacementSemaines, affectationResolue, analyserSemaineColonnes,
  gardesWeekendParAssocie, gardesSemaineParAssocie, bilanVendrediRecupParAssocie, roleVendrediCol, resoudreTrame,
} from '../utils/semaines'
import { colonnesSelectionnables, capaciteVacances, JOURS } from '../utils/trames'
import { exporterCalendrierExcel, genererClasseurBuffer } from '../utils/exportCalendrier'
import ApercuSemaine from '../components/planning/ApercuSemaine'
import BoutonVerrou from '../components/planning/BoutonVerrou'
import PanneauConflits from '../components/planning/PanneauConflits'

// getUTCDay() → jour de semaine (lun→ven) ; samedi/dimanche ignorés (jours off de semaine seulement).
const JOUR_SEMAINE = { 1: 'lun', 2: 'mar', 3: 'mer', 4: 'jeu', 5: 'ven' }

// Lignes du bilan « Réalisé à ce stade » (identique au bloc de l'export Excel).
const LIGNES_BILAN = [
  ['gWeekend', 'G week-end'],
  ['aVendredi', 'A vendredi'],
  ['gVendredi', 'G vendredi'],
  ['rea', 'Réa'],
  ['gardeSemaine', 'Gardes de semaine'],
  ['vacances', 'Semaines de vacances'],
  ['recupJF', 'Récup jours fériés'],
]

// Étape « En semaine » : trame par semaine + remplissage des colonnes (qui occupe quoi), avec
// équilibre des gardes de semaine (période molle / année dure) et espacement (≥ 1 semaine).
export default function PlanningSemaines({ annee: anneeProp, onChangeAnnee, onStatut, onRegisterSave } = {}) {
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
  const [noelData, setNoelData] = useState(null) // grille de Noël (15 jours fournis tels quels)
  const [data, setData] = useState(null)        // { v, trameParSemaine, affectations, verrous }
  const [erreur, setErreur] = useState(null)
  const [enregistre, setEnregistre] = useState(false)
  const [exportEnCours, setExportEnCours] = useState(false)
  const [filtreArbitrer, setFiltreArbitrer] = useState(false)
  const [apercus, setApercus] = useState(() => new Set())
  // Résultat de la dernière amélioration d'espacement : { avant, apres } (gardes rapprochées).
  const [espacementInfo, setEspacementInfo] = useState(null)
  // Vue continue (compacte) : grilles enchaînées sans marges, façon tableur Excel.
  const [vueContinue, setVueContinue] = useState(false)
  // Validation définitive : { etat:'cours'|'ok', message } ou null.
  const [validation, setValidation] = useState(null)
  // Échange de colonnes (vue continue) : associé sélectionné en attente d'un 2e clic, { num, ini } ou null.
  const [selEchange, setSelEchange] = useState(null)
  // Pile d'annulation : états `data` mémorisés AVANT chaque modification (échange, override, trame,
  // proposer, améliorer, effacer) → permet un « Retour en arrière » pas à pas.
  const [historique, setHistorique] = useState([])

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
      chargerObjectifs(annee), chargerWeekends(annee), chargerRea(annee), chargerNoel(annee),
    ])
      .then(([tr, vac, cal, sem, obj, we, rea, noel]) => {
        if (annule) return
        setTramesData(tr); setVacancesData(vac); setCalendrier(cal); setData(sem)
        setObjectifs(obj); setWeekends(we); setReaData(rea); setNoelData(noel)
        setHistorique([]); setSelEchange(null)
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
  // Offsets (0=lun … 4=ven) des jours fériés ouvrés par semaine — pour l'équilibrage des récup JF dans le moteur.
  const feriesOffsetsParSemaine = useMemo(() => {
    const m = {}
    for (const [num, arr] of Object.entries(feriesParSemaine)) {
      const offs = arr.map(f => parseISO(f.iso).getUTCDay() - 1).filter(o => o >= 0 && o <= 4)
      if (offs.length) m[Number(num)] = offs
    }
    return m
  }, [feriesParSemaine])
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
  // Jours off écartés par le faiseur (Ouverture du planning / Week-ends) : Set('INI|YYYY-MM-DD').
  const ecartesSet = useMemo(() => new Set(calendrier?.pontsEcartes ?? []), [calendrier])
  const joursOffDetailParAssocie = useMemo(() => {
    const m = {}
    for (const row of desideratas) {
      const ini = parUser[row.user_id]
      if (!ini) continue
      const parSem = {}
      for (const iso of (normaliser(row.data).joursOffSouhaites ?? [])) {
        if (ecartesSet.has(cleEcart(ini, iso))) continue // jour off ignoré par le faiseur
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
  }, [desideratas, parUser, ecartesSet])
  // Score de DEMANDES par associé : plus un associé a formulé de souhaits (jours off, vacances précises,
  // week-ends indisponibles, souhaits de colonne), plus il sera prioritaire pour ABSORBER une garde
  // rapprochée si un arbitrage d'espacement est nécessaire (équité : qui demande plus accepte plus).
  const demandeParAssocie = useMemo(() => {
    const m = {}
    for (const row of desideratas) {
      const ini = parUser[row.user_id]
      if (!ini) continue
      const d = normaliser(row.data)
      m[ini] = (d.joursOffSouhaites?.length ?? 0)
        + (d.vacancesSouhaitees?.length ?? 0)
        + (d.weekendsIndispo?.length ?? 0)
        + Object.keys(d.colonnesSouhaitees ?? {}).length
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
        vacanciersSuivante: contexteAmont.vacances[sem.num + 1] ?? [],
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
      if (al?.vendrediAvantVacances?.length) bloquants.push({ severite: 'danger', semaine: num, message: `S${num} — ${al.vendrediAvantVacances.join(', ')} de service le vendredi alors qu'il(s) part(ent) en vacances la semaine suivante (interdit) : à réaffecter.` })
      // — À surveiller (non bloquant) —
      if (a?.pont) surveiller.push({ severite: 'info', semaine: num, message: `S${num} — pont : ${a.feries.map(f => `${f.nom} (${f.jourLabel})`).join(', ')} — jour férié en semaine : vérifie qui travaille et la garde/astreinte ce jour-là (l'outil ne l'ajuste pas automatiquement).` })
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
  // Mémorise l'état courant AVANT une modification (max 100 niveaux d'annulation).
  function instantane() {
    setHistorique(h => [...h.slice(-99), data])
  }

  // Retour en arrière : restaure l'état précédent (un cran par clic).
  function annuler() {
    if (!historique.length) return
    const precedent = historique[historique.length - 1]
    setHistorique(historique.slice(0, -1))
    setData(precedent)
    setEnregistre(false); onStatut?.('modifie'); setSelEchange(null); setEspacementInfo(null)
  }

  // Effacer tout : vide les affectations « En semaine » (proposition + ajustements) pour repartir de zéro.
  // Les trames choisies par semaine sont conservées. Annulable via « Retour en arrière ».
  function effacerTout() {
    if (!Object.keys(data?.affectations ?? {}).length) return
    if (!window.confirm(
      'Effacer toutes les affectations « En semaine » de cette année (proposition automatique + ajustements) ?\n\n' +
      '• Les trames choisies par semaine sont CONSERVÉES.\n' +
      '• Action annulable avec « Retour en arrière ».'
    )) return
    instantane()
    setEnregistre(false); onStatut?.('modifie'); setSelEchange(null); setEspacementInfo(null)
    setData(prev => ({ ...prev, affectations: {}, verrous: {} }))
  }

  function majTrameSemaine(num, trameId) {
    instantane()
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
    instantane()
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
    if (data?.affectations?.[num]?.[col] == null) return // rien à verrouiller
    instantane()
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

  // Échange (mouvement final, vue continue) : permute les colonnes occupées par deux associés d'UNE semaine.
  // Réutilise le mécanisme override + verrou (affectationResolue superpose data.affectations) → fonctionne
  // pour n'importe quelle colonne (réa, vacances, gardes, travail). On verrouille les deux colonnes pour que
  // « Proposer » / « Améliorer » ne défassent pas l'ajustement.
  function echangerColonnes(num, iniA, iniB) {
    if (!iniA || !iniB || iniA === iniB) return
    const trame = trameDe(num)
    if (!trame) return
    const affR = affectationResolue(trame, num, contexteAmont, affectationsLibres)
    let colA = null, colB = null
    for (const [col, ini] of Object.entries(affR)) {
      if (ini === iniA) colA = Number(col)
      else if (ini === iniB) colB = Number(col)
    }
    if (colA == null || colB == null) return // un associé non placé : pas d'échange possible
    instantane()
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const aff = { ...(prev.affectations ?? {}) }
      const cols = { ...(aff[num] ?? {}) }
      cols[colA] = iniB; cols[colB] = iniA
      aff[num] = cols
      const ver = { ...(prev.verrous ?? {}) }
      const vcols = new Set(ver[num] ?? [])
      vcols.add(colA); vcols.add(colB)
      ver[num] = [...vcols].sort((a, b) => a - b)
      return { ...prev, affectations: aff, verrous: ver }
    })
  }

  // Clic sur l'en-tête d'un associé (vue continue) : 1er clic = sélection ; 2e clic même semaine = échange ;
  // re-clic sur le même = désélection ; clic sur une autre semaine = nouvelle sélection.
  function clicEnteteColonne(num, ini) {
    if (selEchange && selEchange.num === num) {
      if (selEchange.ini === ini) { setSelEchange(null); return }
      echangerColonnes(num, selEchange.ini, ini)
      setSelEchange(null)
      return
    }
    setSelEchange({ num, ini })
  }

  // Monte les entrées communes aux moteurs (trameInfo + socle d'équilibre annuel + verrous) à partir du state.
  function monterEntreesMoteur(prev) {
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
    // Socle hors-plage des équilibres additionnels (A vendredi, G vendredi, récup JF) pour l'équilibre annuel.
    const vrHors = bilanVendrediRecupParAssocie(horsNums, calendrier, (n) => trameInfo(n)?.trame ?? null, contexteAmont, prev.affectations ?? {}, feriesOffsetsParSemaine)
    // Verrous de la plage = colonnes forcées à préserver.
    const fixes = {}
    for (const sem of semaines) {
      const cols = prev.verrous?.[sem.num] ?? []
      if (!cols.length) continue
      const m = {}
      for (const c of cols) if (prev.affectations?.[sem.num]?.[c] != null) m[c] = prev.affectations[sem.num][c]
      if (Object.keys(m).length) fixes[sem.num] = m
    }
    return {
      trameInfo, gardesInitiales, compteAnneeInitial: gSemHors.comptes, fixes,
      aVenInitial: vrHors.aVen, gVenInitial: vrHors.gVen, recupInitial: vrHors.recup,
    }
  }

  function proposer() {
    if (!recueil) return
    instantane()
    setEnregistre(false); setEspacementInfo(null); onStatut?.('modifie')
    setData(prev => {
      const { trameInfo, gardesInitiales, compteAnneeInitial, fixes, aVenInitial, gVenInitial, recupInitial } = monterEntreesMoteur(prev)
      const proposees = proposerSemaines({
        semainesPlage: semaines, annee, calendrier, trameInfo, contexteAmont,
        desiderata: { colonnesSouhaiteesParAssocie, joursOffDetailParAssocie, demandeParAssocie },
        gardesInitiales, compteAnneeInitial, fixes,
        aVenInitial, gVenInitial, recupInitial, feriesOffsetsParSemaine,
      })
      const aff = { ...(prev.affectations ?? {}) }
      for (const sem of semaines) {
        const m = proposees[sem.num] ?? {}
        if (Object.keys(m).length) aff[sem.num] = m; else delete aff[sem.num]
      }
      return { ...prev, affectations: aff }
    })
  }

  // 2e passage : recherche locale par échanges pour réduire les gardes rapprochées (équilibre préservé).
  function ameliorer() {
    if (!recueil || !data) return
    instantane()
    const { trameInfo, gardesInitiales, compteAnneeInitial, fixes, aVenInitial, gVenInitial, recupInitial } = monterEntreesMoteur(data)
    const { affectations: ameliorees, avant, apres, avantVR, apresVR } = ameliorerEspacementSemaines({
      semainesPlage: semaines, annee, calendrier, trameInfo, contexteAmont,
      desiderata: { colonnesSouhaiteesParAssocie, joursOffDetailParAssocie },
      gardesInitiales, compteAnneeInitial, fixes, affectations: data.affectations ?? {},
      aVenInitial, gVenInitial, recupInitial, feriesOffsetsParSemaine,
    })
    setEspacementInfo({ avant, apres, avantVR, apresVR })
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const aff = { ...(prev.affectations ?? {}) }
      for (const sem of semaines) {
        const m = ameliorees[sem.num] ?? {}
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
      return true
    } catch {
      setErreur('Enregistrement impossible (réservé au faiseur).')
      return false
    }
  }

  // Permet au parent (assistant) de déclencher cet enregistrement avant un changement d'étape.
  useEffect(() => { onRegisterSave?.(enregistrer) })

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

  // Colonnes remplaçant par semaine (période) pour l'export : { num: [colObject, …] } (lun..ven + service),
  // triées par index de colonne. Personnes externes (hors des 8 associés).
  const remplacantsSemaine = useMemo(() => {
    const m = {}
    for (const sem of semaines) {
      const trame = trameDe(sem.num)
      if (!trame) continue
      const cols = (trame.remplacants ?? [])
        .filter(r => r.col != null)
        .slice().sort((a, b) => a.col - b.col)
        .map(r => trame.colonnes[r.col])
        .filter(Boolean)
      if (cols.length) m[sem.num] = cols
    }
    return m
  }, [semaines, trameDe])

  // Récup « jour férié » CUMULÉES sur l'année, dans l'ordre chronologique : un associé qui devait
  // travailler (vrai poste, ≠ de-service) un jour férié ouvré gagne une récup. La personne de service
  // (garde/astreinte) ce jour-là travaille → pas de récup ; un repos ne donne pas de récup.
  //   total : { ini: nb } · parSemaine : { num: { ini: indexCumulé } } (pour le libellé « Récup JF-N »).
  const calculerRecup = useCallback((nums) => {
    const total = {}; for (const ini of ASSOCIES) total[ini] = 0
    const parSemaine = {}
    if (!calendrier) return { total, parSemaine }
    for (const num of [...nums].sort((a, b) => a - b)) {
      const feries = feriesParSemaine[num]
      if (!feries?.length) continue
      const trame = trameDe(num)
      if (!trame) continue
      const affR = affectationResolue(trame, num, contexteAmont, affectationsLibres)
      for (const f of feries) {
        const offset = parseISO(f.iso).getUTCDay() - 1 // lun=0 … ven=4
        if (offset < 0 || offset > 4) continue
        const jour = JOURS[offset]
        for (const [col, ini] of Object.entries(affR)) {
          if (!ASSOCIES.includes(ini)) continue
          const colObj = trame.colonnes[Number(col)]
          const estRea = Number(col) === trame.rea
          if (!colObj || (!estRea && colObj.service?.[jour])) continue // de-service → pas de récup (réa : jamais de service)
          if (!(colObj[jour] ?? '').trim()) continue       // repos → pas de récup
          total[ini]++
          ;(parSemaine[num] ??= {})[ini] = total[ini]
        }
      }
    }
    return { total, parSemaine }
  }, [feriesParSemaine, trameDe, contexteAmont, affectationsLibres, calendrier])

  const recup = useMemo(() => calculerRecup(allNums), [calculerRecup, allNums])

  // Contribution de la période de Noël (15 jours fournis tels quels) au bilan annuel + semaines ISO
  // couvertes (qu'on exclura des agrégations normales pour éviter le double comptage).
  const noel = useMemo(() => bilanNoel(noelData, annee), [noelData, annee])

  // Réa / vacanciers EFFECTIFS par semaine : qui occupe RÉELLEMENT la colonne réa / les colonnes vacances
  // dans l'affectation résolue (overrides compris). Permet aux échanges manuels (réa/vacances inclus) de se
  // répercuter sur le bilan, les compteurs, la grille et l'export. Les données amont (contexteAmont.rea,
  // vacancesParSemaine) restent la vérité pour la logique de planning (choix de trame, capacité, seed du
  // moteur). Le week-end (samedi/dimanche) n'est PAS concerné (hors périmètre des échanges).
  const effectifs = useMemo(() => {
    const rea = {}; const vacanciers = {}
    if (!calendrier) return { rea, vacanciers }
    for (const num of allNums) {
      const trame = trameDe(num)
      if (!trame) continue
      const affR = affectationResolue(trame, num, contexteAmont, affectationsLibres)
      const rIni = trame.rea != null ? affR[trame.rea] : null
      if (rIni != null && ASSOCIES.includes(rIni)) rea[num] = rIni
      const vacs = []
      for (const col of (trame.vacances ?? [])) {
        const ini = affR[col]
        if (ini != null && ASSOCIES.includes(ini)) vacs.push(ini)
      }
      if (vacs.length) vacanciers[num] = vacs
    }
    return { rea, vacanciers }
  }, [allNums, trameDe, contexteAmont, affectationsLibres, calendrier])

  // Compteurs CUMULÉS par associé (export), dans l'ordre chronologique : on mémorise, à chaque
  // occurrence, le n° courant (pour l'afficher dans la case : « G1 », « NC G 3 », « Réa2 », n° de vacances…).
  //   weekend:{num:n} · gardeSem:{num:{offset:n}} · vendredi:{num:n} · rea:{num:n} · vac:{num:{ini:n}}
  const compteurs = useMemo(() => {
    const cWE = {}, cGS = {}, cAV = {}, cGV = {}, cRea = {}, cVac = {}
    for (const ini of ASSOCIES) { cWE[ini] = 0; cGS[ini] = 0; cAV[ini] = 0; cGV[ini] = 0; cRea[ini] = 0; cVac[ini] = 0 }
    const weekend = {}, gardeSem = {}, vendredi = {}, rea = {}, vac = {}
    const { weekendAff = {} } = contexteAmont
    for (const num of [...allNums].sort((a, b) => a - b)) {
      const wk = weekendAff[num]; if (wk && cWE[wk] != null) { cWE[wk]++; weekend[num] = cWE[wk] }
      const r = effectifs.rea[num]; if (r && cRea[r] != null) { cRea[r]++; rea[num] = cRea[r] }
      for (const ini of (effectifs.vacanciers[num] ?? [])) if (cVac[ini] != null) { cVac[ini]++; (vac[num] ??= {})[ini] = cVac[ini] }
      if (!calendrier) continue
      const trame = trameDe(num)
      if (!trame) continue
      const affR = affectationResolue(trame, num, contexteAmont, affectationsLibres)
      const deService = (jour) => {
        for (const [col, a] of Object.entries(affR)) {
          // La réa n'est jamais de service (ni garde ni astreinte).
          if (ASSOCIES.includes(a) && Number(col) !== trame.rea && trame.colonnes[Number(col)]?.service?.[jour]) return a
        }
        return null
      }
      const aMar = deService('mar'); if (aMar) { cGS[aMar]++; (gardeSem[num] ??= {})[1] = cGS[aMar] }
      const aJeu = deService('jeu'); if (aJeu && typeDuJour(calendrier, num, 3) === 'G') { cGS[aJeu]++; (gardeSem[num] ??= {})[3] = cGS[aJeu] }
      const aVen = deService('ven')
      if (aVen) {
        const t = typeDuJour(calendrier, num, 4)
        if (t === 'A') { cAV[aVen]++; vendredi[num] = cAV[aVen] }
        else if (t === 'G') { cGV[aVen]++; vendredi[num] = cGV[aVen] }
      }
    }
    return { weekend, gardeSem, vendredi, rea, vac }
  }, [allNums, contexteAmont, trameDe, affectationsLibres, calendrier, effectifs])

  // Bilan CUMULÉ sur l'année par associé (export, comparaison aux objectifs annuels) :
  // G week-end, A/G vendredi, semaines de réa, gardes de semaine (mardi+jeudi), semaines de vacances.
  const bilan = useMemo(() => {
    // Les semaines couvertes par la grille de Noël sont EXCLUES des agrégations normales (gardes,
    // vendredi, réa, vacances, récup) : la grille de Noël fait autorité sur ces semaines. Ses comptes
    // sont AJOUTÉS ensuite → total annuel correct, sans double comptage.
    const exclu = noel.semaines
    const numsHN = allNums.filter(n => !exclu.has(n))
    const gSemHN = calendrier
      ? gardesSemaineParAssocie(numsHN, annee, calendrier, trameDe, contexteAmont, affectationsLibres)
      : { comptes: {} }
    const recupHN = calculerRecup(numsHN)
    const b = {}
    for (const ini of ASSOCIES) {
      b[ini] = { gWeekend: 0, aVendredi: 0, gVendredi: 0, rea: 0, gardeSemaine: gSemHN.comptes[ini] ?? 0, vacances: 0, recupJF: recupHN.total[ini] ?? 0 }
    }
    const { weekendAff = {} } = contexteAmont
    for (const num of numsHN) {
      const wk = weekendAff[num]; if (wk && b[wk]) b[wk].gWeekend++
      const r = effectifs.rea[num]; if (r && b[r]) b[r].rea++
      for (const ini of (effectifs.vacanciers[num] ?? [])) if (b[ini]) b[ini].vacances++
      if (!calendrier) continue
      const trame = trameDe(num)
      if (!trame) continue
      const affR = affectationResolue(trame, num, contexteAmont, affectationsLibres)
      for (const [col, ini] of Object.entries(affR)) {
        if (!ASSOCIES.includes(ini)) continue
        const rv = roleVendrediCol(trame, Number(col), num, calendrier) // exclut la réa
        if (rv === 'A') b[ini].aVendredi++
        else if (rv === 'G') b[ini].gVendredi++
      }
    }
    // Ajout des comptes de Noël (sur les semaines exclues ci-dessus).
    for (const ini of ASSOCIES) {
      const n = noel.parAssocie[ini]
      if (!n) continue
      b[ini].gWeekend += n.gWeekend
      b[ini].aVendredi += n.aVendredi
      b[ini].gVendredi += n.gVendredi
      b[ini].gardeSemaine += n.gardeSemaine
      b[ini].rea += n.rea
      b[ini].recupJF += n.recupJF
      b[ini].vacances += n.vacances ?? 0
    }
    return b
  }, [allNums, contexteAmont, trameDe, affectationsLibres, calendrier, annee, effectifs, noel, calculerRecup])

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
        annee, calendrier, objectifs, weekends?.affectations, effectifs.vacanciers, effectifs.rea,
        recueil ? { debut: recueil.semaine_debut, fin: recueil.semaine_fin } : null,
        recapTrames, affectationsSemaine, bilan, recup.parSemaine, remplacantsSemaine, compteurs, noelData,
      )
    } catch {
      setErreur('Export Excel impossible.')
    } finally {
      setExportEnCours(false)
    }
  }

  // Valide DÉFINITIVEMENT le planning de la période : archive l'Excel (Supabase Storage, consultable
  // dans Ouverture du planning), ferme le recueil et RÉINITIALISE ses desiderata. Le planning construit
  // (week-ends, vacances, réa, en-semaine) est CONSERVÉ comme socle annuel.
  async function valider() {
    if (!recueil) return
    const ok = window.confirm(
      `Valider définitivement « ${recueil.nom} » ?\n\n` +
      '• Le planning de la période sera archivé en Excel (consultable dans Ouverture du planning).\n' +
      '• Les desiderata de cette période seront EFFACÉS.\n' +
      '• Le planning construit (week-ends, vacances, réa, en-semaine) est CONSERVÉ.\n\n' +
      'Cette action est définitive.'
    )
    if (!ok) return
    setErreur(null); setValidation({ etat: 'cours', message: 'Archivage en cours…' })
    try {
      const { buffer } = await genererClasseurBuffer(
        annee, calendrier, objectifs, weekends?.affectations, effectifs.vacanciers, effectifs.rea,
        recueil ? { debut: recueil.semaine_debut, fin: recueil.semaine_fin } : null,
        recapTrames, affectationsSemaine, bilan, recup.parSemaine, remplacantsSemaine, compteurs, noelData,
      )
      await uploaderArchive({ annee, recueil, buffer, userId: session.user.id })
      await definirStatutRecueil(recueil.id, 'ferme')
      await supprimerDesiderataRecueil(recueil.id)
      setValidation({ etat: 'ok', message: 'Planning archivé ✓ — disponible dans Ouverture du planning. Desiderata réinitialisés.' })
      onStatut?.('enregistre')
    } catch {
      setErreur('Validation impossible (archivage ou réinitialisation). Vérifie que la migration Supabase est appliquée.')
      setValidation(null)
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
    // Vue continue : bloc compact sans marges (grilles qui se touchent), accent de catégorie à gauche.
    ligneCompact: (categorie) => ({
      padding: '2px 0 4px', marginBottom: 2,
      borderLeft: `3px solid ${categorie === 'bloquant' ? 'var(--color-amber)' : categorie === 'surveiller' ? 'var(--color-primary)' : 'transparent'}`,
      paddingLeft: 6,
    }),
    labelCompact: (categorie) => ({
      fontSize: 12, fontWeight: 700, marginBottom: 2,
      color: categorie === 'bloquant' ? 'var(--color-amber)' : categorie === 'surveiller' ? 'var(--color-primary)' : 'var(--color-text)',
    }),
    haut: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    // Bandeau cliquable (libellé + badges) qui déroule l'aperçu — zone bien plus large que la seule date.
    bandeauCliquable: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1 },
    libSemaine: { fontSize: 13, fontWeight: 600, color: 'var(--color-text)', minWidth: 168 },
    badges: { display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 },
    badge: (couleur, fond) => ({
      fontSize: 13, fontWeight: 600, color: couleur, background: fond,
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
    bilanTh: { padding: '4px 10px', fontSize: 12, fontWeight: 700, color: 'var(--color-text)', textAlign: 'center', borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap' },
    bilanThLabel: { padding: '4px 10px', borderBottom: '0.5px solid var(--color-border)' },
    bilanTd: { padding: '4px 10px', fontSize: 12.5, textAlign: 'center', color: 'var(--color-text)', borderBottom: '0.5px solid var(--color-border)' },
    bilanTdLabel: { padding: '4px 10px', fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', borderBottom: '0.5px solid var(--color-border)' },
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
  const aDesAffectations = Object.keys(data?.affectations ?? {}).length > 0
  // Nombre max de colonnes remplaçant sur la période — pour aligner les colonnes entre semaines (vue continue).
  const nbRemplMax = semaines.reduce((m, s) => Math.max(m, remplacantsSemaine[s.num]?.length ?? 0), 0)

  return (
    <div style={{ maxWidth: vueContinue ? '100%' : 1180 }}>
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
        <button
          type="button"
          onClick={ameliorer}
          disabled={!pret || !recueil || !aDesAffectations}
          style={{ ...s.bouton, padding: '8px 14px', fontSize: 13, background: 'transparent', color: 'var(--color-primary)', border: '0.5px solid var(--color-primary)', opacity: (!pret || !recueil || !aDesAffectations) ? 0.5 : 1 }}
          title="2e passage : échange des colonnes pour réduire les gardes rapprochées, sans dégrader l'équilibre ni toucher aux cases verrouillées"
        >
          Améliorer l’espacement
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
        <button
          type="button"
          onClick={valider}
          disabled={!pret || !recueil || validation?.etat === 'cours'}
          style={{ ...s.bouton, padding: '8px 14px', fontSize: 13, background: 'var(--color-success)', opacity: (!pret || !recueil || validation?.etat === 'cours') ? 0.5 : 1 }}
          title="Archive le planning de la période en Excel (consultable dans Ouverture du planning), ferme le recueil et réinitialise ses desiderata. Le planning construit est conservé."
        >
          {validation?.etat === 'cours' ? 'Validation…' : '✅ Valider définitivement'}
        </button>
        {enregistre && <span style={{ fontSize: 13, color: 'var(--color-success)', alignSelf: 'center' }}>Enregistré ✓</span>}
        {validation?.etat === 'ok' && <span style={{ fontSize: 13, color: 'var(--color-success)', alignSelf: 'center' }}>{validation.message}</span>}
        {espacementInfo && (() => {
          const ameliore = espacementInfo.apres < espacementInfo.avant || espacementInfo.apresVR < espacementInfo.avantVR
          return (
            <span style={{ fontSize: 13, alignSelf: 'center', color: ameliore ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
              Gardes rapprochées : {espacementInfo.avant} → {espacementInfo.apres} · écart vendredi/récup : {espacementInfo.avantVR} → {espacementInfo.apresVR}
              {!ameliore ? ' (rien à améliorer sans déséquilibrer)' : ''}
            </span>
          )
        })()}
      </div>

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          {erreur}
        </div>
      )}

      {pret && principaleId == null && (
        <div style={{ fontSize: 13, color: 'var(--color-amber)', background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          Aucune <strong>trame principale</strong> désignée. Choisissez-en une dans l'onglet <strong>Trames</strong> (Ouverture du planning) pour pouvoir remplir.
        </div>
      )}

      {!recueil ? (
        <div style={{ ...s.carte, color: 'var(--color-text-secondary)', fontSize: 14, padding: 20 }}>
          Aucune période disponible. Créez un recueil « normal » dans <strong>Ouverture du planning</strong>.
        </div>
      ) : !pret ? (
        <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Chargement…</div>
      ) : (
        <>
          <PanneauConflits conflits={conflitsBloquants} titre="⚠ À arbitrer" couleurBordure="var(--color-danger)" messageVide="Rien à arbitrer ✓" />
          <PanneauConflits conflits={conflitsSurveiller} titre="👁 À surveiller" couleurBordure="var(--color-primary)" messageVide="Rien à surveiller ✓" />

          {/* Bilan « Réalisé à ce stade » (cumul annuel) — identique au tableau de l'export Excel. */}
          <div style={{ ...s.carte, overflowX: 'auto', padding: '10px 14px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>
              Réalisé à ce stade (année {annee})
            </div>
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={s.bilanThLabel}>&nbsp;</th>
                  {ASSOCIES.map(ini => <th key={ini} style={s.bilanTh}>{ini}</th>)}
                </tr>
              </thead>
              <tbody>
                {LIGNES_BILAN.map(([cle, label]) => (
                  <tr key={cle}>
                    <td style={s.bilanTdLabel}>{label}</td>
                    {ASSOCIES.map(ini => <td key={ini} style={s.bilanTd}>{bilan[ini]?.[cle] ?? 0}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
            <button
              type="button"
              onClick={() => setVueContinue(v => !v)}
              style={{
                padding: '4px 10px', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer',
                border: `0.5px solid ${vueContinue ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: vueContinue ? 'var(--color-primary)' : 'var(--color-bg)',
                color: vueContinue ? '#fff' : 'var(--color-text-secondary)',
              }}
              title="Enchaîne les grilles sans marges (façon tableur). Recliquer pour revenir à la vue normale."
            >
              {vueContinue ? '▦ Vue continue : activée' : '▦ Vue continue'}
            </button>
            <button
              type="button"
              onClick={annuler}
              disabled={historique.length === 0}
              style={{
                padding: '4px 10px', fontSize: 12, borderRadius: 'var(--radius-md)',
                cursor: historique.length ? 'pointer' : 'default', border: '0.5px solid var(--color-border)',
                background: 'var(--color-bg)',
                color: historique.length ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
                opacity: historique.length ? 1 : 0.5,
              }}
              title="Annuler la dernière modification (échange, override, proposition, amélioration…). Cliquez plusieurs fois pour remonter pas à pas."
            >
              ↩ Retour en arrière{historique.length ? ` (${historique.length})` : ''}
            </button>
            <button
              type="button"
              onClick={effacerTout}
              disabled={!aDesAffectations}
              style={{
                padding: '4px 10px', fontSize: 12, borderRadius: 'var(--radius-md)',
                cursor: aDesAffectations ? 'pointer' : 'default', border: '0.5px solid var(--color-danger)',
                background: 'var(--color-bg)', color: 'var(--color-danger)', opacity: aDesAffectations ? 1 : 0.5,
              }}
              title="Efface toutes les affectations En semaine (proposition automatique + ajustements) pour repartir de zéro. Les trames choisies sont conservées. Annulable."
            >
              🗑 Effacer tout
            </button>
            {vueContinue && (
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                ⇄ Cliquez deux en-têtes d'associés d'une même semaine pour les échanger.
                {selEchange && (
                  <>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Sélection : {selEchange.ini} (S{selEchange.num})</span>
                    <button type="button" onClick={() => setSelEchange(null)} style={{ ...s.lienApercu, color: 'var(--color-danger)' }}>Annuler la sélection</button>
                  </>
                )}
              </span>
            )}
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
              // ≥ 2 vacanciers : ne proposer que les trames à capacité suffisante (+ la trame courante).
              const vReq = a.vacanciers.length
              const tramesOptions = trames.filter(t => vReq < 2 || capaciteVacances(t) >= vReq || t.id === effectiveId)
              const nbMasquees = trames.length - tramesOptions.length
              // Badges pertinents (à arbitrer / à surveiller) — réutilisés en vue normale ET en vue continue.
              const badgesEl = (
                <>
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
                </>
              )
              return (
                <div key={sem.num} style={vueContinue ? s.ligneCompact(categorieSem(sem.num)) : s.ligne(categorieSem(sem.num))}>
                  {vueContinue && (
                    <div style={{ ...s.labelCompact(categorieSem(sem.num)), display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>S{sem.num} · {formatJJMM(sem.lundi)} → {formatJJMM(sem.dimanche)}{trame ? ` · ${trame.nom}` : ' · Aucune trame'}</span>
                      {badgesEl}
                    </div>
                  )}
                  {!vueContinue && (<>
                  <div style={s.haut}>
                    <div
                      style={{ ...s.bandeauCliquable, cursor: trame ? 'pointer' : 'default' }}
                      onClick={trame ? () => toggleApercu(sem.num) : undefined}
                      title={trame ? 'Cliquer pour voir/masquer l’aperçu de la semaine' : undefined}
                    >
                      <span style={s.libSemaine}>
                        S{sem.num} · {formatJJMM(sem.lundi)} → {formatJJMM(sem.dimanche)}
                      </span>
                      <span style={s.badges}>{badgesEl}</span>
                    </div>
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
                  </>)}
                  {(ouvert || vueContinue) && trame && (
                    <div style={vueContinue ? { overflowX: 'auto' } : s.apercu}>
                      <ApercuSemaine
                        annee={annee}
                        sem={sem}
                        calendrier={calendrier}
                        affectationsSemaine={affectationsSemaine}
                        weekendAff={contexteAmont.weekendAff}
                        reaAff={effectifs.rea}
                        congesParSemaine={effectifs.vacanciers}
                        recupParSemaine={recup.parSemaine}
                        compteurs={compteurs}
                        remplacantsSemaine={remplacantsSemaine}
                        nbRemplForce={nbRemplMax}
                        compact={vueContinue}
                        onSelectColonne={vueContinue ? (ini) => clicEnteteColonne(sem.num, ini) : undefined}
                        iniSelectionne={vueContinue && selEchange?.num === sem.num ? selEchange.ini : null}
                      />
                      {!vueContinue && (<>
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
                      </>)}
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
