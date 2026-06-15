/**
 * WeekendsIndispo — pour chaque week-end de la période, l'associé coche s'il est
 * INDISPONIBLE. Simple et épuré (§11B simplifié).
 *
 * Props :
 *   weekends  — [{ num, label }] (issu de listerWeekendsPeriode)
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
  }

  return (
    <div style={s.grille}>
      {weekends.map(we => {
        const actif = selection.includes(we.num)
        return (
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
      })}
    </div>
  )
}
