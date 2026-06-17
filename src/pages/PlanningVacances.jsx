import { useState, useEffect, useMemo, Fragment } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES, semainesDansPlage, formatJJMM, moisAnneeFR } from '../utils/calendrier'
import { ANNEE_DEFAUT, normaliser } from '../utils/desiderata'
import { ASSOCIES } from '../data/associes'
import { listerRecueils, chargerTousDesiderata, chargerProfilsAvecInitiales } from '../utils/desiderataApi'
import { chargerCalendrier, sauverCalendrier } from '../utils/calendrierApi'
import { chargerObjectifs } from '../utils/objectifsApi'
import { chargerWeekends } from '../utils/weekendsApi'
import { chargerVacances, sauverVacances } from '../utils/vacancesApi'
import { proposerVacances, analyserSemaine } from '../utils/vacances'
import { cleEcartVacances } from '../utils/ponts'
import { exporterCalendrierExcel } from '../utils/exportCalendrier'
import BoutonVerrou from '../components/planning/BoutonVerrou'
import PanneauVacances from '../components/planning/PanneauVacances'

const JOUR_MS = 24 * 60 * 60 * 1000

export default function PlanningVacances({ annee: anneeProp, onChangeAnnee, onStatut } = {}) {
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
  const [weekends, setWeekends] = useState(null)
  const [data, setData] = useState(null)        // { v, vacances: { num: [ini] } } (toute l'année)
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
        setRecueilId(prev => (normaux.some(r => r.id === prev) ? prev : (normaux[0]?.id ?? null)))
        setProfils(ps)
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger les recueils.') })
    return () => { annule = true }
  }, [annee, estFaiseur])

  // Base calendrier (semaines scolaires) + objectifs + week-ends (export) + vacances.
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    Promise.all([chargerCalendrier(annee), chargerObjectifs(annee), chargerWeekends(annee), chargerVacances(annee)])
      .then(([cal, obj, we, vac]) => {
        if (annule) return
        setCalendrier(cal); setObjectifs(obj); setWeekends(we); setData(vac); onStatut?.('vierge')
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

  // Souhaits de congé écartés par le faiseur (clé 'INI|VAC|<sem>') — base calendrier.
  const ecartesSet = useMemo(() => new Set(calendrier?.pontsEcartes ?? []), [calendrier])

  // Souhaits / refus par associé : { ini: Set(numsSemaine) }.
  // Les souhaits écartés par le faiseur sont retirés (non proposés, non comptés comme souhait).
  const { souhaitParAssocie, refusParAssocie } = useMemo(() => {
    const parUser = {}
    for (const p of profils) parUser[p.id] = p.initiales
    const souhait = {}, refus = {}
    for (const row of desideratas) {
      const ini = parUser[row.user_id]
      if (!ini) continue
      const d = normaliser(row.data)
      souhait[ini] = new Set((d.vacancesSouhaitees ?? []).filter(n => !ecartesSet.has(cleEcartVacances(ini, n))))
      refus[ini] = new Set(d.vacancesRefusees ?? [])
    }
    return { souhaitParAssocie: souhait, refusParAssocie: refus }
  }, [desideratas, profils, ecartesSet])

  // Desiderata complets (normalisés) par associé — pour le panneau récap des souhaits.
  const desiderataParAssocie = useMemo(() => {
    const parUser = {}
    for (const p of profils) parUser[p.id] = p.initiales
    const m = {}
    for (const row of desideratas) {
      const ini = parUser[row.user_id]
      if (ini) m[ini] = normaliser(row.data)
    }
    return m
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

  const scolairesSet = useMemo(() => new Set(calendrier?.vacancesScolaires ?? []), [calendrier])

  const semaines = useMemo(
    () => (recueil ? semainesDansPlage(annee, recueil.semaine_debut, recueil.semaine_fin) : []),
    [annee, recueil]
  )

  const vacances = useMemo(() => data?.vacances ?? {}, [data])
  const places = useMemo(() => data?.places ?? {}, [data])
  const verrous = useMemo(() => data?.verrous ?? {}, [data])

  const weekendAff = useMemo(() => weekends?.affectations ?? {}, [weekends])

  // Semaines de congé par associé (toute l'année, pour l'espacement souple) : { ini: [nums] }.
  const semainesVacancesParAssocie = useMemo(() => {
    const m = {}
    for (const [num, inis] of Object.entries(vacances)) {
      for (const i of (inis ?? [])) (m[i] ??= []).push(Number(num))
    }
    return m
  }, [vacances])

  const analyses = useMemo(() => {
    const m = {}
    for (const s of semaines) m[s.num] = analyserSemaine(s.num, vacances[s.num], refusParAssocie, scolairesSet.has(s.num), weekendAff, colonnesSouhaiteesParAssocie, semainesVacancesParAssocie)
    return m
  }, [semaines, vacances, refusParAssocie, scolairesSet, weekendAff, colonnesSouhaiteesParAssocie, semainesVacancesParAssocie])

  const recap = useMemo(() => {
    let couvertes = 0, sans = 0, refus = 0, sous = 0, garde = 0, rappr = 0
    for (const s of semaines) {
      const a = analyses[s.num]
      if ((vacances[s.num]?.length ?? 0) > 0) couvertes++
      if (a?.sansVacance) sans++
      if (a?.refus?.length) refus++
      if (a?.sousScolaire) sous++
      if (a?.gardeCollee?.length) garde++
      if (a?.rapprochees?.length) rappr++
    }
    return { total: semaines.length, couvertes, sans, refus, sous, garde, rappr }
  }, [semaines, vacances, analyses])

  const compteParAssocie = useMemo(() => {
    const m = {}
    for (const ini of ASSOCIES) m[ini] = 0
    for (const s of semaines) for (const ini of (vacances[s.num] ?? [])) if (m[ini] != null) m[ini]++
    return m
  }, [semaines, vacances])

  // Postes de vacances ouverts mais non encore pourvus (cases libres) sur la période.
  const postesOuverts = useMemo(() => {
    let n = 0
    for (const s of semaines) {
      const cap = places[s.num] ?? (scolairesSet.has(s.num) ? 2 : 1)
      n += Math.max(cap - (vacances[s.num]?.length ?? 0), 0)
    }
    return n
  }, [semaines, places, vacances, scolairesSet])

  // Placer un associé à la main le VERROUILLE (forcé) : « Proposer automatiquement » le préserve.
  function ajouter(num, ini) {
    if (!ini) return
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const actuels = prev.vacances[num] ?? []
      if (actuels.includes(ini)) return prev
      const v = { ...prev.vacances, [num]: [...actuels, ini].sort((a, b) => ASSOCIES.indexOf(a) - ASSOCIES.indexOf(b)) }
      const ver = { ...(prev.verrous ?? {}) }
      ver[num] = [...new Set([...(ver[num] ?? []), ini])]
      return { ...prev, vacances: v, verrous: ver }
    })
  }
  function basculerVerrou(num, ini) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      if (!prev.vacances[num]?.includes(ini)) return prev
      const ver = { ...(prev.verrous ?? {}) }
      const cur = ver[num] ?? []
      if (cur.includes(ini)) { const left = cur.filter(x => x !== ini); if (left.length) ver[num] = left; else delete ver[num] }
      else ver[num] = [...cur, ini]
      return { ...prev, verrous: ver }
    })
  }
  // Retirer un associé FERME le poste : la capacité baisse d'un cran (et c'est persisté), sinon
  // « Proposer automatiquement » repourvoirait aussitôt la case. Une suppression doit rester.
  function retirer(num, ini) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const avant = prev.vacances[num] ?? []
      const restants = avant.filter(x => x !== ini)
      const v = { ...prev.vacances }
      if (restants.length) v[num] = restants; else delete v[num]
      const defaut = scolairesSet.has(num) ? 2 : 1
      const capAvant = Math.max(prev.places?.[num] ?? defaut, avant.length)
      const cible = Math.max(capAvant - 1, 0)
      const p = { ...(prev.places ?? {}) }
      if (cible === defaut) delete p[num]; else p[num] = cible
      // Retirer lève aussi le verrou éventuel de cet associé.
      const ver = { ...(prev.verrous ?? {}) }
      if (ver[num]) { const left = ver[num].filter(x => x !== ini); if (left.length) ver[num] = left; else delete ver[num] }
      return { ...prev, vacances: v, places: p, verrous: ver }
    })
  }

  // ── Postes de vacances ouverts (capacité par semaine) ──
  // Défaut = couverture minimale (2 en vacances scolaires, 1 sinon). La capacité effective ne
  // descend jamais sous le nombre d'associés déjà placés.
  const defautCapacite = (num) => (scolairesSet.has(num) ? 2 : 1)
  const capacite = (num) => Math.max(places[num] ?? defautCapacite(num), vacances[num]?.length ?? 0)
  function majPlaces(num, n) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const p = { ...(prev.places ?? {}) }
      if (n === defautCapacite(num)) delete p[num] // retour au défaut → pas d'override stocké
      else p[num] = n
      return { ...prev, places: p }
    })
  }
  function ouvrirPoste(num) { majPlaces(num, capacite(num) + 1) }
  function fermerPoste(num) {
    const filled = vacances[num]?.length ?? 0 // on ne ferme que des postes vides (jamais sous les placés)
    if (capacite(num) > filled) majPlaces(num, capacite(num) - 1)
  }

  function proposer() {
    if (!recueil) return
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const debut = recueil.semaine_debut, fin = recueil.semaine_fin
      const horsPlage = {}
      for (const [num, inis] of Object.entries(prev.vacances)) {
        const n = Number(num)
        if (n < debut || n > fin) horsPlage[n] = inis
      }
      const proposees = proposerVacances(semaines, souhaitParAssocie, refusParAssocie, scolairesSet, horsPlage, weekendAff, colonnesSouhaiteesParAssocie, prev.places ?? {}, prev.verrous ?? {})
      return { ...prev, vacances: { ...horsPlage, ...proposees } }
    })
  }

  // Écarter / réactiver un souhait de congé hors scolaire — persisté dans la base calendrier
  // (clé 'INI|VAC|<sem>'), source partagée avec les autres écartements.
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
      setErreur('Action impossible (réservée au faiseur).')
    }
  }

  async function enregistrer() {
    setErreur(null)
    try {
      await sauverVacances(annee, data, session.user.id)
      setEnregistre(true); onStatut?.('enregistre')
      setTimeout(() => setEnregistre(false), 3000)
    } catch {
      setErreur('Enregistrement impossible (réservé au faiseur).')
    }
  }

  async function exporter() {
    setErreur(null); setExportEnCours(true)
    try {
      // Étape 4 : base calendrier + objectifs + week-ends + vacances (incrémental), borné à la période du recueil.
      await exporterCalendrierExcel(annee, calendrier, objectifs, weekends?.affectations, data.vacances, null, recueil ? { debut: recueil.semaine_debut, fin: recueil.semaine_fin } : null)
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
      display: 'grid', gridTemplateColumns: '190px 92px 116px 110px 1fr',
      gap: 8, alignItems: 'center', padding: '5px 0',
    },
    entete: { fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 600 },
    selPetit: {
      padding: '5px 6px', fontSize: 12, borderRadius: 'var(--radius-md)',
      border: '0.5px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', width: '100%',
    },
    moisSep: {
      fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)',
      padding: '12px 0 4px', marginTop: 4, borderTop: '0.5px solid var(--color-border)',
    },
    etat: (couleur) => ({ fontSize: 12, color: couleur, display: 'inline-flex', alignItems: 'center', gap: 4 }),
    chips: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
    chip: (refus) => ({
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
      padding: '3px 6px 3px 8px', borderRadius: 'var(--radius-md)',
      background: refus ? 'var(--color-danger-light)' : 'var(--color-primary-light)',
      color: refus ? 'var(--color-danger)' : 'var(--color-primary-dark)',
      border: `0.5px solid ${refus ? 'var(--color-danger)' : 'var(--color-primary)'}`,
    }),
    croix: { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'inherit', lineHeight: 1, padding: 0 },
    ajout: {
      padding: '4px 6px', fontSize: 12, borderRadius: 'var(--radius-md)',
      border: '0.5px dashed var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-secondary)', outline: 'none', width: 120,
    },
    posteLibre: {
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
      padding: '3px 6px 3px 8px', borderRadius: 'var(--radius-md)',
      border: '0.5px dashed var(--color-amber)', background: 'var(--color-amber-light)', color: 'var(--color-amber)',
    },
    boutonPoste: {
      border: '0.5px dashed var(--color-primary)', background: 'transparent', color: 'var(--color-primary)',
      borderRadius: 'var(--radius-md)', fontSize: 12, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
    },
    compteurs: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 },
    pastilleChip: { fontSize: 12, padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-border)', background: 'var(--color-surface)' },
  }

  if (!estFaiseur) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Vacances</h1>
        <div style={{ ...s.carte, color: 'var(--color-text-secondary)', fontSize: 14, padding: 24 }}>
          Cette page est réservée au faiseur de planning.
        </div>
      </div>
    )
  }

  const pret = data !== null && calendrier !== null

  return (
    <div style={{ maxWidth: 1180 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Vacances {annee}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        Au moins un associé en congé par semaine (deux en vacances scolaires). Choisissez une
        période, laissez l'outil <strong>proposer</strong> en respectant les souhaits puis ajustez :
        il vous alerte si une semaine est vide, si un associé a refusé cette semaine, ou si une
        semaine scolaire a moins de deux congés. Vous pouvez <strong>ouvrir un poste</strong>
        supplémentaire sur n'importe quelle semaine (bouton « + poste ») : la case libre se remplit
        à la main ou via « Proposer automatiquement ». À l'inverse, <strong>retirer</strong> un associé
        (✕) ferme le poste : la semaine n'est pas re-pourvue au prochain « Proposer ». Vous gardez le dernier mot.
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
            title="Génère un fichier Excel : base calendrier + objectifs + week-ends + vacances"
          >
            {exportEnCours ? 'Export…' : '⬇ Exporter en Excel'}
          </button>
          {enregistre && <span style={{ fontSize: 13, color: 'var(--color-success)', alignSelf: 'center' }}>Enregistré ✓</span>}
        </div>
      </div>

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
          {/* Récap */}
          <div style={{ fontSize: 13, marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>{recap.couvertes}/{recap.total} semaines couvertes</span>
            <span style={{ color: recap.sans ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>🔴 {recap.sans} sans vacance</span>
            <span style={{ color: recap.refus ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>🔴 {recap.refus} refus</span>
            <span style={{ color: recap.sous ? 'var(--color-amber)' : 'var(--color-text-tertiary)' }}>🟠 {recap.sous} scolaire &lt; 2</span>
            <span style={{ color: recap.garde ? 'var(--color-amber)' : 'var(--color-text-tertiary)' }}>🟠 {recap.garde} garde collée</span>
            <span style={{ color: recap.rappr ? 'var(--color-amber)' : 'var(--color-text-tertiary)' }}>🟠 {recap.rappr} rapprochée(s)</span>
            <span style={{ color: postesOuverts ? 'var(--color-amber)' : 'var(--color-text-tertiary)' }} title="Postes de vacances ouverts non encore pourvus (à remplir à la main ou via « Proposer automatiquement »)">🟠 {postesOuverts} à pourvoir</span>
          </div>

          {/* Compteurs par associé */}
          <div style={s.compteurs}>
            {ASSOCIES.map(ini => (
              <span key={ini} style={s.pastilleChip}><strong>{ini}</strong> : {compteParAssocie[ini]}</span>
            ))}
          </div>

          {/* Récap visuel des souhaits de congés par associé (hors scolaires) + vue scolaire */}
          <PanneauVacances desiderataParAssocie={desiderataParAssocie} scolairesSet={scolairesSet} annee={annee} ecartesSet={ecartesSet} onToggle={toggleEcart} />

          {/* Tableau des semaines */}
          <div style={s.carte}>
            <div style={{ ...s.ligne, borderBottom: '0.5px solid var(--color-border)', paddingBottom: 6, marginBottom: 4 }}>
              <span style={s.entete}>Semaine</span>
              <span style={s.entete}>État</span>
              <span style={s.entete}>Souhaité</span>
              <span style={s.entete}>Dispo</span>
              <span style={s.entete}>En vacances</span>
            </div>
            {semaines.map((sem, idx) => {
              const jeudi = new Date(sem.lundi.getTime() + 3 * JOUR_MS)
              const moisPrec = idx > 0 ? new Date(semaines[idx - 1].lundi.getTime() + 3 * JOUR_MS).getUTCMonth() : null
              const sep = idx === 0 || jeudi.getUTCMonth() !== moisPrec
              const estScol = scolairesSet.has(sem.num)
              const inis = vacances[sem.num] ?? []
              const a = analyses[sem.num]
              const souhaits = ASSOCIES.filter(x => souhaitParAssocie[x]?.has(sem.num))
              const dispo = ASSOCIES.filter(x => !refusParAssocie[x]?.has(sem.num))
              const ajoutables = ASSOCIES.filter(x => !inis.includes(x))
              return (
                <Fragment key={sem.num}>
                  {sep && <div style={s.moisSep}>{moisAnneeFR(jeudi)}</div>}
                  <div style={s.ligne}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      S{sem.num} · {formatJJMM(sem.lundi)} → {formatJJMM(sem.dimanche)}
                      {estScol && <span style={{ color: '#2D6CB5' }}> · scol.</span>}
                    </span>
                    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {a.sansVacance && <span style={s.etat('var(--color-danger)')} title="Aucun associé en congé">🔴 vide</span>}
                      {a.refus.length > 0 && <span style={s.etat('var(--color-danger)')} title={`A refusé cette semaine : ${a.refus.join(', ')}`}>🔴 refus</span>}
                      {a.sousScolaire && <span style={s.etat('var(--color-amber)')} title="Semaine scolaire : moins de 2 associés en congé">🟠 scol&lt;2</span>}
                      {a.gardeCollee.length > 0 && <span style={s.etat('var(--color-amber)')} title={`Vacances accolées à un week-end de garde : ${a.gardeCollee.join(', ')}`}>🟠 garde</span>}
                      {a.souhaitColonne.length > 0 && <span style={s.etat('var(--color-amber)')} title={`Souhait de colonne (veulent travailler) cette semaine : ${a.souhaitColonne.join(', ')}`}>🟠 colonne</span>}
                      {a.rapprochees.length > 0 && <span style={s.etat('var(--color-amber)')} title={`${a.rapprochees.join(', ')} : deux semaines de congé à moins de 4 semaines d'écart. Si c'est un souhait de l'associé (voir colonne Souhaité), c'est volontaire — l'alerte sert seulement à vous en informer.`}>🟠 rapprochées</span>}
                      {!a.sansVacance && a.refus.length === 0 && !a.sousScolaire && a.gardeCollee.length === 0 && a.souhaitColonne.length === 0 && a.rapprochees.length === 0 && <span style={s.etat('var(--color-success)')}>✓</span>}
                    </span>
                    <select value="" onChange={() => {}} style={s.selPetit} title="Associés ayant souhaité cette semaine (desiderata)">
                      <option value="">{souhaits.length} souhait{souhaits.length > 1 ? 's' : ''}</option>
                      {souhaits.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <select value="" onChange={() => {}} style={s.selPetit} title="Associés n'ayant pas refusé cette semaine">
                      <option value="">{dispo.length}/{ASSOCIES.length} dispo</option>
                      {dispo.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <span style={s.chips}>
                      {inis.map(x => {
                        const verrou = verrous[sem.num]?.includes(x)
                        return (
                          <span key={x} style={{ ...s.chip(refusParAssocie[x]?.has(sem.num)), ...(verrou ? { borderWidth: 1, fontWeight: 700 } : {}) }}>
                            {x}
                            <BoutonVerrou verrouille={!!verrou} onToggle={() => basculerVerrou(sem.num, x)} />
                            <button type="button" onClick={() => retirer(sem.num, x)} style={s.croix} title="Retirer et fermer le poste (reste supprimé après « Proposer »)">✕</button>
                          </span>
                        )
                      })}
                      {Array.from({ length: Math.max(capacite(sem.num) - inis.length, 0) }).map((_, k) => (
                        <span key={`libre-${k}`} style={s.posteLibre} title="Poste de vacances ouvert, à pourvoir (à la main ou via « Proposer automatiquement »)">
                          poste libre
                          <button type="button" onClick={() => fermerPoste(sem.num)} style={s.croix} title="Fermer ce poste">✕</button>
                        </span>
                      ))}
                      <select value="" onChange={e => { ajouter(sem.num, e.target.value); e.target.value = '' }} style={s.ajout}>
                        <option value="">+ ajouter…</option>
                        {ajoutables.map(x => (
                          <option key={x} value={x}>
                            {x}{refusParAssocie[x]?.has(sem.num) ? ' ⚠ refus' : souhaitParAssocie[x]?.has(sem.num) ? ' ★ souhait' : ''}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => ouvrirPoste(sem.num)} style={s.boutonPoste} title="Ouvrir un poste de vacances supplémentaire sur cette semaine">
                        + poste
                      </button>
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
