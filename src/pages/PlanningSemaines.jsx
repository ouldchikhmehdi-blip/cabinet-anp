import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES, semainesDansPlage, formatJJMM, feriesEnSemaine } from '../utils/calendrier'
import { ANNEE_DEFAUT } from '../utils/desiderata'
import { listerRecueils } from '../utils/desiderataApi'
import { chargerCalendrier } from '../utils/calendrierApi'
import { chargerVacances } from '../utils/vacancesApi'
import { chargerTrames } from '../utils/tramesApi'
import { chargerSemaines, sauverSemaines } from '../utils/semainesApi'
import TrameGrille from '../components/planning/TrameGrille'

// Étape « En semaine » : la trame principale s'applique partout par défaut ; le faiseur la remplace
// sur les semaines particulières (2+ vacances, ponts = férié en semaine, remplaçants).
export default function PlanningSemaines({ annee: anneeProp, onChangeAnnee, onStatut } = {}) {
  const { session, profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [anneeInterne, setAnneeInterne] = useState(ANNEE_DEFAUT)
  const annee = anneeProp ?? anneeInterne
  const setAnnee = onChangeAnnee ?? setAnneeInterne

  const [recueils, setRecueils] = useState([])
  const [recueilId, setRecueilId] = useState(null)
  const [tramesData, setTramesData] = useState(null)
  const [vacancesData, setVacancesData] = useState(null)
  const [calendrier, setCalendrier] = useState(null)
  const [data, setData] = useState(null)        // { v, trameParSemaine: { num: trameId } }
  const [erreur, setErreur] = useState(null)
  const [enregistre, setEnregistre] = useState(false)
  const [filtreArbitrer, setFiltreArbitrer] = useState(false)
  const [apercus, setApercus] = useState(() => new Set()) // numéros de semaine dont l'aperçu est ouvert

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

  // Catalogue de trames + vacances + base calendrier (vacances scolaires) + choix de trame/semaine.
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    Promise.all([chargerTrames(annee), chargerVacances(annee), chargerCalendrier(annee), chargerSemaines(annee)])
      .then(([tr, vac, cal, sem]) => {
        if (annule) return
        setTramesData(tr); setVacancesData(vac); setCalendrier(cal); setData(sem)
        onStatut?.('vierge')
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger les données de planning.') })
    return () => { annule = true }
  }, [annee, estFaiseur, onStatut])

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

  const semaines = useMemo(
    () => (recueil ? semainesDansPlage(annee, recueil.semaine_debut, recueil.semaine_fin) : []),
    [annee, recueil]
  )

  // Analyse par semaine : repères « à arbitrer » (2+ vacances, pont) + repère indicatif scolaire.
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

  const nbArbitrer = useMemo(() => semaines.filter(s => analyses[s.num]?.aArbitrer).length, [semaines, analyses])

  const semainesAffichees = useMemo(
    () => (filtreArbitrer ? semaines.filter(s => analyses[s.num]?.aArbitrer) : semaines),
    [semaines, analyses, filtreArbitrer]
  )

  function majTrameSemaine(num, trameId) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const map = { ...(prev?.trameParSemaine ?? {}) }
      // Suivre la principale = pas de choix stocké.
      if (trameId == null || trameId === principaleId) delete map[num]
      else map[num] = trameId
      return { ...prev, trameParSemaine: map }
    })
  }

  function toggleApercu(num) {
    setApercus(prev => {
      const s = new Set(prev)
      if (s.has(num)) s.delete(num); else s.add(num)
      return s
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
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>En semaine {annee}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        La <strong>trame principale</strong> s'applique à toutes les semaines, sauf là où vous collez une
        autre trame du catalogue. L'outil met en avant les semaines à arbitrer : <strong>2 associés ou
        plus en vacances</strong> et les <strong>ponts</strong> (un jour férié tombant un jour ouvré).
        Choisissez la trame de chaque semaine ; la principale reste la valeur par défaut.
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
        <button type="button" onClick={enregistrer} disabled={!pret} style={{ ...s.bouton, padding: '8px 14px', fontSize: 13, opacity: !pret ? 0.5 : 1 }}>
          Enregistrer
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
          Aucune <strong>trame principale</strong> désignée. Choisissez-en une dans l'onglet <strong>Trames</strong> (Suivi des desiderata) pour qu'elle s'applique par défaut.
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
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: 8 }}>
                Aucune semaine à afficher.
              </div>
            ) : semainesAffichees.map(sem => {
              const a = analyses[sem.num]
              const choisi = trameParSemaine[sem.num] ?? null
              const effectiveId = choisi ?? principaleId
              const trame = effectiveId != null ? tramesById[effectiveId] : null
              const ouvert = apercus.has(sem.num)
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
                        <span style={s.badge('var(--color-text-tertiary)', 'transparent')} title="Semaine de vacances scolaires (souvent plus de remplaçants)">
                          🎒 Vacances scolaires
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
                        {ouvert ? 'Masquer l’aperçu' : 'Aperçu de la trame'}
                      </button>
                    )}
                  </div>
                  {ouvert && trame && (
                    <div style={s.apercu}>
                      <TrameGrille
                        colonnes={trame.colonnes}
                        roles={{ rea: trame.rea, vacances: trame.vacances, avantWE: trame.avantWE, apresWE: trame.apresWE, remplacants: trame.remplacants }}
                      />
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
