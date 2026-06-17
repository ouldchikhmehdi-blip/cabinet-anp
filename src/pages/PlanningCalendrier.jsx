import { useState, useEffect, useMemo, Fragment } from 'react'
import { useAuth } from '../auth/AuthContext'
import { listerSemaines, joursFeriesFR, formatISO, ANNEES, premiereSemainePlanning } from '../utils/calendrier'
import { ANNEE_DEFAUT } from '../utils/desiderata'
import { chargerCalendrier, sauverCalendrier, recupererVacancesScolairesZoneC } from '../utils/calendrierApi'
import { exporterCalendrierExcel } from '../utils/exportCalendrier'

const JOUR_MS = 24 * 60 * 60 * 1000
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

// Couleurs des statuts (jaune/bleu en littéral : pas de variable CSS dédiée).
const COULEUR = {
  A: { bg: 'var(--color-amber-light)', fg: 'var(--color-amber)' }, // astreinte = orange
  G: { bg: '#FBF3D0', fg: '#9A7B0A' },                             // garde = jaune
}
const JOURS_EDIT = [
  { cle: 'jeu', label: 'Jeu', offset: 3 },
  { cle: 'ven', label: 'Ven', offset: 4 },
  { cle: 'sam', label: 'Sam', offset: 5 },
  { cle: 'dim', label: 'Dim', offset: 6 },
]
// Jours fixes (non éditables) : lundi=A, mardi=G, mercredi=A (§3).
const JOURS_FIXES = [
  { label: 'Lun', statut: 'A', offset: 0 },
  { label: 'Mar', statut: 'G', offset: 1 },
  { label: 'Mer', statut: 'A', offset: 2 },
]
const DEFAUT_SEMAINE = { jeu: 'G', ven: 'A', sam: 'A', dim: 'G' }

export default function PlanningCalendrier({ annee: anneeProp, onChangeAnnee, onStatut, onRegisterSave } = {}) {
  const { session, profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [anneeInterne, setAnneeInterne] = useState(ANNEE_DEFAUT)
  const annee = anneeProp ?? anneeInterne
  const setAnnee = onChangeAnnee ?? setAnneeInterne
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [enregistre, setEnregistre] = useState(false)
  const [recup, setRecup] = useState(false)
  const [exportEnCours, setExportEnCours] = useState(false)

  // Le planning commence après les vacances de Noël : S1 (et bloc scolaire de tête) jamais affichée.
  const debutPlanning = useMemo(() => premiereSemainePlanning(data?.vacancesScolaires ?? []), [data])
  const semaines = useMemo(() => listerSemaines(annee).filter(s => s.num >= debutPlanning), [annee, debutPlanning])

  // Map date ISO → nom de férié (pour repérer les fériés dans la grille).
  const feriesMap = useMemo(() => {
    const m = {}
    for (const f of joursFeriesFR(annee)) m[f.iso] = f.nom
    return m
  }, [annee])

  // Semaines qui ouvrent un nouveau mois (rattachement par le jeudi) → séparateur.
  const premieresDuMois = useMemo(() => {
    const set = new Set()
    let prec = null
    for (const s of semaines) {
      const mois = new Date(s.lundi.getTime() + 3 * JOUR_MS).getUTCMonth()
      if (mois !== prec) { set.add(s.num); prec = mois }
    }
    return set
  }, [semaines])

  function moisDeSemaine(s) {
    return new Date(s.lundi.getTime() + 3 * JOUR_MS).getUTCMonth()
  }

  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    chargerCalendrier(annee)
      .then(d => { if (!annule) { setData(d); onStatut?.('vierge') } })
      .catch(() => { if (!annule) setErreur('Impossible de charger la base calendrier.') })
    return () => { annule = true }
  }, [annee, estFaiseur, onStatut])

  function basculerJour(num, jour) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const courant = prev.semaines[num]?.[jour] === 'G' ? 'A' : 'G'
      return {
        ...prev,
        semaines: { ...prev.semaines, [num]: { ...prev.semaines[num], [jour]: courant } },
      }
    })
  }

  // Week-end : samedi/dimanche couplés (opposés) + alternance imposée à toutes
  // les semaines en dessous (rotation avec l'autre groupe).
  function basculerWeekend(num) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const idx = semaines.findIndex(s => s.num === num)
      if (idx === -1) return prev
      const samActuel = prev.semaines[num]?.sam ?? 'A'
      const samBase = samActuel === 'G' ? 'A' : 'G' // valeur basculée pour la semaine cliquée
      const inverse = v => (v === 'G' ? 'A' : 'G')
      const nouvelles = { ...prev.semaines }
      for (let i = idx; i < semaines.length; i++) {
        const n = semaines[i].num
        const sam = (i - idx) % 2 === 0 ? samBase : inverse(samBase)
        nouvelles[n] = { ...nouvelles[n], sam, dim: inverse(sam) }
      }
      return { ...prev, semaines: nouvelles }
    })
  }

  function basculerVacances(num) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const present = prev.vacancesScolaires.includes(num)
      return {
        ...prev,
        vacancesScolaires: present
          ? prev.vacancesScolaires.filter(n => n !== num)
          : [...prev.vacancesScolaires, num].sort((a, b) => a - b),
      }
    })
  }

  async function recupererVacances() {
    setErreur(null); setRecup(true)
    try {
      const weeks = await recupererVacancesScolairesZoneC(annee)
      setData(prev => ({ ...prev, vacancesScolaires: weeks }))
      setEnregistre(false); onStatut?.('modifie')
    } catch {
      setErreur('Impossible de récupérer les vacances scolaires (API indisponible). Vous pouvez les cocher manuellement.')
    } finally {
      setRecup(false)
    }
  }

  async function exporter() {
    setErreur(null); setExportEnCours(true)
    try {
      // Étape 1 : on exporte uniquement la base calendrier (les objectifs s'ajoutent à l'étape 2).
      await exporterCalendrierExcel(annee, data)
    } catch {
      setErreur('Export Excel impossible.')
    } finally {
      setExportEnCours(false)
    }
  }

  async function enregistrer() {
    setErreur(null)
    try {
      await sauverCalendrier(annee, data, session.user.id)
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
      borderRadius: 'var(--radius-lg)', padding: '8px 12px', marginBottom: 24,
    },
    ligne: {
      display: 'grid',
      gridTemplateColumns: '170px repeat(7, 40px) 70px',
      gap: 4, alignItems: 'center', padding: '3px 0',
    },
    entete: { fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', fontWeight: 600 },
    celluleFixe: {
      height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text-tertiary)',
      border: '0.5px solid var(--color-border)',
    },
    boutonJour: (statut) => ({
      height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 600, borderRadius: 6,
      background: COULEUR[statut].bg, color: COULEUR[statut].fg,
      border: `0.5px solid ${COULEUR[statut].fg}`,
    }),
    caseVac: (actif) => ({
      height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, borderRadius: 6, cursor: 'pointer',
      background: actif ? '#E3EEF9' : 'var(--color-bg)',
      color: actif ? '#2D6CB5' : 'var(--color-text-tertiary)',
      border: `0.5px solid ${actif ? '#2D6CB5' : 'var(--color-border)'}`,
      fontWeight: actif ? 600 : 400,
    }),
    legende: { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, fontSize: 12, color: 'var(--color-text-secondary)' },
    pastille: () => ({
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }),
    pt: (bg, fg) => ({ width: 14, height: 14, borderRadius: 4, background: bg, border: `0.5px solid ${fg}` }),
    moisSep: {
      fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)',
      padding: '12px 0 4px', marginTop: 4, borderTop: '0.5px solid var(--color-border)',
    },
    // Repère férié : anneau violet autour de la cellule du jour férié.
    ferieMark: { outline: '2px solid var(--color-primary)', outlineOffset: '-2px' },
  }

  if (!estFaiseur) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Base calendrier</h1>
        <div style={{ ...s.carte, color: 'var(--color-text-secondary)', fontSize: 14, padding: 24 }}>
          Cette page est réservée au faiseur de planning.
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Base calendrier — Étape 0</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        Lundi, mardi, mercredi sont fixes (A / G / A). Jeudi et vendredi se basculent à la main.
        Le <strong>week-end</strong> (samedi/dimanche) est <strong>couplé</strong> (toujours opposés)
        et <strong>alterne automatiquement</strong> d'une semaine à l'autre : cliquez un week-end pour
        imposer l'alternance à toutes les semaines en dessous. Cochez les vacances scolaires et ajustez les fériés.
      </p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Année</label>
          <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={s.select}>
            {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={recupererVacances}
          disabled={recup || data === null}
          style={{ ...s.bouton, padding: '8px 14px', fontSize: 13, background: 'transparent', color: 'var(--color-primary)', border: '0.5px solid var(--color-primary)', opacity: recup ? 0.6 : 1 }}
          title="Pré-cocher les semaines de vacances scolaires zone C depuis le calendrier officiel"
        >
          {recup ? 'Récupération…' : 'Récupérer les vacances (zone C)'}
        </button>
        <button type="button" onClick={enregistrer} disabled={data === null} style={{ ...s.bouton, opacity: data === null ? 0.5 : 1 }}>
          Enregistrer
        </button>
        <button
          type="button"
          onClick={exporter}
          disabled={exportEnCours || data === null}
          style={{ ...s.bouton, background: 'transparent', color: 'var(--color-primary)', border: '0.5px solid var(--color-primary)', opacity: (exportEnCours || data === null) ? 0.6 : 1 }}
          title="Génère un fichier Excel de la base (jours en lignes, G jaune / A orange)"
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

      {/* Légende */}
      <div style={s.legende}>
        <span style={s.pastille()}><span style={s.pt(COULEUR.A.bg, COULEUR.A.fg)} /> Astreinte (A)</span>
        <span style={s.pastille()}><span style={s.pt(COULEUR.G.bg, COULEUR.G.fg)} /> Garde (G)</span>
        <span style={s.pastille()}><span style={s.pt('var(--color-bg)', 'var(--color-border)')} /> Jour fixe</span>
        <span style={s.pastille()}><span style={s.pt('#E3EEF9', '#2D6CB5')} /> Vacances scolaires</span>
        <span style={s.pastille()}><span style={{ width: 14, height: 14, borderRadius: 4, outline: '2px solid var(--color-primary)', outlineOffset: '-2px' }} /> Jour férié</span>
      </div>

      {data === null ? (
        <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Chargement…</div>
      ) : (
        <>
          {/* Grille des semaines */}
          <div style={s.carte}>
            <div style={{ ...s.ligne, borderBottom: '0.5px solid var(--color-border)', paddingBottom: 6, marginBottom: 4 }}>
              <span style={{ ...s.entete, textAlign: 'left' }}>Semaine</span>
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(j => <span key={j} style={s.entete}>{j}</span>)}
              <span style={s.entete}>Vac.</span>
            </div>
            {semaines.map(sem => {
              const jours = data.semaines[sem.num] ?? DEFAUT_SEMAINE
              const enVac = data.vacancesScolaires.includes(sem.num)
              const baseLundi = sem.lundi.getTime()
              const ferieDe = (offset) => feriesMap[formatISO(new Date(baseLundi + offset * JOUR_MS))]
              return (
                <Fragment key={sem.num}>
                  {premieresDuMois.has(sem.num) && (
                    <div style={s.moisSep}>{MOIS[moisDeSemaine(sem)]} {annee}</div>
                  )}
                  <div style={s.ligne}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{sem.label}</span>
                    {JOURS_FIXES.map(jf => {
                      const ferie = ferieDe(jf.offset)
                      return (
                        <div
                          key={jf.label}
                          style={{ ...s.celluleFixe, ...(ferie ? s.ferieMark : {}) }}
                          title={ferie ? `Jour fixe · férié : ${ferie}` : 'Jour fixe'}
                        >
                          {jf.statut}
                        </div>
                      )
                    })}
                    {JOURS_EDIT.map(j => {
                      const estWeekend = j.cle === 'sam' || j.cle === 'dim'
                      const ferie = ferieDe(j.offset)
                      const libelle = jours[j.cle] === 'G' ? 'Garde' : 'Astreinte'
                      return (
                        <button
                          key={j.cle}
                          type="button"
                          onClick={() => estWeekend ? basculerWeekend(sem.num) : basculerJour(sem.num, j.cle)}
                          style={{ ...s.boutonJour(jours[j.cle]), ...(ferie ? s.ferieMark : {}) }}
                          title={(estWeekend
                            ? `${j.label} — ${libelle} (week-end couplé, alterne en dessous)`
                            : `${j.label} — ${libelle}`) + (ferie ? ` · férié : ${ferie}` : '')}
                        >
                          {jours[j.cle]}
                        </button>
                      )
                    })}
                    <button type="button" onClick={() => basculerVacances(sem.num)} style={s.caseVac(enVac)}>
                      {enVac ? '✓ Vac.' : '—'}
                    </button>
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
