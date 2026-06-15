import { useState, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEE_DEFAUT } from '../utils/desiderata'
import PlanningCalendrier from './PlanningCalendrier'
import PlanningObjectifs from './PlanningObjectifs'
import PlanningWeekends from './PlanningWeekends'
import PlanningVacances from './PlanningVacances'

// Étapes successives du faiseur (extensible : semaine…).
// Une seule entrée sidebar « Base calendrier » → assistant guidé Précédent/Suivant.
const ETAPES = [
  { id: 'calendrier', titre: 'Base calendrier' },
  { id: 'objectifs', titre: 'Objectifs' },
  { id: 'weekends', titre: 'Week-ends' },
  { id: 'vacances', titre: 'Vacances' },
]

export default function PlanningConstruction() {
  const { profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [i, setI] = useState(0)
  const [annee, setAnnee] = useState(ANNEE_DEFAUT) // partagée entre toutes les étapes
  const [statuts, setStatuts] = useState({})       // { <etapeId>: 'enregistre' | 'modifie' | 'vierge' }

  // Callbacks stables (sinon l'effet de chargement des sous-pages se relancerait à chaque rendu).
  const statutCalendrier = useCallback(st => setStatuts(p => ({ ...p, calendrier: st })), [])
  const statutObjectifs = useCallback(st => setStatuts(p => ({ ...p, objectifs: st })), [])
  const statutWeekends = useCallback(st => setStatuts(p => ({ ...p, weekends: st })), [])
  const statutVacances = useCallback(st => setStatuts(p => ({ ...p, vacances: st })), [])

  // ── Styles ──
  const s = {
    barre: {
      position: 'sticky', top: -24, zIndex: 5,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap',
      background: 'var(--color-bg)', padding: '12px 0 12px',
      borderBottom: '0.5px solid var(--color-border)', marginBottom: 20,
    },
    pills: { display: 'flex', gap: 8, flexWrap: 'wrap' },
    pill: (actif, fait) => ({
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 14px', fontSize: 13, fontWeight: actif ? 600 : 500,
      borderRadius: 'var(--radius-md)', cursor: 'pointer',
      border: `0.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-border)'}`,
      background: actif ? 'var(--color-primary-light)' : 'var(--color-bg)',
      color: actif ? 'var(--color-primary-dark)' : fait ? 'var(--color-text)' : 'var(--color-text-secondary)',
    }),
    // Rond numéroté : vert ✓ si enregistré, ambre • si modifié non enregistré, neutre sinon.
    num: (statut) => {
      const fond = statut === 'enregistre' ? 'var(--color-success)'
        : statut === 'modifie' ? 'var(--color-amber)'
          : 'var(--color-border)'
      const texte = (statut === 'enregistre' || statut === 'modifie') ? '#fff' : 'var(--color-text-secondary)'
      return {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: '50%', fontSize: 11, fontWeight: 700,
        background: fond, color: texte,
      }
    },
    nav: { display: 'flex', gap: 8 },
    boutonNav: (off) => ({
      padding: '8px 16px', fontSize: 13, fontWeight: 500,
      borderRadius: 'var(--radius-md)', cursor: off ? 'default' : 'pointer',
      border: '0.5px solid var(--color-border)', background: 'var(--color-bg)',
      color: 'var(--color-text-secondary)', opacity: off ? 0.4 : 1,
    }),
    boutonSuivant: (off) => ({
      padding: '8px 18px', fontSize: 13, fontWeight: 600,
      borderRadius: 'var(--radius-md)', cursor: off ? 'default' : 'pointer',
      border: 'none', background: 'var(--color-primary)', color: '#fff',
      opacity: off ? 0.4 : 1,
    }),
  }

  if (!estFaiseur) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Construction du planning</h1>
        <div style={{
          background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', padding: 24, color: 'var(--color-text-secondary)', fontSize: 14,
        }}>
          Cette page est réservée au faiseur de planning.
        </div>
      </div>
    )
  }

  const etape = ETAPES[i]
  const premier = i === 0
  const dernier = i === ETAPES.length - 1

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={s.barre}>
        <div style={s.pills}>
          {ETAPES.map((e, idx) => {
            const statut = statuts[e.id]
            const contenu = statut === 'enregistre' ? '✓' : statut === 'modifie' ? '•' : idx + 1
            return (
              <button key={e.id} type="button" onClick={() => setI(idx)} style={s.pill(idx === i, statut === 'enregistre')}>
                <span style={s.num(statut)}>{contenu}</span>
                {e.titre}
              </button>
            )
          })}
        </div>
        <div style={s.nav}>
          <button type="button" disabled={premier} onClick={() => setI(i - 1)} style={s.boutonNav(premier)}>
            ← Précédent
          </button>
          <button type="button" disabled={dernier} onClick={() => setI(i + 1)} style={s.boutonSuivant(dernier)}>
            Suivant →
          </button>
        </div>
      </div>

      {etape.id === 'calendrier' && <PlanningCalendrier annee={annee} onChangeAnnee={setAnnee} onStatut={statutCalendrier} />}
      {etape.id === 'objectifs' && <PlanningObjectifs annee={annee} onChangeAnnee={setAnnee} onStatut={statutObjectifs} />}
      {etape.id === 'weekends' && <PlanningWeekends annee={annee} onChangeAnnee={setAnnee} onStatut={statutWeekends} />}
      {etape.id === 'vacances' && <PlanningVacances annee={annee} onChangeAnnee={setAnnee} onStatut={statutVacances} />}
    </div>
  )
}
