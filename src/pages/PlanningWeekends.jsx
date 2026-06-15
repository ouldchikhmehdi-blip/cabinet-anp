import { useState, useEffect, useMemo, Fragment } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES, weekendsDansPlage, formatJJMM, moisAnneeFR } from '../utils/calendrier'
import { ANNEE_DEFAUT, normaliser } from '../utils/desiderata'
import { ASSOCIES } from '../data/associes'
import { listerRecueils, chargerTousDesiderata, chargerProfilsAvecInitiales } from '../utils/desiderataApi'
import { chargerCalendrier } from '../utils/calendrierApi'
import { chargerObjectifs } from '../utils/objectifsApi'
import { chargerWeekends, sauverWeekends } from '../utils/weekendsApi'
import { proposerWeekends, analyserAffectation, ESPACEMENT_MIN } from '../utils/weekends'
import { exporterCalendrierExcel } from '../utils/exportCalendrier'

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
  const [data, setData] = useState(null)        // { v, affectations: { num: ini } } (toute l'année)
  const [erreur, setErreur] = useState(null)
  const [enregistre, setEnregistre] = useState(false)
  const [exportEnCours, setExportEnCours] = useState(false)

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
    Promise.all([chargerCalendrier(annee), chargerObjectifs(annee), chargerWeekends(annee)])
      .then(([cal, obj, we]) => {
        if (annule) return
        setCalendrier(cal); setObjectifs(obj); setData(we); onStatut?.('vierge')
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

  // Indisponibilités week-end par associé : { ini: Set(numsSemaine) }.
  const indispoParAssocie = useMemo(() => {
    const parUser = {}
    for (const p of profils) parUser[p.id] = p.initiales
    const map = {}
    for (const row of desideratas) {
      const ini = parUser[row.user_id]
      if (!ini) continue
      map[ini] = new Set(normaliser(row.data).weekendsIndispo ?? [])
    }
    return map
  }, [desideratas, profils])

  const weekends = useMemo(
    () => (recueil ? weekendsDansPlage(annee, recueil.semaine_debut, recueil.semaine_fin) : []),
    [annee, recueil]
  )

  const affectations = useMemo(() => data?.affectations ?? {}, [data])

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
    for (const w of weekends) m[w.num] = analyserAffectation(w.num, affectations[w.num], affectations, indispoParAssocie)
    return m
  }, [weekends, affectations, indispoParAssocie])

  const recap = useMemo(() => {
    let attribues = 0, indispo = 0, proches = 0
    for (const w of weekends) {
      if (affectations[w.num]) attribues++
      const a = analyses[w.num]
      if (a?.indispo) indispo++
      if (a?.tropProche != null) proches++
    }
    return { total: weekends.length, attribues, indispo, proches }
  }, [weekends, affectations, analyses])

  // Compteur de week-ends par associé sur la période.
  const compteParAssocie = useMemo(() => {
    const m = {}
    for (const ini of ASSOCIES) m[ini] = 0
    for (const w of weekends) { const ini = affectations[w.num]; if (ini && m[ini] != null) m[ini]++ }
    return m
  }, [weekends, affectations])

  function majAffectation(num, ini) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const aff = { ...prev.affectations }
      if (ini) aff[num] = ini
      else delete aff[num]
      return { ...prev, affectations: aff }
    })
  }

  function proposer() {
    if (!recueil) return
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const debut = recueil.semaine_debut, fin = recueil.semaine_fin
      const horsPlage = {}
      for (const [num, ini] of Object.entries(prev.affectations)) {
        const n = Number(num)
        if (n < debut || n > fin) horsPlage[n] = ini
      }
      const proposees = proposerWeekends(weekends, indispoParAssocie, objectifGW, horsPlage)
      return { ...prev, affectations: { ...horsPlage, ...proposees } }
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

  async function exporter() {
    setErreur(null); setExportEnCours(true)
    try {
      // Étape 3 : base calendrier + objectifs + week-ends (incrémental).
      await exporterCalendrierExcel(annee, calendrier, objectifs, data.affectations)
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
      display: 'grid', gridTemplateColumns: '210px 54px 54px 1fr 200px',
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
    compteurs: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 },
    chip: { fontSize: 12, padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-border)', background: 'var(--color-surface)' },
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
        <button type="button" onClick={proposer} disabled={!pret || !recueil} style={{ ...s.bouton, opacity: (!pret || !recueil) ? 0.5 : 1 }}>
          Proposer automatiquement
        </button>
        <button type="button" onClick={enregistrer} disabled={!pret} style={{ ...s.bouton, opacity: !pret ? 0.5 : 1 }}>
          Enregistrer
        </button>
        <button
          type="button"
          onClick={exporter}
          disabled={!pret || exportEnCours}
          style={{ ...s.bouton, background: 'transparent', color: 'var(--color-primary)', border: '0.5px solid var(--color-primary)', opacity: (!pret || exportEnCours) ? 0.6 : 1 }}
          title="Génère un fichier Excel : base calendrier + objectifs + week-ends"
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

      {!recueil ? (
        <div style={{ ...s.carte, color: 'var(--color-text-secondary)', fontSize: 14, padding: 20 }}>
          Aucune période disponible. Créez un recueil « normal » dans <strong>Suivi desiderata</strong>
          {' '}(les recueils d'été sont exclus : les week-ends y sont gérés par colonnes).
        </div>
      ) : !pret ? (
        <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Chargement…</div>
      ) : (
        <>
          {/* Récap des conflits */}
          <div style={{ fontSize: 13, marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>{recap.attribues}/{recap.total} week-ends attribués</span>
            <span style={{ color: recap.indispo ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>🔴 {recap.indispo} indisponibilité(s)</span>
            <span style={{ color: recap.proches ? 'var(--color-amber)' : 'var(--color-text-tertiary)' }}>🟠 {recap.proches} trop rapproché(s)</span>
          </div>

          {/* Compteurs par associé */}
          <div style={s.compteurs}>
            {ASSOCIES.map(ini => (
              <span key={ini} style={s.chip}>
                <strong>{ini}</strong> : {compteParAssocie[ini]}
                {objectifGW[ini] != null && <span style={{ color: 'var(--color-text-tertiary)' }}> / {objectifGW[ini]}</span>}
              </span>
            ))}
          </div>

          {/* Tableau des week-ends */}
          <div style={s.carte}>
            <div style={{ ...s.ligne, borderBottom: '0.5px solid var(--color-border)', paddingBottom: 6, marginBottom: 4 }}>
              <span style={s.entete}>Week-end</span>
              <span style={{ ...s.entete, textAlign: 'center' }}>Sam</span>
              <span style={{ ...s.entete, textAlign: 'center' }}>Dim</span>
              <span style={s.entete}>État</span>
              <span style={s.entete}>Associé</span>
            </div>
            {weekends.map((w, idx) => {
              const moisPrec = idx > 0 ? new Date(weekends[idx - 1].samedi).getUTCMonth() : null
              const mois = new Date(w.samedi).getUTCMonth()
              const sep = idx === 0 || mois !== moisPrec
              const roles = calendrier.semaines?.[w.num] ?? { sam: 'A', dim: 'G' }
              const ini = affectations[w.num] ?? ''
              const a = analyses[w.num]
              const alerte = a?.indispo ? 'rouge' : (a?.tropProche != null ? 'orange' : null)
              return (
                <Fragment key={w.num}>
                  {sep && <div style={s.moisSep}>{moisAnneeFR(w.samedi)}</div>}
                  <div style={s.ligne}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      WE S{w.num} · {formatJJMM(w.samedi)} – {formatJJMM(w.dimanche)}
                    </span>
                    <div style={s.role(roles.sam)} title="Rôle du samedi (Étape 0)">{roles.sam}</div>
                    <div style={s.role(roles.dim)} title="Rôle du dimanche (Étape 0)">{roles.dim}</div>
                    <span>
                      {!ini ? (
                        <span style={s.etat('var(--color-text-tertiary)')}>—</span>
                      ) : a.indispo ? (
                        <span style={s.etat('var(--color-danger)')}>🔴 indisponible (desiderata)</span>
                      ) : a.tropProche != null ? (
                        <span style={s.etat('var(--color-amber)')}>🟠 &lt; {ESPACEMENT_MIN} sem. (WE S{a.tropProche})</span>
                      ) : (
                        <span style={s.etat('var(--color-success)')}>✓</span>
                      )}
                    </span>
                    <select value={ini} onChange={e => majAffectation(w.num, e.target.value)} style={s.selWE(alerte)}>
                      <option value="">—</option>
                      {ASSOCIES.map(x => (
                        <option key={x} value={x}>
                          {x}{indispoParAssocie[x]?.has(w.num) ? ' ⚠ indispo' : ''}
                        </option>
                      ))}
                    </select>
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
