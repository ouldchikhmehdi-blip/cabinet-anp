import { useState, useMemo } from 'react'
import { charger } from '../utils/stockage'
import { chargerAnnee, estRempli, CLE_ANNEE, ANNEE_DEFAUT } from '../utils/desiderata'
import { ASSOCIES } from '../data/associes'
import RecapDesiderata from '../components/planning/RecapDesiderata'

export default function PlanningSuivi() {
  const [annee, setAnnee] = useState(() => charger(CLE_ANNEE, ANNEE_DEFAUT))
  const [ouvert, setOuvert] = useState(null) // initiales de l'associé déplié

  // Lecture seule : on lit le localStorage au montage et à chaque changement d'année.
  // (La page est remontée à chaque navigation, les données viennent de la page de saisie.)
  const data = useMemo(() => chargerAnnee(annee), [annee])

  const statuts = useMemo(
    () => ASSOCIES.map(a => ({ a, d: data.associes[a], rempli: estRempli(data.associes[a]) })),
    [data]
  )
  const nbRemplis = statuts.filter(x => x.rempli).length

  const s = {
    barre: {
      display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
      marginBottom: 20,
    },
    select: {
      padding: '8px 12px', fontSize: 14, border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    bouton: {
      padding: '9px 16px', background: 'var(--color-primary)', color: '#fff',
      border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500,
    },
    grille: {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10,
      marginBottom: 24,
    },
    carte: (rempli, actif) => ({
      textAlign: 'left',
      background: 'var(--color-surface)',
      border: `0.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-border)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }),
    pastille: (rempli) => ({
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 12, fontWeight: 500,
      color: rempli ? 'var(--color-success)' : 'var(--color-danger)',
    }),
    point: (rempli) => ({
      width: 9, height: 9, borderRadius: '50%',
      background: rempli ? 'var(--color-success)' : 'var(--color-danger)',
    }),
    panneau: {
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px 24px',
      marginBottom: 24,
    },
  }

  function basculer(a) {
    setOuvert(prev => (prev === a ? null : a))
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Suivi des desiderata</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        {nbRemplis}/{ASSOCIES.length} associés ont transmis leurs desiderata.
      </p>

      <div style={s.barre} className="no-print">
        <div>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
            Année
          </label>
          <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={s.select}>
            {[2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => window.print()} style={{ ...s.bouton, alignSelf: 'flex-end' }}>
          Imprimer / PDF
        </button>
      </div>

      {/* Board 🔴/🟢 */}
      <div style={s.grille} className="no-print">
        {statuts.map(({ a, d, rempli }) => (
          <button key={a} type="button" onClick={() => basculer(a)} style={s.carte(rempli, ouvert === a)}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>{a}</span>
            <span style={s.pastille(rempli)}>
              <span style={s.point(rempli)} />
              {d.rienASignaler ? 'Rien à signaler' : rempli ? 'Transmis' : 'En attente'}
            </span>
            {d.majLe && (
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {new Date(d.majLe).toLocaleDateString('fr-FR')}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Panneau récap de l'associé sélectionné */}
      {ouvert && (
        <div style={s.panneau} className="no-print">
          <RecapDesiderata initiales={ouvert} d={data.associes[ouvert]} annee={annee} />
        </div>
      )}

      {/* Vue imprimable : tous les associés, une section par personne */}
      <div className="zone-impression">
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
          Desiderata — Planning {annee}
        </h2>
        {ASSOCIES.map(a => (
          <div key={a} style={{ marginBottom: 24 }}>
            <RecapDesiderata initiales={a} d={data.associes[a]} annee={annee} />
          </div>
        ))}
      </div>
    </div>
  )
}
