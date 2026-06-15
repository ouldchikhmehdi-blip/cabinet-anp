import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ASSOCIES } from '../data/associes'
import { LISTE_PERIODES, PERIODES } from '../utils/calendrier'
import { desiderataVide, normaliser, estRempli, ANNEE_DEFAUT } from '../utils/desiderata'
import {
  chargerTousDesiderata, chargerProfilsAvecInitiales,
  listerPeriodes, ouvrirPeriode, fermerPeriode,
} from '../utils/desiderataApi'
import RecapDesiderata from '../components/planning/RecapDesiderata'

export default function PlanningSuivi() {
  const { session, profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [annee, setAnnee] = useState(ANNEE_DEFAUT)
  const [periode, setPeriode] = useState(LISTE_PERIODES[0])
  const [periodes, setPeriodes] = useState([])      // recueils { periode, statut }
  const [profils, setProfils] = useState([])        // profils avec initiales
  const [desideratas, setDesideratas] = useState([]) // lignes desiderata (année,période)
  const [ouvert, setOuvert] = useState(null)
  const [erreur, setErreur] = useState(null)

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
    listerPeriodes(annee)
      .then(p => { if (!annule) setPeriodes(p) })
      .catch(() => { if (!annule) setErreur('Impossible de charger les recueils.') })
    return () => { annule = true }
  }, [annee, estFaiseur])

  // Desiderata de (année, période)
  useEffect(() => {
    if (!estFaiseur || !periode) return
    let annule = false
    chargerTousDesiderata(annee, periode)
      .then(d => { if (!annule) setDesideratas(d) })
      .catch(() => { if (!annule) setErreur('Impossible de charger les desiderata.') })
    return () => { annule = true }
  }, [annee, periode, estFaiseur])

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
      soumis: dd?.soumis ?? false,
      majLe: dd?.updated_at ?? null,
      rempli: dd ? estRempli(data, dd.soumis) : false,
    }
  }), [profilParInitiales, desiderataParUser])

  const nbRemplis = lignes.filter(l => l.rempli).length
  const statutPeriode = (p) => periodes.find(x => x.periode === p)?.statut ?? 'ferme'

  async function basculerRecueil(p) {
    setErreur(null)
    try {
      if (statutPeriode(p) === 'ouvert') {
        await fermerPeriode(annee, p)
      } else {
        await ouvrirPeriode(annee, p, session.user.id)
      }
      setPeriodes(await listerPeriodes(annee))
    } catch {
      setErreur('Action impossible (réservée au faiseur).')
    }
  }

  // ── Styles ──
  const s = {
    select: {
      padding: '8px 12px', fontSize: 14, border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    bouton: {
      padding: '9px 16px', background: 'var(--color-primary)', color: '#fff',
      border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500,
    },
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
        {nbRemplis}/{ASSOCIES.length} associés ont transmis leurs desiderata pour {PERIODES[periode]?.label} {annee}.
      </p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }} className="no-print">
        <div>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Année</label>
          <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={s.select}>
            {[2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Période</label>
          <select value={periode} onChange={e => setPeriode(e.target.value)} style={s.select}>
            {LISTE_PERIODES.map(p => <option key={p} value={p}>{PERIODES[p]?.label}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => window.print()} style={s.bouton}>Imprimer / PDF</button>
      </div>

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }} className="no-print">
          {erreur}
        </div>
      )}

      {/* Recueils : ouvrir / fermer chaque période */}
      <div style={s.carteSection} className="no-print">
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Recueils {annee}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {LISTE_PERIODES.map(p => {
            const ouvertP = statutPeriode(p) === 'ouvert'
            return (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                <span style={{ fontSize: 13 }}>{PERIODES[p]?.label}</span>
                <span style={s.pastille(ouvertP ? 'var(--color-success)' : 'var(--color-text-tertiary)')}>
                  <span style={s.point(ouvertP ? 'var(--color-success)' : 'var(--color-text-tertiary)')} />
                  {ouvertP ? 'Ouvert' : 'Fermé'}
                </span>
                <button
                  type="button"
                  onClick={() => basculerRecueil(p)}
                  style={{ ...s.bouton, padding: '5px 10px', fontSize: 12, background: ouvertP ? 'transparent' : 'var(--color-primary)', color: ouvertP ? 'var(--color-text-secondary)' : '#fff', border: ouvertP ? '0.5px solid var(--color-border)' : 'none' }}
                >
                  {ouvertP ? 'Fermer' : 'Ouvrir'}
                </button>
              </div>
            )
          })}
        </div>
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

      {/* Panneau récap de l'associé sélectionné */}
      {ouvert && (
        <div style={s.panneau} className="no-print">
          <RecapDesiderata initiales={ouvert} d={lignes.find(l => l.ini === ouvert).data} annee={annee} />
        </div>
      )}

      {/* Vue imprimable : tous les associés reliés, une section par personne */}
      <div className="zone-impression">
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
          Desiderata — {PERIODES[periode]?.label} {annee}
        </h2>
        {lignes.filter(l => l.relie).map(l => (
          <div key={l.ini} style={{ marginBottom: 24 }}>
            <RecapDesiderata initiales={l.ini} d={l.data} annee={annee} />
          </div>
        ))}
      </div>
    </div>
  )
}
