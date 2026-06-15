import { moisAnneeFR } from '../../utils/calendrier'

/**
 * WeekendsIndispo — pour chaque week-end de la période, l'associé coche s'il est
 * INDISPONIBLE. Simple et épuré (§11B simplifié), découpé par mois.
 *
 * Props :
 *   weekends  — [{ num, samedi, label }] (issu de weekendsDansPlage)
 *   selection — number[] (n° de semaine des week-ends indisponibles)
 *   onChange  — (nouvelleSelection: number[]) => void
 */
export default function WeekendsIndispo({ weekends, selection, onChange }) {
  function toggle(num) {
    if (selection.includes(num)) {
      onChange(selection.filter(n => n !== num))
    } else {
      onChange([...selection, num].sort((a, b) => a - b))
    }
  }

  const s = {
    grille: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
      gap: 6,
    },
    item: (actif) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      fontSize: 12,
      borderRadius: 'var(--radius-md)',
      border: `0.5px solid ${actif ? 'var(--color-danger)' : 'var(--color-border)'}`,
      background: actif ? 'var(--color-danger-light)' : 'var(--color-bg)',
      color: 'var(--color-text)',
      cursor: 'pointer',
      userSelect: 'none',
    }),
    moisSep: {
      gridColumn: '1 / -1',
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
      color: 'var(--color-text-secondary)',
      padding: '10px 2px 2px', marginTop: 2,
      borderTop: '0.5px solid var(--color-border)',
    },
  }

  // Construit la liste : séparateur de mois (par le samedi) + cases.
  const elements = []
  let moisPrec = null
  for (const we of weekends) {
    if (we.samedi) {
      const mois = we.samedi.getUTCMonth()
      if (mois !== moisPrec) {
        elements.push(<div key={`m-${we.num}`} style={s.moisSep}>{moisAnneeFR(we.samedi)}</div>)
        moisPrec = mois
      }
    }
    const actif = selection.includes(we.num)
    elements.push(
      <label key={we.num} style={s.item(actif)}>
        <input
          type="checkbox"
          checked={actif}
          onChange={() => toggle(we.num)}
          style={{ accentColor: 'var(--color-danger)' }}
        />
        {we.label}
      </label>
    )
  }

  return <div style={s.grille}>{elements}</div>
}
