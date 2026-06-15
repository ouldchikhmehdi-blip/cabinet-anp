/**
 * SelecteurSemaines — grille de cases à cocher pour sélectionner des semaines ISO.
 *
 * Props :
 *   semaines    — [{ num, label }] (issu de listerSemaines)
 *   selection   — number[] (numéros de semaine cochés)
 *   onChange    — (nouvelleSelection: number[]) => void
 *   accent      — 'primary' (défaut) | 'danger' (pour les vacances refusées)
 *   surligner   — number[] : semaines à signaler visuellement (ex. présentes dans l'autre liste)
 */
export default function SelecteurSemaines({ semaines, selection, onChange, accent = 'primary', surligner = [] }) {
  const couleur = accent === 'danger' ? 'var(--color-danger)' : 'var(--color-primary)'
  const couleurFond = accent === 'danger' ? 'var(--color-danger-light)' : 'var(--color-primary-light)'

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
      gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
      gap: 6,
    },
    item: (actif, alerte) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 10px',
      fontSize: 12,
      borderRadius: 'var(--radius-md)',
      border: `0.5px solid ${actif ? couleur : alerte ? 'var(--color-amber)' : 'var(--color-border)'}`,
      background: actif ? couleurFond : alerte ? 'var(--color-amber-light)' : 'var(--color-bg)',
      color: 'var(--color-text)',
      cursor: 'pointer',
      userSelect: 'none',
    }),
  }

  return (
    <div style={s.grille}>
      {semaines.map(sem => {
        const actif = selection.includes(sem.num)
        const alerte = !actif && surligner.includes(sem.num)
        return (
          <label key={sem.num} style={s.item(actif, alerte)}>
            <input
              type="checkbox"
              checked={actif}
              onChange={() => toggle(sem.num)}
              style={{ accentColor: couleur }}
            />
            {sem.label}
          </label>
        )
      })}
    </div>
  )
}
