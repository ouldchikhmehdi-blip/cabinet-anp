import { ASSOCIES } from '../../data/associes'

/**
 * IdentiteAnnee — barre de sélection « Je suis : [associé] » + « Année : [2026] ».
 * MVP : simule l'identité de l'associé en attendant le multi-utilisateur Supabase.
 *
 * Props :
 *   moi, onChangeMoi       — initiales de l'associé courant
 *   annee, onChangeAnnee   — année courante (number)
 *   annees                 — liste d'années proposées
 */
export default function IdentiteAnnee({ moi, onChangeMoi, annee, onChangeAnnee, annees = [2025, 2026, 2027] }) {
  const s = {
    barre: {
      display: 'flex',
      gap: 20,
      alignItems: 'flex-end',
      flexWrap: 'wrap',
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 20px',
      marginBottom: 20,
    },
    label: { fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 },
    select: {
      padding: '8px 12px',
      fontSize: 14,
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      outline: 'none',
      minWidth: 120,
    },
  }

  return (
    <div style={s.barre} className="no-print">
      <div>
        <label style={s.label} htmlFor="sel-moi">Je suis</label>
        <select
          id="sel-moi"
          value={moi}
          onChange={e => onChangeMoi(e.target.value)}
          style={s.select}
        >
          {ASSOCIES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div>
        <label style={s.label} htmlFor="sel-annee">Année</label>
        <select
          id="sel-annee"
          value={annee}
          onChange={e => onChangeAnnee(Number(e.target.value))}
          style={s.select}
        >
          {annees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
    </div>
  )
}
