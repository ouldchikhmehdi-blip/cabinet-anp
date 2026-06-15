import { useState } from 'react'

/**
 * InfoPlanning — encadré repliable expliquant à l'associé comment se construit
 * le planning : ce qui est automatique vs ce que fait le faiseur (cf. PLANNING.md §13).
 */
export default function InfoPlanning() {
  const [ouvert, setOuvert] = useState(true)

  const s = {
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', marginBottom: 20, overflow: 'hidden',
    },
    entete: {
      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 8, padding: '14px 20px', background: 'transparent', border: 'none',
      fontSize: 14, fontWeight: 600, color: 'var(--color-text)', textAlign: 'left',
    },
    corps: { padding: '0 20px 18px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 },
    sousTitre: { fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginTop: 14, marginBottom: 4 },
    intro: {
      fontSize: 13, color: 'var(--color-text)', background: 'var(--color-primary-light)',
      borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 10,
    },
    liste: { margin: '0 0 0 18px', padding: 0 },
  }

  return (
    <div style={s.carte} className="no-print">
      <button type="button" style={s.entete} onClick={() => setOuvert(v => !v)} aria-expanded={ouvert}>
        <span>Comment se construit le planning ?</span>
        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>{ouvert ? '▲ Masquer' : '▼ Afficher'}</span>
      </button>

      {ouvert && (
        <div style={s.corps}>
          <div style={s.intro}>
            Cet outil est une <strong>aide, pas un robot</strong>. Il ne décide jamais à votre place :
            le faiseur de planning garde la main sur le résultat final.
          </div>

          <div style={s.sousTitre}>Ce que l'outil fait automatiquement</div>
          <ul style={s.liste}>
            <li>rassemble les desiderata de tous les associés ;</li>
            <li>tient à jour les compteurs (gardes, astreintes, réa, week-ends…) par personne et par période ;</li>
            <li>signale les déséquilibres (quota dépassé, écart trop grand entre associés, gardes trop rapprochées, repos non respecté).</li>
          </ul>

          <div style={s.sousTitre}>Ce que fait le faiseur de planning (un humain)</div>
          <ul style={s.liste}>
            <li>définit la structure (semaines type, rotation garde/astreinte avec l'autre groupe, vacances scolaires, fériés) ;</li>
            <li>place les gardes, astreintes, vacances et postes en tenant compte des desiderata, des quotas et de l'équité entre tous ;</li>
            <li>tranche les arbitrages quand tout n'est pas compatible, et valide chaque étape.</li>
          </ul>

          <div style={s.sousTitre}>Vos desiderata</div>
          <ul style={s.liste}>
            <li>sont <strong>facultatifs</strong> (« rien à signaler » est une réponse valable) ;</li>
            <li>sont <strong>privés</strong> : seul le faiseur de planning peut les consulter ;</li>
            <li>sont pris en compte <strong>autant que possible</strong>, sans garantie (les contraintes d'équipe priment).</li>
          </ul>
        </div>
      )}
    </div>
  )
}
