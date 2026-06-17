import { useState, useEffect, useMemo, Fragment } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES, weekendsDansPlage, formatJJMM, moisAnneeFR, numeroSemaineISO, parseISO, listerSemaines } from '../utils/calendrier'
import { ANNEE_DEFAUT, normaliser } from '../utils/desiderata'
import { ASSOCIES } from '../data/associes'
import { listerRecueils, chargerTousDesiderata, chargerProfilsAvecInitiales, definirStatutRecueil } from '../utils/desiderataApi'
import { chargerCalendrier, sauverCalendrier } from '../utils/calendrierApi'
import { chargerObjectifs } from '../utils/objectifsApi'
import { chargerWeekends, sauverWeekends } from '../utils/weekendsApi'
import { chargerVacances } from '../utils/vacancesApi'
import { chargerTrames } from '../utils/tramesApi'
import { chargerNoel } from '../utils/noelApi'
import { weekendsGardeNoel } from '../utils/noel'
import { JOURS } from '../utils/trames'
import { proposerWeekends, analyserAffectation, impactJourOffWE, ESPACEMENT_MIN } from '../utils/weekends'
import { detecterPontsTous, detecterPontsWeekendTous, weekendsAccolesFerie, cleEcart, cleEcartWeekend } from '../utils/ponts'
import { exporterCalendrierExcel } from '../utils/exportCalendrier'
import PanneauConflits from '../components/planning/PanneauConflits'
import PanneauPonts from '../components/planning/PanneauPonts'
import BoutonVerrou from '../components/planning/BoutonVerrou'

// getUTCDay() → clé de jour de semaine (lun→ven) ; samedi/dimanche ignorés ici.
const JOUR_SEMAINE = { 1: 'lun', 2: 'mar', 3: 'mer', 4: 'jeu', 5: 'ven' }

const COULEUR = {
  A: { bg: 'var(--color-amber-light)', fg: 'var(--color-amber)' }, // astreinte = orange
  G: { bg: '#FBF3D0', fg: '#9A7B0A' },                             // garde = jaune
}

export default function PlanningWeekends({ annee: anneeProp, onChangeAnnee, onStatut } = {}) {
  const { session, profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [anneeInterne, setAnneeInterne] = useState(ANNEE_DEFAUT)
  const annee = anneeProp ?? anneeInterne
  const setAnnee = onChangeAnnee ?? setAnneeInterne

  const [recueils, setRecueils] = useState([])
  const [recueilId, setRecueilId] = useState(null)
  const [profils, setProfils] = useState([])
  const [desideratas, setDesideratas] = useState([]) // lignes brutes du recueil sélectionné
  const [calendrier, setCalendrier] = useState(null)
  const [objectifs, setObjectifs] = useState(null)
  const [vacancesData, setVacancesData] = useState(null) // { v, vacances: { num: [ini] } }
  const [tramesData, setTramesData] = useState(null)     // { v, principaleId, trames: [...] }
  const [noelData, setNoelData] = useState(null)         // grille de Noël (week-ends de garde imposés)
  const [data, setData] = useState(null)        // { v, affectations: { num: ini } } (toute l'année)
  const [erreur, setErreur] = useState(null)
  const [enregistre, setEnregistre] = useState(false)
  const [exportEnCours, setExportEnCours] = useState(false)
  const [blocage, setBlocage] = useState(null)

  // Recueils (périodes) « normales » de l'année + profils.
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    Promise.all([listerRecueils(annee), chargerProfilsAvecInitiales()])
      .then(([rs, ps]) => {
        if (annule) return
        const normaux = rs.filter(r => r.type !== 'ete')
        setRecueils(normaux)
        setRecueilId(prev => (normaux.some(r => r.id === prev) ? prev : (normaux[0]?.id ?? null)))
        setProfils(ps)
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger les recueils.') })
    return () => { annule = true }
  }, [annee, estFaiseur])

  // Base calendrier + objectifs + affectations week-end (par année).
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    Promise.all([chargerCalendrier(annee), chargerObjectifs(annee), chargerWeekends(annee), chargerVacances(annee), chargerTrames(annee), chargerNoel(annee)])
      .then(([cal, obj, we, vac, tr, noel]) => {
        if (annule) return
        setCalendrier(cal); setObjectifs(obj); setData(we); setVacancesData(vac); setTramesData(tr); setNoelData(noel); onStatut?.('vierge')
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger les données de planning.') })
    return () => { annule = true }
  }, [annee, estFaiseur, onStatut])

  // Desiderata du recueil sélectionné (lignes brutes ; on en dérive les indisponibilités).
  useEffect(() => {
    if (!estFaiseur || !recueilId) return
    let annule = false
    chargerTousDesiderata(recueilId)
      .then(rows => { if (!annule) setDesideratas(rows) })
      .catch(() => { if (!annule) setErreur('Impossible de charger les desiderata du recueil.') })
    return () => { annule = true }
  }, [recueilId, estFaiseur])

  const recueil = useMemo(() => recueils.find(r => r.id === recueilId) ?? null, [recueils, recueilId])

  // Jours off de pont écartés par le faiseur : Set('INI|YYYY-MM-DD') (base calendrier).
  const ecartesSet = useMemo(() => new Set(calendrier?.pontsEcartes ?? []), [calendrier])

  // Écarter / réintégrer un élément (pont, indispo week-end…) — persisté dans la base calendrier.
  // Source unique partagée avec « Ouverture du planning » : ce qui est écarté ici l'est partout.
  async function toggleEcart(cle) {
    if (!calendrier) return
    const actuel = calendrier.pontsEcartes ?? []
    const nouveau = actuel.includes(cle) ? actuel.filter(c => c !== cle) : [...actuel, cle]
    const maj = { ...calendrier, pontsEcartes: nouveau }
    const precedent = calendrier
    setCalendrier(maj) // optimiste
    try {
      await sauverCalendrier(annee, maj, session.user.id)
    } catch {
      setCalendrier(precedent)
      setErreur('Écartement impossible (réservé au faiseur).')
    }
  }

  // Jours off COMPLETS par associé : { ini: ['YYYY-MM-DD', …] } (avant écartement).
  const joursOffParAssocie = useMemo(() => {
    const parUser = {}
    for (const p of profils) parUser[p.id] = p.initiales
    const map = {}
    for (const row of desideratas) {
      const ini = parUser[row.user_id]
      if (!ini) continue
      map[ini] = normaliser(row.data).joursOffSouhaites ?? []
    }
    return map
  }, [desideratas, profils])

  // Détection des ponts (sur les jours off complets, pour montrer aussi les écartés).
  const pontsParAssocie = useMemo(() => detecterPontsTous(joursOffParAssocie, annee), [joursOffParAssocie, annee])

  // Indispos week-end COMPLÈTES par associé : { ini: [numsSemaine] } (avant écartement).
  const weekendsIndispoParAssocie = useMemo(() => {
    const parUser = {}
    for (const p of profils) parUser[p.id] = p.initiales
    const map = {}
    for (const row of desideratas) {
      const ini = parUser[row.user_id]
      if (!ini) continue
      map[ini] = normaliser(row.data).weekendsIndispo ?? []
    }
    return map
  }, [desideratas, profils])

  // Ponts « week-end » (indispo accolée à un férié vendredi/lundi) — complets, pour l'encart.
  const pontsWeekendParAssocie = useMemo(() => detecterPontsWeekendTous(weekendsIndispoParAssocie, annee), [weekendsIndispoParAssocie, annee])

  // Week-ends accolés à un férié vendredi/lundi (fait calendaire) → badge sur la ligne.
  const accolesFerie = useMemo(() => weekendsAccolesFerie(annee), [annee])

  // Jours off EFFECTIFS : on retire les jours off de pont écartés par le faiseur.
  // Ces jours-là ne sont plus traités comme indisponibilités par l'attribution.
  const joursOffEffectifsParAssocie = useMemo(() => {
    const map = {}
    for (const [ini, isos] of Object.entries(joursOffParAssocie)) {
      map[ini] = isos.filter(iso => !ecartesSet.has(cleEcart(ini, iso)))
    }
    return map
  }, [joursOffParAssocie, ecartesSet])

  // Indisponibilités week-end EFFECTIVES par associé : { ini: Set(numsSemaine) }.
  // On retire les week-ends de pont écartés par le faiseur (clé "INI|WE|<semaine>") : seuls
  // des week-ends de pont peuvent l'être, donc une indispo ordinaire reste toujours respectée.
  const indispoParAssocie = useMemo(() => {
    const map = {}
    for (const [ini, semaines] of Object.entries(weekendsIndispoParAssocie)) {
      map[ini] = new Set(semaines.filter(S => !ecartesSet.has(cleEcartWeekend(ini, S))))
    }
    return map
  }, [weekendsIndispoParAssocie, ecartesSet])

  // Jours off posés un samedi/dimanche → week-end (semaine ISO) concerné : { ini: Set(nums) }.
  // Basé sur les jours off EFFECTIFS (ponts écartés exclus).
  const joursOffWeekendParAssocie = useMemo(() => {
    const map = {}
    for (const [ini, isos] of Object.entries(joursOffEffectifsParAssocie)) {
      const set = new Set()
      for (const iso of isos) {
        try {
          const d = parseISO(iso)
          const j = d.getUTCDay()
          if (j === 6 || j === 0) set.add(numeroSemaineISO(d)) // samedi ou dimanche
        } catch { /* date invalide ignorée */ }
      }
      map[ini] = set
    }
    return map
  }, [joursOffEffectifsParAssocie])

  // Souhaits de colonne par associé : { ini: { numSemaine: colIndex } } (trame principale).
  const colonnesSouhaiteesParAssocie = useMemo(() => {
    const parUser = {}
    for (const p of profils) parUser[p.id] = p.initiales
    const map = {}
    for (const row of desideratas) {
      const ini = parUser[row.user_id]
      if (!ini) continue
      map[ini] = normaliser(row.data).colonnesSouhaitees ?? {}
    }
    return map
  }, [desideratas, profils])

  // Jours off EN SEMAINE par associé et par semaine : { ini: { semaine: Set('lun'..'ven') } }.
  // Basé sur les jours off EFFECTIFS (ponts écartés exclus).
  const joursOffDetailParAssocie = useMemo(() => {
    const map = {}
    for (const [ini, isos] of Object.entries(joursOffEffectifsParAssocie)) {
      const parSem = {}
      for (const iso of isos) {
        try {
          const d = parseISO(iso)
          const jour = JOUR_SEMAINE[d.getUTCDay()]
          if (!jour) continue // samedi/dimanche → géré par joursOffWeekendParAssocie
          const sem = numeroSemaineISO(d)
          ;(parSem[sem] ??= new Set()).add(jour)
        } catch { /* date invalide ignorée */ }
      }
      map[ini] = parSem
    }
    return map
  }, [joursOffEffectifsParAssocie])

  // Trame principale → repos des colonnes avant-WE (semaine W) et après-WE (semaine W+1).
  const { avantReposJours, apresReposJours } = useMemo(() => {
    const tp = tramesData ? tramesData.trames.find(t => t.id === tramesData.principaleId) : null
    const repos = (idx) => {
      const col = (idx != null) ? tp?.colonnes?.[idx] : null
      return col ? new Set(JOURS.filter(j => !(col[j] ?? '').trim())) : null
    }
    return { avantReposJours: repos(tp?.avantWE), apresReposJours: repos(tp?.apresWE) }
  }, [tramesData])

  const weekends = useMemo(
    () => (recueil ? weekendsDansPlage(annee, recueil.semaine_debut, recueil.semaine_fin) : []),
    [annee, recueil]
  )

  const affectations = useMemo(() => data?.affectations ?? {}, [data])
  const verrous = useMemo(() => new Set(data?.verrous ?? []), [data])
  const vacancesParSemaine = useMemo(() => vacancesData?.vacances ?? {}, [vacancesData])

  // Week-ends de garde IMPOSÉS par la grille de Noël (notamment ceux qui encadrent les 15 jours),
  // restreints aux semaines de l'année en cours : { <numSemaine>: ini }. Source unique = grille de Noël
  // (non persistés ici) ; ils sont comptés dans l'équilibrage et affichés « imposés », jamais réattribués.
  const semainesAnnee = useMemo(() => new Set(listerSemaines(annee).map(s => s.num)), [annee])
  const weekendsNoel = useMemo(() => {
    const tout = weekendsGardeNoel(noelData)
    const m = {}
    for (const [num, ini] of Object.entries(tout)) if (semainesAnnee.has(Number(num))) m[Number(num)] = ini
    return m
  }, [noelData, semainesAnnee])

  // Objectif « G week-end » par associé (étape 2), si renseigné.
  const objectifGW = useMemo(() => {
    const m = {}
    for (const ini of ASSOCIES) {
      const v = objectifs?.valeurs?.[ini]?.g_weekend
      if (v != null) m[ini] = v
    }
    return m
  }, [objectifs])

  // Analyse des conflits sur la plage courante.
  const analyses = useMemo(() => {
    const m = {}
    for (const w of weekends) m[w.num] = analyserAffectation(w.num, affectations[w.num], affectations, indispoParAssocie, vacancesParSemaine, joursOffWeekendParAssocie, colonnesSouhaiteesParAssocie)
    return m
  }, [weekends, affectations, indispoParAssocie, vacancesParSemaine, joursOffWeekendParAssocie, colonnesSouhaiteesParAssocie])

  // À arbitrer : uniquement les week-ends où AUCUN associé n'est plaçable sans contrainte
  // (les desiderata d'une seule personne ne sont pas des « conflits » — cf. PLANNING.md §13).
  const conflits = useMemo(() => {
    const out = []
    const lib = (w) => `WE S${w.num} (${formatJJMM(w.samedi)}–${formatJJMM(w.dimanche)})`
    for (const w of weekends) {
      if (affectations[w.num] || weekendsNoel[w.num]) continue // imposé par Noël = attribué
      const dispo = ASSOCIES.filter(x => !indispoParAssocie[x]?.has(w.num) && !joursOffWeekendParAssocie[x]?.has(w.num))
      if (dispo.length === 0) {
        out.push({ severite: 'amber', semaine: w.num, message: `${lib(w)} — non attribuable : aucun associé sans contrainte (indisponible / jour off le week-end). Arbitrage : forcer un associé malgré une contrainte.` })
      }
    }
    return out
  }, [weekends, affectations, weekendsNoel, indispoParAssocie, joursOffWeekendParAssocie])

  const recap = useMemo(() => {
    let attribues = 0, indispo = 0, proches = 0, vac = 0
    for (const w of weekends) {
      if (affectations[w.num] || weekendsNoel[w.num]) attribues++
      const a = analyses[w.num]
      if (a?.indispo) indispo++
      if (a?.tropProche != null) proches++
      if (a?.vacancesCollee) vac++
    }
    return { total: weekends.length, attribues, indispo, proches, vac }
  }, [weekends, affectations, weekendsNoel, analyses])

  // Placer un associé à la main VERROUILLE le week-end (forcé) ; « — » le remet en automatique.
  function majAffectation(num, ini) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const aff = { ...prev.affectations }
      const ver = new Set(prev.verrous ?? [])
      if (ini) { aff[num] = ini; ver.add(num) }
      else { delete aff[num]; ver.delete(num) }
      return { ...prev, affectations: aff, verrous: [...ver] }
    })
  }

  function basculerVerrou(num) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      if (!prev.affectations[num]) return prev // rien à verrouiller sur une case vide
      const ver = new Set(prev.verrous ?? [])
      if (ver.has(num)) ver.delete(num); else ver.add(num)
      return { ...prev, verrous: [...ver] }
    })
  }

  function proposer() {
    if (!recueil) return
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const debut = recueil.semaine_debut, fin = recueil.semaine_fin
      const ver = new Set(prev.verrous ?? [])
      // Fixes = affectations hors plage + week-ends verrouillés (préservés, comptés dans l'équilibrage).
      const fixes = {}
      for (const [num, ini] of Object.entries(prev.affectations)) {
        const n = Number(num)
        if (n < debut || n > fin || ver.has(n)) fixes[n] = ini
      }
      // Les week-ends de garde imposés par Noël ne sont PAS réattribués ni persistés ici, mais comptent
      // dans l'équilibrage des autres (ajoutés au contexte hors-plage de proposerWeekends).
      const aProposer = weekends.filter(w => !(ver.has(w.num) && prev.affectations[w.num]) && !weekendsNoel[w.num])
      const proposees = proposerWeekends(aProposer, indispoParAssocie, objectifGW, { ...fixes, ...weekendsNoel }, vacancesParSemaine, joursOffWeekendParAssocie, colonnesSouhaiteesParAssocie, joursOffDetailParAssocie, avantReposJours, apresReposJours)
      return { ...prev, affectations: { ...fixes, ...proposees } }
    })
  }

  async function enregistrer() {
    setErreur(null)
    try {
      await sauverWeekends(annee, data, session.user.id)
      setEnregistre(true); onStatut?.('enregistre')
      setTimeout(() => setEnregistre(false), 3000)
    } catch {
      setErreur('Enregistrement impossible (réservé au faiseur).')
    }
  }

  // Bascule le blocage des desiderata de la période : « ouvert » ↔ « fermé ». Fermé → les associés ne
  // peuvent plus modifier leurs choix (UI + base, cf. trigger planning_archives.sql) ; re-clic → réouvre.
  async function basculerBlocage() {
    if (!recueil) return
    const versFerme = recueil.statut === 'ouvert'
    setErreur(null)
    try {
      await definirStatutRecueil(recueil.id, versFerme ? 'ferme' : 'ouvert')
      setRecueils(prev => prev.map(r => (r.id === recueil.id ? { ...r, statut: versFerme ? 'ferme' : 'ouvert' } : r)))
      setBlocage(versFerme
        ? 'Desiderata bloqués — les associés ne peuvent plus modifier leurs choix.'
        : 'Desiderata débloqués — les associés peuvent de nouveau modifier leurs choix.')
      setTimeout(() => setBlocage(null), 4000)
    } catch {
      setErreur(versFerme ? 'Blocage impossible (réservé au faiseur).' : 'Déblocage impossible (réservé au faiseur).')
    }
  }

  async function exporter() {
    setErreur(null); setExportEnCours(true)
    try {
      // Étape 3 : base calendrier + objectifs + week-ends (incrémental), borné à la période du recueil.
      await exporterCalendrierExcel(annee, calendrier, objectifs, data.affectations, null, null, recueil ? { debut: recueil.semaine_debut, fin: recueil.semaine_fin } : null)
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
    ligne: {
      display: 'grid', gridTemplateColumns: '200px 46px 46px 84px 150px 150px',
      gap: 8, alignItems: 'center', padding: '4px 0',
    },
    entete: { fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 600 },
    role: (statut) => ({
      height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 600, borderRadius: 6,
      background: COULEUR[statut].bg, color: COULEUR[statut].fg, border: `0.5px solid ${COULEUR[statut].fg}`,
    }),
    selWE: (alerte) => ({
      padding: '6px 8px', fontSize: 13, borderRadius: 'var(--radius-md)',
      border: `0.5px solid ${alerte === 'rouge' ? 'var(--color-danger)' : alerte === 'orange' ? 'var(--color-amber)' : 'var(--color-border)'}`,
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', width: '100%',
    }),
    moisSep: {
      fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)',
      padding: '12px 0 4px', marginTop: 4, borderTop: '0.5px solid var(--color-border)',
    },
    etat: (couleur) => ({ fontSize: 12, color: couleur, display: 'flex', alignItems: 'center', gap: 6 }),
  }

  if (!estFaiseur) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Week-ends</h1>
        <div style={{ ...s.carte, color: 'var(--color-text-secondary)', fontSize: 14, padding: 24 }}>
          Cette page est réservée au faiseur de planning.
        </div>
      </div>
    )
  }

  const pret = data !== null && calendrier !== null

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Week-ends {annee}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        Une personne assure chaque week-end (astreinte samedi + garde dimanche). Choisissez une
        période, laissez l'outil <strong>proposer</strong> puis ajustez : il vous alerte si un
        associé est indisponible (desiderata) ou si deux week-ends sont à moins de {ESPACEMENT_MIN} semaines.
        Vous gardez le dernier mot.
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
        <button type="button" onClick={proposer} disabled={!pret || !recueil} style={{ ...s.bouton, padding: '8px 14px', fontSize: 13, opacity: (!pret || !recueil) ? 0.5 : 1 }}>
          Proposer automatiquement
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button type="button" onClick={enregistrer} disabled={!pret} style={{ ...s.bouton, padding: '8px 14px', fontSize: 13, opacity: !pret ? 0.5 : 1 }}>
            Enregistrer
          </button>
          <button
            type="button"
            onClick={exporter}
            disabled={!pret || exportEnCours}
            style={{ ...s.bouton, padding: '8px 14px', fontSize: 13, background: 'transparent', color: 'var(--color-primary)', border: '0.5px solid var(--color-primary)', opacity: (!pret || exportEnCours) ? 0.6 : 1 }}
            title="Génère un fichier Excel : base calendrier + objectifs + week-ends"
          >
            {exportEnCours ? 'Export…' : '⬇ Exporter en Excel'}
          </button>
          {enregistre && <span style={{ fontSize: 13, color: 'var(--color-success)', alignSelf: 'center' }}>Enregistré ✓</span>}
        </div>
        <button
          type="button"
          onClick={basculerBlocage}
          disabled={!recueil}
          style={{
            ...s.bouton, padding: '8px 14px', fontSize: 13, border: '0.5px solid var(--color-amber)',
            background: recueil?.statut === 'ferme' ? 'var(--color-amber)' : 'transparent',
            color: recueil?.statut === 'ferme' ? '#fff' : 'var(--color-amber)',
            opacity: !recueil ? 0.6 : 1,
          }}
          title={recueil?.statut === 'ferme'
            ? 'Desiderata bloqués : cliquez pour rouvrir le recueil (les associés pourront de nouveau modifier leurs choix).'
            : 'Ferme le recueil de desiderata de cette période : les associés ne peuvent plus modifier leurs choix. Cliquez de nouveau pour rouvrir.'}
        >
          {recueil?.statut === 'ferme' ? '🔓 Débloquer les desiderata' : '🔒 Bloquer les desiderata'}
        </button>
        {blocage && <span style={{ fontSize: 13, color: 'var(--color-success)', alignSelf: 'center' }}>{blocage}</span>}
      </div>

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          {erreur}
        </div>
      )}

      {!recueil ? (
        <div style={{ ...s.carte, color: 'var(--color-text-secondary)', fontSize: 14, padding: 20 }}>
          Aucune période disponible. Créez un recueil « normal » dans <strong>Ouverture du planning</strong>
          {' '}(les recueils d'été sont exclus : les week-ends y sont gérés par colonnes).
        </div>
      ) : !pret ? (
        <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Chargement…</div>
      ) : (
        <>
          <PanneauPonts pontsParAssocie={pontsParAssocie} pontsWeekendParAssocie={pontsWeekendParAssocie} weekendsIndispoParAssocie={weekendsIndispoParAssocie} annee={annee} ecartesSet={ecartesSet} onToggle={toggleEcart} />

          <PanneauConflits conflits={conflits} />

          {/* Récap des conflits */}
          <div style={{ fontSize: 13, marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>{recap.attribues}/{recap.total} week-ends attribués</span>
            <span style={{ color: recap.indispo ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>🔴 {recap.indispo} indisponibilité(s)</span>
            <span style={{ color: recap.proches ? 'var(--color-amber)' : 'var(--color-text-tertiary)' }}>🟠 {recap.proches} trop rapproché(s)</span>
            <span style={{ color: recap.vac ? 'var(--color-amber)' : 'var(--color-text-tertiary)' }}>🟠 {recap.vac} vacances collée(s)</span>
          </div>

          {/* Tableau des week-ends */}
          <div style={s.carte}>
            <div style={{ ...s.ligne, borderBottom: '0.5px solid var(--color-border)', paddingBottom: 6, marginBottom: 4 }}>
              <span style={s.entete}>Week-end</span>
              <span style={{ ...s.entete, textAlign: 'center' }}>Sam</span>
              <span style={{ ...s.entete, textAlign: 'center' }}>Dim</span>
              <span style={s.entete}>État</span>
              <span style={s.entete}>Dispo</span>
              <span style={s.entete}>Associé</span>
            </div>
            {weekends.map((w, idx) => {
              const moisPrec = idx > 0 ? new Date(weekends[idx - 1].samedi).getUTCMonth() : null
              const mois = new Date(w.samedi).getUTCMonth()
              const sep = idx === 0 || mois !== moisPrec
              const roles = calendrier.semaines?.[w.num] ?? { sam: 'A', dim: 'G' }
              const impose = weekendsNoel[w.num] ?? null // week-end de garde imposé par Noël (lecture seule)
              const ini = affectations[w.num] ?? ''
              const verrou = verrous.has(w.num)
              const a = analyses[w.num]
              const impact = ini ? impactJourOffWE(w.num, ini, joursOffDetailParAssocie, avantReposJours, apresReposJours) : { bloque: false }
              const alerte = (a?.indispo || a?.jourOffWE) ? 'rouge' : (a?.tropProche != null || a?.vacancesCollee || a?.souhaitColonne != null || impact.bloque ? 'orange' : null)
              const dispo = ASSOCIES.filter(x => !indispoParAssocie[x]?.has(w.num) && !joursOffWeekendParAssocie[x]?.has(w.num))
              return (
                <Fragment key={w.num}>
                  {sep && <div style={s.moisSep}>{moisAnneeFR(w.samedi)}</div>}
                  <div style={s.ligne}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      WE S{w.num} · {formatJJMM(w.samedi)} – {formatJJMM(w.dimanche)}
                      {accolesFerie[w.num] && (
                        <span
                          style={{ marginLeft: 5, cursor: 'help' }}
                          title={`Week-end accolé au férié ${accolesFerie[w.num].map(f => `${f.nom} (${f.jour})`).join(', ')} — attention aux indisponibilités (pont)`}
                        >🌉</span>
                      )}
                    </span>
                    <div style={s.role(roles.sam)} title="Rôle du samedi (Étape 0)">{roles.sam}</div>
                    <div style={s.role(roles.dim)} title="Rôle du dimanche (Étape 0)">{roles.dim}</div>
                    <span>
                      {impose ? (
                        <span style={s.etat('var(--color-primary)')} title="Week-end de garde imposé par la grille de Noël (encadrant les 15 jours)">🎄 imposé</span>
                      ) : !ini ? (
                        <span style={s.etat('var(--color-text-tertiary)')}>—</span>
                      ) : a.indispo ? (
                        <span style={s.etat('var(--color-danger)')} title="Indisponible (desiderata)">🔴 indispo</span>
                      ) : a.jourOffWE ? (
                        <span style={s.etat('var(--color-danger)')} title="Jour off demandé le samedi ou le dimanche de ce week-end">🔴 jour off</span>
                      ) : a.vacancesCollee ? (
                        <span style={s.etat('var(--color-amber)')} title="Week-end de garde accolé à une semaine de vacances de cet associé">🟠 vac.</span>
                      ) : a.tropProche != null ? (
                        <span style={s.etat('var(--color-amber)')} title={`Moins de ${ESPACEMENT_MIN} semaines depuis le week-end S${a.tropProche}`}>🟠 &lt;{ESPACEMENT_MIN} sem</span>
                      ) : a.souhaitColonne != null ? (
                        <span style={s.etat('var(--color-amber)')} title={`Cet associé a souhaité la colonne C${a.souhaitColonne + 1} (travailler) cette semaine`}>🟠 colonne</span>
                      ) : impact.bloque ? (
                        <span style={s.etat('var(--color-amber)')} title="Ce week-end empêche un jour off demandé en semaine W ou W+1 : la colonne avant/après-WE ne repose pas ce jour-là">🟠 bloque jour off</span>
                      ) : (
                        <span style={s.etat('var(--color-success)')}>✓</span>
                      )}
                    </span>
                    {impose ? <span /> : (
                      <select
                        value=""
                        onChange={() => {}}
                        style={s.selWE(null)}
                        title="Associés disponibles ce week-end selon les desiderata (consultation)"
                      >
                        <option value="">{dispo.length}/{ASSOCIES.length} dispo</option>
                        {dispo.map(x => <option key={x} value={x}>{x}</option>)}
                      </select>
                    )}
                    {impose ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                        {impose}
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-primary)' }} title="Imposé par la grille de Noël — non réattribué, mais compté dans l'équilibrage">🎄 Noël</span>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <select
                          value={ini}
                          onChange={e => majAffectation(w.num, e.target.value)}
                          style={{ ...s.selWE(alerte), flex: 1, ...(verrou ? { borderColor: 'var(--color-primary)', borderWidth: 1 } : {}) }}
                          title={verrou ? 'Forcé (verrouillé) — non modifié par « Proposer »' : undefined}
                        >
                          <option value="">—</option>
                          {ASSOCIES.map(x => {
                            const ind = indispoParAssocie[x]?.has(w.num)
                            const offWE = joursOffWeekendParAssocie[x]?.has(w.num)
                            const marque = ind ? ' ⚠ indispo' : offWE ? ' ⚠ jour off' : ''
                            return <option key={x} value={x}>{x}{marque}</option>
                          })}
                        </select>
                        {ini && <BoutonVerrou verrouille={verrou} onToggle={() => basculerVerrou(w.num)} />}
                      </span>
                    )}
                  </div>
                </Fragment>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
