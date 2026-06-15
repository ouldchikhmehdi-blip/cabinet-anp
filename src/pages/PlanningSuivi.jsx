import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ASSOCIES } from '../data/associes'
import { ANNEES, listerSemaines } from '../utils/calendrier'
import { desiderataVide, normaliser, estRempli, ANNEE_DEFAUT } from '../utils/desiderata'
import {
  chargerTousDesiderata, chargerProfilsAvecInitiales,
  listerRecueils, creerRecueil, definirStatutRecueil, supprimerRecueil,
} from '../utils/desiderataApi'
import { chargerCalendrier, sauverCalendrier, recupererVacancesScolairesZoneC } from '../utils/calendrierApi'
import RecapDesiderata from '../components/planning/RecapDesiderata'

export default function PlanningSuivi() {
  const { session, profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [annee, setAnnee] = useState(ANNEE_DEFAUT)
  const [recueils, setRecueils] = useState([])
  const [recueilId, setRecueilId] = useState(null)
  const [profils, setProfils] = useState([])
  const [desideratas, setDesideratas] = useState([])
  const [ouvert, setOuvert] = useState(null)
  const [erreur, setErreur] = useState(null)

  // Formulaire de création de recueil
  const [nom, setNom] = useState('')
  const [semDebut, setSemDebut] = useState(1)
  const [semFin, setSemFin] = useState(13)

  // Récupération des vacances scolaires (écrit dans la base calendrier de l'année)
  const [recupVac, setRecupVac] = useState(false)
  const [msgVac, setMsgVac] = useState(null)

  const semainesAnnee = useMemo(() => listerSemaines(annee), [annee])

  // Profils (indépendant de l'année)
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    chargerProfilsAvecInitiales()
      .then(p => { if (!annule) setProfils(p) })
      .catch(() => { if (!annule) setErreur('Impossible de charger les comptes.') })
    return () => { annule = true }
  }, [estFaiseur])

  // Recueils de l'année
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    listerRecueils(annee)
      .then(rs => {
        if (annule) return
        setRecueils(rs)
        setRecueilId(prev => (rs.some(r => r.id === prev) ? prev : (rs[0]?.id ?? null)))
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger les recueils.') })
    return () => { annule = true }
  }, [annee, estFaiseur])

  // Desiderata du recueil sélectionné (le board n'est affiché que si un recueil existe)
  useEffect(() => {
    if (!estFaiseur || !recueilId) return
    let annule = false
    chargerTousDesiderata(recueilId)
      .then(d => { if (!annule) setDesideratas(d) })
      .catch(() => { if (!annule) setErreur('Impossible de charger les desiderata.') })
    return () => { annule = true }
  }, [recueilId, estFaiseur])

  async function rechargerRecueils(selId) {
    const rs = await listerRecueils(annee)
    setRecueils(rs)
    if (selId !== undefined) setRecueilId(selId)
    else setRecueilId(prev => (rs.some(r => r.id === prev) ? prev : (rs[0]?.id ?? null)))
  }

  async function recupererVacances() {
    setMsgVac(null); setErreur(null); setRecupVac(true)
    try {
      const cal = await chargerCalendrier(annee)
      const weeks = await recupererVacancesScolairesZoneC(annee)
      await sauverCalendrier(annee, { ...cal, vacancesScolaires: weeks }, session.user.id)
      setMsgVac(`Vacances scolaires ${annee} récupérées et enregistrées dans la base calendrier.`)
      setTimeout(() => setMsgVac(null), 4000)
    } catch {
      setErreur('Impossible de récupérer les vacances scolaires (API indisponible).')
    } finally {
      setRecupVac(false)
    }
  }

  async function creer() {
    setErreur(null)
    if (!nom.trim()) { setErreur('Donnez un nom au recueil.'); return }
    if (semFin < semDebut) { setErreur('La semaine de fin doit être ≥ semaine de début.'); return }
    try {
      await creerRecueil({ annee, nom: nom.trim(), semaineDebut: semDebut, semaineFin: semFin, userId: session.user.id })
      setNom('')
      await rechargerRecueils()
    } catch {
      setErreur('Création impossible (réservée au faiseur).')
    }
  }

  async function basculer(r) {
    setErreur(null)
    try {
      await definirStatutRecueil(r.id, r.statut === 'ouvert' ? 'ferme' : 'ouvert')
      await rechargerRecueils(r.id)
    } catch {
      setErreur('Action impossible.')
    }
  }

  async function supprimer(r) {
    if (!confirm(`Supprimer le recueil « ${r.nom} » et tous les desiderata associés ?`)) return
    setErreur(null)
    try {
      await supprimerRecueil(r.id)
      await rechargerRecueils()
    } catch {
      setErreur('Suppression impossible.')
    }
  }

  const recueil = useMemo(() => recueils.find(r => r.id === recueilId) ?? null, [recueils, recueilId])

  const profilParInitiales = useMemo(() => {
    const m = {}
    for (const p of profils) m[p.initiales] = p
    return m
  }, [profils])

  const desiderataParUser = useMemo(() => {
    const m = {}
    for (const d of desideratas) m[d.user_id] = d
    return m
  }, [desideratas])

  const lignes = useMemo(() => ASSOCIES.map(ini => {
    const prof = profilParInitiales[ini]
    const dd = prof ? desiderataParUser[prof.id] : null
    const data = dd ? normaliser(dd.data) : desiderataVide()
    return {
      ini,
      relie: !!prof,
      data,
      majLe: dd?.updated_at ?? null,
      rempli: dd ? estRempli(data, dd.soumis) : false,
    }
  }), [profilParInitiales, desiderataParUser])

  const nbRemplis = lignes.filter(l => l.rempli).length

  // ── Styles ──
  const s = {
    select: {
      padding: '8px 12px', fontSize: 14, border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    input: {
      padding: '8px 12px', fontSize: 14, border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    bouton: {
      padding: '9px 16px', background: 'var(--color-primary)', color: '#fff',
      border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500,
    },
    boutonSec: {
      padding: '5px 10px', fontSize: 12, borderRadius: 'var(--radius-md)',
      border: '0.5px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)',
    },
    boutonDanger: {
      padding: '5px 10px', fontSize: 12, borderRadius: 'var(--radius-md)',
      border: '0.5px solid var(--color-danger)', background: 'transparent', color: 'var(--color-danger)',
    },
    label: { fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 },
    carteSection: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 24,
    },
    grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 24 },
    carte: (actif) => ({
      textAlign: 'left', background: 'var(--color-surface)',
      border: `0.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-border)'}`,
      borderRadius: 'var(--radius-lg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6,
    }),
    pastille: (couleur) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: couleur }),
    point: (couleur) => ({ width: 9, height: 9, borderRadius: '50%', background: couleur }),
    panneau: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: 24,
    },
  }

  if (!estFaiseur) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Suivi des desiderata</h1>
        <div style={{ ...s.carteSection, color: 'var(--color-text-secondary)', fontSize: 14 }}>
          Cette page est réservée au faiseur de planning.
        </div>
      </div>
    )
  }

  function couleurStatut(l) {
    if (!l.relie) return 'var(--color-text-tertiary)'
    return l.rempli ? 'var(--color-success)' : 'var(--color-danger)'
  }
  function texteStatut(l) {
    if (!l.relie) return 'Non relié'
    if (l.data.rienASignaler) return 'Rien à signaler'
    return l.rempli ? 'Transmis' : 'En attente'
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Suivi des desiderata</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        {recueil
          ? `${nbRemplis}/${ASSOCIES.length} associés ont transmis pour « ${recueil.nom} ».`
          : 'Créez un recueil pour commencer à collecter les desiderata.'}
      </p>

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }} className="no-print">
          {erreur}
        </div>
      )}

      {/* Gestion des recueils */}
      <div style={s.carteSection} className="no-print">
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
          <div>
            <label style={s.label}>Année</label>
            <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={s.select}>
              {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={recupererVacances}
            disabled={recupVac}
            style={{ ...s.bouton, background: 'transparent', color: 'var(--color-primary)', border: '0.5px solid var(--color-primary)', opacity: recupVac ? 0.6 : 1 }}
            title="Pré-remplit les vacances scolaires zone C dans la base calendrier (avant que les associés saisissent)"
          >
            {recupVac ? 'Récupération…' : 'Récupérer les vacances scolaires (zone C)'}
          </button>
        </div>
        {msgVac && <div style={{ fontSize: 12, color: 'var(--color-success)', marginBottom: 12 }}>{msgVac}</div>}
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
          Au démarrage, récupérez les vacances scolaires : elles seront bloquées dans les grilles
          de desiderata des associés (gérées via la question dédiée). Vous pourrez les ajuster dans « Base calendrier ».
        </div>

        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
          « Fermer » un recueil bloque les modifications des associés (ils ne peuvent plus que consulter).
        </div>

        {/* Liste des recueils de l'année */}
        {recueils.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {recueils.map(r => {
              const ouvertR = r.statut === 'ouvert'
              const actif = r.id === recueilId
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: `0.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                  <button type="button" onClick={() => setRecueilId(r.id)} style={{ ...s.boutonSec, border: 'none', background: 'transparent', fontSize: 13, fontWeight: actif ? 600 : 400, color: 'var(--color-text)', flex: 1, textAlign: 'left' }}>
                    {r.nom} <span style={{ color: 'var(--color-text-tertiary)' }}>· S{r.semaine_debut}→S{r.semaine_fin}</span>
                  </button>
                  <span style={s.pastille(ouvertR ? 'var(--color-success)' : 'var(--color-text-tertiary)')}>
                    <span style={s.point(ouvertR ? 'var(--color-success)' : 'var(--color-text-tertiary)')} />
                    {ouvertR ? 'Ouvert' : 'Fermé'}
                  </span>
                  <button type="button" onClick={() => basculer(r)} style={s.boutonSec}>{ouvertR ? 'Fermer' : 'Ouvrir'}</button>
                  <button type="button" onClick={() => supprimer(r)} style={s.boutonDanger}>Supprimer</button>
                </div>
              )
            })}
          </div>
        )}

        {/* Créer un recueil */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', borderTop: '0.5px solid var(--color-border)', paddingTop: 16 }}>
          <div>
            <label style={s.label}>Nom du recueil</label>
            <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex. : 1er trimestre" style={{ ...s.input, width: 200 }} />
          </div>
          <div>
            <label style={s.label}>Semaine de début</label>
            <select value={semDebut} onChange={e => setSemDebut(Number(e.target.value))} style={s.select}>
              {semainesAnnee.map(sm => <option key={sm.num} value={sm.num}>{sm.label}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Semaine de fin</label>
            <select value={semFin} onChange={e => setSemFin(Number(e.target.value))} style={s.select}>
              {semainesAnnee.map(sm => <option key={sm.num} value={sm.num}>{sm.label}</option>)}
            </select>
          </div>
          <button type="button" onClick={creer} style={s.bouton}>Créer le recueil</button>
        </div>
      </div>

      {recueil && (
        <>
          <div style={{ marginBottom: 16 }} className="no-print">
            <button type="button" onClick={() => window.print()} style={s.bouton}>
              Imprimer les desiderata des associés
            </button>
          </div>

          {/* Board des associés */}
          <div style={s.grille} className="no-print">
            {lignes.map(l => (
              <button key={l.ini} type="button" onClick={() => setOuvert(prev => prev === l.ini ? null : l.ini)} style={s.carte(ouvert === l.ini)} disabled={!l.relie}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>{l.ini}</span>
                <span style={s.pastille(couleurStatut(l))}>
                  <span style={s.point(couleurStatut(l))} />
                  {texteStatut(l)}
                </span>
                {l.majLe && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    {new Date(l.majLe).toLocaleDateString('fr-FR')}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Panneau récap */}
          {ouvert && (
            <div style={s.panneau} className="no-print">
              <RecapDesiderata initiales={ouvert} d={lignes.find(l => l.ini === ouvert).data} annee={annee} />
            </div>
          )}

          {/* Vue imprimable */}
          <div className="zone-impression">
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
              Desiderata — {recueil.nom} ({annee}, S{recueil.semaine_debut}→S{recueil.semaine_fin})
            </h2>
            {lignes.map(l => (
              <div key={l.ini} style={{ marginBottom: 24 }}>
                <RecapDesiderata initiales={l.ini} d={l.data} annee={annee} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
