import { useState, useEffect, useMemo, Fragment } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES, semainesDansPlage, formatJJMM, moisAnneeFR, numeroSemaineISO, parseISO, premiereSemainePlanning } from '../utils/calendrier'
import { ANNEE_DEFAUT, normaliser } from '../utils/desiderata'
import { ASSOCIES } from '../data/associes'
import { listerRecueils, chargerTousDesiderata, chargerProfilsAvecInitiales, idRecueilPlusRecent } from '../utils/desiderataApi'
import { chargerCalendrier } from '../utils/calendrierApi'
import { chargerObjectifs } from '../utils/objectifsApi'
import { chargerCompteursRef } from '../utils/compteursRefApi'
import { chargerWeekends } from '../utils/weekendsApi'
import { chargerVacances } from '../utils/vacancesApi'
import { chargerRea, sauverRea } from '../utils/reaApi'
import { proposerRea, analyserRea } from '../utils/rea'
import { exporterCalendrierExcel } from '../utils/exportCalendrier'
import { compteursAmont } from '../utils/grilleSemaine'
import PanneauConflits from '../components/planning/PanneauConflits'
import BoutonVerrou from '../components/planning/BoutonVerrou'

const JOUR_MS = 24 * 60 * 60 * 1000

export default function PlanningRea({ annee: anneeProp, onChangeAnnee, onStatut, onRegisterSave } = {}) {
  const { session, profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [anneeInterne, setAnneeInterne] = useState(ANNEE_DEFAUT)
  const annee = anneeProp ?? anneeInterne
  const setAnnee = onChangeAnnee ?? setAnneeInterne

  const [recueils, setRecueils] = useState([])
  const [recueilId, setRecueilId] = useState(null)
  const [profils, setProfils] = useState([])
  const [desideratas, setDesideratas] = useState([])
  const [calendrier, setCalendrier] = useState(null)
  const [objectifs, setObjectifs] = useState(null)
  const [compteursRef, setCompteursRef] = useState(null) // socle « déjà réalisé » (parties faites dans Excel)
  const [weekends, setWeekends] = useState(null)
  const [vacancesData, setVacancesData] = useState(null)
  const [data, setData] = useState(null)        // { v, rea: { num: ini } } (toute l'année)
  const [erreur, setErreur] = useState(null)
  const [enregistre, setEnregistre] = useState(false)
  const [exportEnCours, setExportEnCours] = useState(false)

  // Recueils « normaux » + profils.
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    Promise.all([listerRecueils(annee), chargerProfilsAvecInitiales()])
      .then(([rs, ps]) => {
        if (annule) return
        const normaux = rs.filter(r => r.type !== 'ete')
        setRecueils(normaux)
        setRecueilId(prev => (normaux.some(r => r.id === prev) ? prev : idRecueilPlusRecent(normaux)))
        setProfils(ps)
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger les recueils.') })
    return () => { annule = true }
  }, [annee, estFaiseur])

  // Calendrier + objectifs + week-ends + vacances (export) + réa.
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    Promise.all([chargerCalendrier(annee), chargerObjectifs(annee), chargerWeekends(annee), chargerVacances(annee), chargerRea(annee), chargerCompteursRef(annee)])
      .then(([cal, obj, we, vac, reaData, cref]) => {
        if (annule) return
        // Vacances = poste exclusif (absolu) : on écarte toute réa tombant sur une semaine
        // de congé de l'associé (purge des conflits résiduels au chargement).
        const vacs = vac?.vacances ?? {}
        const reaPur = {}
        for (const [num, ini] of Object.entries(reaData.rea ?? {})) {
          if (!vacs[Number(num)]?.includes(ini)) reaPur[Number(num)] = ini
        }
        setCalendrier(cal); setObjectifs(obj); setWeekends(we); setVacancesData(vac); setCompteursRef(cref)
        setData({ ...reaData, rea: reaPur }); onStatut?.('vierge')
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger les données de planning.') })
    return () => { annule = true }
  }, [annee, estFaiseur, onStatut])

  // Desiderata du recueil sélectionné.
  useEffect(() => {
    if (!estFaiseur || !recueilId) return
    let annule = false
    chargerTousDesiderata(recueilId)
      .then(rows => { if (!annule) setDesideratas(rows) })
      .catch(() => { if (!annule) setErreur('Impossible de charger les desiderata du recueil.') })
    return () => { annule = true }
  }, [recueilId, estFaiseur])

  const recueil = useMemo(() => recueils.find(r => r.id === recueilId) ?? null, [recueils, recueilId])

  // Jours off demandés par associé → semaines ISO concernées : { ini: Set(nums) }.
  const joursOffParAssocie = useMemo(() => {
    const parUser = {}
    for (const p of profils) parUser[p.id] = p.initiales
    const map = {}
    for (const row of desideratas) {
      const ini = parUser[row.user_id]
      if (!ini) continue
      const set = new Set()
      for (const iso of (normaliser(row.data).joursOffSouhaites ?? [])) {
        try { set.add(numeroSemaineISO(parseISO(iso))) } catch { /* date invalide ignorée */ }
      }
      map[ini] = set
    }
    return map
  }, [desideratas, profils])

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

  const weekendAff = useMemo(() => weekends?.affectations ?? {}, [weekends])
  const vacancesParSemaine = useMemo(() => vacancesData?.vacances ?? {}, [vacancesData])
  const scolairesSet = useMemo(() => new Set(calendrier?.vacancesScolaires ?? []), [calendrier])
  const rea = useMemo(() => data?.rea ?? {}, [data])
  const verrous = useMemo(() => new Set(data?.verrous ?? []), [data])

  const objectifRea = useMemo(() => {
    const m = {}
    for (const ini of ASSOCIES) { const v = objectifs?.valeurs?.[ini]?.rea; if (v != null) m[ini] = v }
    return m
  }, [objectifs])

  // Semaines de réa DÉJÀ réalisées par associé (Compteurs de référence), socle du plafond dur. Map vide tant
  // qu'aucune référence n'est enregistrée → repli sur le décompte hors-plage habituel.
  const dejaFaitRea = useMemo(() => {
    const m = {}
    if (!compteursRef?.importeLe) return m
    for (const ini of ASSOCIES) m[ini] = compteursRef?.compteurs?.[ini]?.rea ?? 0
    return m
  }, [compteursRef])

  // Bilan « Réalisé à ce stade » pour l'export Excel : à l'étape Réa, seuls G week-end, Réa et
  // Semaines de vacances sont connus ; A/G vendredi, gardes de semaine et récup JF (étape En semaine)
  // restent à 0 (colonnes conservées). Cumul annuel sur les données chargées.
  const bilanRea = useMemo(() => {
    const b = {}
    for (const ini of ASSOCIES) b[ini] = { gWeekend: 0, aVendredi: 0, gVendredi: 0, rea: 0, gardeSemaine: 0, vacances: 0, recupJF: 0 }
    for (const ini of Object.values(weekendAff)) if (b[ini]) b[ini].gWeekend++
    for (const ini of Object.values(rea)) if (b[ini]) b[ini].rea++
    for (const arr of Object.values(vacancesParSemaine)) for (const ini of (arr ?? [])) if (b[ini]) b[ini].vacances++
    return b
  }, [weekendAff, rea, vacancesParSemaine])

  // Le planning commence après les vacances de Noël : S1 (et bloc scolaire de tête) jamais incluse.
  const debutPlanning = useMemo(() => premiereSemainePlanning(calendrier?.vacancesScolaires ?? []), [calendrier])
  const semaines = useMemo(
    () => (recueil ? semainesDansPlage(annee, Math.max(recueil.semaine_debut, debutPlanning), recueil.semaine_fin) : []),
    [annee, recueil, debutPlanning]
  )

  const analyses = useMemo(() => {
    const m = {}
    for (const s of semaines) m[s.num] = analyserRea(s.num, rea[s.num], joursOffParAssocie, weekendAff, vacancesParSemaine, colonnesSouhaiteesParAssocie)
    return m
  }, [semaines, rea, joursOffParAssocie, weekendAff, vacancesParSemaine, colonnesSouhaiteesParAssocie])

  // À arbitrer : uniquement les semaines où AUCUN associé n'est plaçable sans contrainte
  // (les desiderata d'une seule personne ne sont pas des « conflits » — cf. PLANNING.md §13).
  const conflits = useMemo(() => {
    const out = []
    const lib = (sem) => `S${sem.num} (${formatJJMM(sem.lundi)}→${formatJJMM(sem.dimanche)})`
    for (const sem of semaines) {
      if (rea[sem.num]) continue
      const dispo = ASSOCIES.filter(x =>
        !vacancesParSemaine[sem.num]?.includes(x) && !joursOffParAssocie[x]?.has(sem.num) &&
        weekendAff[sem.num] !== x && weekendAff[sem.num - 1] !== x)
      if (dispo.length === 0) {
        out.push({ severite: 'amber', semaine: sem.num, message: `${lib(sem)} — réa non attribuable : aucun associé sans contrainte (tous en vacances / jour off / week-end de garde). Arbitrage : forcer un associé malgré une contrainte.` })
      }
    }
    return out
  }, [semaines, rea, vacancesParSemaine, joursOffParAssocie, weekendAff])

  const recap = useMemo(() => {
    let attribuees = 0, vac = 0, off = 0, garde = 0
    for (const s of semaines) {
      if (rea[s.num]) attribuees++
      const a = analyses[s.num]
      if (a?.vacances) vac++
      if (a?.jourOff) off++
      if (a?.garde) garde++
    }
    return { total: semaines.length, attribuees, vac, off, garde }
  }, [semaines, rea, analyses])

  const compteParAssocie = useMemo(() => {
    const m = {}
    for (const ini of ASSOCIES) m[ini] = 0
    for (const s of semaines) { const ini = rea[s.num]; if (ini && m[ini] != null) m[ini]++ }
    return m
  }, [semaines, rea])

  // Placer un associé à la main VERROUILLE la semaine de réa (forcée) ; « — » la remet en automatique.
  function majRea(num, ini) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const r = { ...prev.rea }
      const ver = new Set(prev.verrous ?? [])
      if (ini) { r[num] = ini; ver.add(num) }
      else { delete r[num]; ver.delete(num) }
      return { ...prev, rea: r, verrous: [...ver] }
    })
  }

  function basculerVerrou(num) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      if (!prev.rea[num]) return prev
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
      // Fixes = réa hors plage + semaines verrouillées (préservées, comptées dans l'équilibrage).
      const fixes = {}
      for (const [num, ini] of Object.entries(prev.rea)) {
        const n = Number(num)
        if (n < debut || n > fin || ver.has(n)) fixes[n] = ini
      }
      const aProposer = semaines.filter(s => !(ver.has(s.num) && prev.rea[s.num]))
      const proposees = proposerRea(aProposer, joursOffParAssocie, weekendAff, objectifRea, fixes, vacancesParSemaine, colonnesSouhaiteesParAssocie, dejaFaitRea)
      return { ...prev, rea: { ...fixes, ...proposees } }
    })
  }

  async function enregistrer() {
    setErreur(null)
    try {
      await sauverRea(annee, data, session.user.id)
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

  async function exporter() {
    setErreur(null); setExportEnCours(true)
    try {
      // Étape 5 : base calendrier + objectifs + week-ends + vacances + réa (incrémental), borné à la période du recueil.
      // + tableau « Réalisé à ce stade » en bas (10ᵉ argument) : G week-end / Réa / vacances remplis, le reste à 0.
      // 13ᵉ arg = compteurs cumulés (n° de week-end, vacances et réa année-à-date dans chaque case).
      await exporterCalendrierExcel(
        annee, calendrier, objectifs, weekends?.affectations, vacancesData?.vacances, data.rea,
        recueil ? { debut: recueil.semaine_debut, fin: recueil.semaine_fin } : null,
        null, null, bilanRea, null, null,
        compteursAmont(annee, { weekendAff: weekends?.affectations, vacanciers: vacancesData?.vacances, reaAff: data.rea }),
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
    ligne: {
      display: 'grid', gridTemplateColumns: '200px 110px 150px 160px',
      gap: 8, alignItems: 'center', padding: '5px 0',
    },
    entete: { fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 600 },
    selRea: (alerte) => ({
      padding: '6px 8px', fontSize: 13, borderRadius: 'var(--radius-md)',
      border: `0.5px solid ${alerte === 'rouge' ? 'var(--color-danger)' : alerte === 'orange' ? 'var(--color-amber)' : 'var(--color-border)'}`,
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', width: '100%',
    }),
    moisSep: {
      fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)',
      padding: '12px 0 4px', marginTop: 4, borderTop: '0.5px solid var(--color-border)',
    },
    etat: (couleur) => ({ fontSize: 12, color: couleur, display: 'inline-flex', alignItems: 'center', gap: 4 }),
    compteurs: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 },
    chip: { fontSize: 12, padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-border)', background: 'var(--color-surface)' },
  }

  if (!estFaiseur) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Réanimation</h1>
        <div style={{ ...s.carte, color: 'var(--color-text-secondary)', fontSize: 14, padding: 24 }}>
          Cette page est réservée au faiseur de planning.
        </div>
      </div>
    )
  }

  const pret = data !== null && calendrier !== null

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Réanimation {annee}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        Un associé en réa par semaine, réparti pour équilibrer le total entre tous. Choisissez une
        période, laissez l'outil <strong>proposer</strong> puis ajustez : il vous alerte si la réa
        tombe sur un jour off demandé, ou si elle précède un week-end de garde du même associé
        (à éviter sauf exception). Vous gardez le dernier mot.
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
            title="Génère un fichier Excel : base calendrier + objectifs + week-ends + vacances + réa"
          >
            {exportEnCours ? 'Export…' : '⬇ Exporter en Excel'}
          </button>
          {enregistre && <span style={{ fontSize: 13, color: 'var(--color-success)', alignSelf: 'center' }}>Enregistré ✓</span>}
        </div>
      </div>

      {recueils.length > 1 && recueilId != null && idRecueilPlusRecent(recueils) === recueilId
        && Object.keys(objectifRea).length > 0 && !compteursRef?.importeLe && (
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
          Compteurs de référence non saisis — le calage sur l'objectif part de 0. Renseignez-les dans « Ouverture du planning » pour respecter l'objectif annuel sur cette période.
        </div>
      )}

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          {erreur}
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
          <PanneauConflits conflits={conflits} />

          {/* Récap */}
          <div style={{ fontSize: 13, marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>{recap.attribuees}/{recap.total} semaines attribuées</span>
            <span style={{ color: recap.vac ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>🔴 {recap.vac} en vacances</span>
            <span style={{ color: recap.off ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>🔴 {recap.off} jour off</span>
            <span style={{ color: recap.garde ? 'var(--color-amber)' : 'var(--color-text-tertiary)' }}>🟠 {recap.garde} week-end de garde collé</span>
          </div>

          {/* Compteurs par associé */}
          <div style={s.compteurs}>
            {ASSOCIES.map(ini => (
              <span key={ini} style={s.chip}>
                <strong>{ini}</strong> : {compteParAssocie[ini]}
                {objectifRea[ini] != null && <span style={{ color: 'var(--color-text-tertiary)' }}> / {objectifRea[ini]}</span>}
              </span>
            ))}
          </div>

          {/* Tableau des semaines */}
          <div style={s.carte}>
            <div style={{ ...s.ligne, borderBottom: '0.5px solid var(--color-border)', paddingBottom: 6, marginBottom: 4 }}>
              <span style={s.entete}>Semaine</span>
              <span style={s.entete}>État</span>
              <span style={s.entete}>Dispo</span>
              <span style={s.entete}>Réa</span>
            </div>
            {semaines.map((sem, idx) => {
              const jeudi = new Date(sem.lundi.getTime() + 3 * JOUR_MS)
              const moisPrec = idx > 0 ? new Date(semaines[idx - 1].lundi.getTime() + 3 * JOUR_MS).getUTCMonth() : null
              const sep = idx === 0 || jeudi.getUTCMonth() !== moisPrec
              const ini = rea[sem.num] ?? ''
              const verrou = verrous.has(sem.num)
              const a = analyses[sem.num]
              const alerte = (a?.vacances || a?.jourOff) ? 'rouge' : (a?.garde || a?.souhaitColonne != null ? 'orange' : null)
              const dispo = ASSOCIES.filter(x =>
                !vacancesParSemaine[sem.num]?.includes(x) &&
                !joursOffParAssocie[x]?.has(sem.num) &&
                weekendAff[sem.num] !== x && weekendAff[sem.num - 1] !== x
              )
              return (
                <Fragment key={sem.num}>
                  {sep && <div style={s.moisSep}>{moisAnneeFR(jeudi)}</div>}
                  <div style={s.ligne}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      S{sem.num} · {formatJJMM(sem.lundi)} → {formatJJMM(sem.dimanche)}
                      {scolairesSet.has(sem.num) && <span style={{ color: '#2D6CB5' }}> · scol.</span>}
                    </span>
                    <span>
                      {!ini ? (
                        <span style={s.etat('var(--color-text-tertiary)')}>—</span>
                      ) : a.vacances ? (
                        <span style={s.etat('var(--color-danger)')} title="Cet associé est en vacances cette semaine (poste exclusif)">🔴 vacances</span>
                      ) : a.jourOff ? (
                        <span style={s.etat('var(--color-danger)')} title="La réa tombe sur un jour off demandé par cet associé">🔴 jour off</span>
                      ) : a.garde ? (
                        <span style={s.etat('var(--color-amber)')} title="Réa accolée à un week-end de garde du même associé (repos du lendemain, §5 — éviter sauf exception)">🟠 WE garde</span>
                      ) : a.souhaitColonne != null ? (
                        <span style={s.etat('var(--color-amber)')} title={`Cet associé a souhaité la colonne C${a.souhaitColonne + 1} (travailler) cette semaine`}>🟠 colonne</span>
                      ) : (
                        <span style={s.etat('var(--color-success)')}>✓</span>
                      )}
                    </span>
                    <span
                      style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}
                      title={`${dispo.length}/${ASSOCIES.length} disponibles (hors vacances, jour off, week-end de garde)`}
                    >
                      {dispo.length ? dispo.join(' · ') : 'aucun'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <select
                        value={ini}
                        onChange={e => majRea(sem.num, e.target.value)}
                        style={{ ...s.selRea(alerte), flex: 1, ...(verrou ? { borderColor: 'var(--color-primary)', borderWidth: 1 } : {}) }}
                        title={verrou ? 'Forcé (verrouillé) — non modifié par « Proposer »' : undefined}
                      >
                        <option value="">—</option>
                        {ASSOCIES.map(x => {
                          const vac = vacancesParSemaine[sem.num]?.includes(x)
                          const off = joursOffParAssocie[x]?.has(sem.num)
                          const garde = weekendAff[sem.num] === x || weekendAff[sem.num - 1] === x
                          const marque = vac ? ' ⚠ vacances' : off ? ' ⚠ jour off' : garde ? ' ⚠ WE garde' : ''
                          // Vacances = poste exclusif : option bloquée (on ne peut pas recréer le conflit).
                          return <option key={x} value={x} disabled={vac}>{x}{marque}</option>
                        })}
                      </select>
                      {ini && <BoutonVerrou verrouille={verrou} onToggle={() => basculerVerrou(sem.num)} />}
                    </span>
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
