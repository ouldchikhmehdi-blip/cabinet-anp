/**
 * SelecteurSemaines — grille de cases à cocher pour sélectionner des semaines ISO.
 *
 * Props :
 *   semaines    — [{ num, label }] (issu de listerSemaines)
 *   selection   — number[] (numéros de semaine cochés)
 *   onChange    — (nouvelleSelection: number[]) => void
 *   accent      — 'primary' (défaut) | 'danger' (pour les vacances refusées)
 *   desactivees — number[] : semaines non-sélectionnables (déjà choisies dans l'autre liste)
 */
export default function SelecteurSemaines({ semaines, selection, onChange, accent = 'primary', desactivees = [] }) {
  const couleur = accent === 'danger' ? 'var(--color-danger)' : 'var(--color-primary)'
  const couleurFond = accent === 'danger' ? 'var(--color-danger-light)' : 'var(--color-primary-light)'

  function toggle(num) {
    if (desactivees.includes(num)) return // bloqué : déjà choisi dans l'autre liste
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
    item: (actif, bloque) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 10px',
      fontSize: 12,
      borderRadius: 'var(--radius-md)',
      border: `0.5px solid ${actif ? couleur : 'var(--color-border)'}`,
      background: actif ? couleurFond : 'var(--color-bg)',
      color: bloque ? 'var(--color-text-tertiary)' : 'var(--color-text)',
      cursor: bloque ? 'not-allowed' : 'pointer',
      opacity: bloque ? 0.5 : 1,
      userSelect: 'none',
    }),
  }

  return (
    <div style={s.grille}>
      {semaines.map(sem => {
        const actif = selection.includes(sem.num)
        const bloque = !actif && desactivees.includes(sem.num)
        return (
          <label
            key={sem.num}
            style={s.item(actif, bloque)}
            title={bloque ? 'Déjà sélectionnée dans l\'autre liste' : undefined}
          >
            <input
              type="checkbox"
              checked={actif}
              disabled={bloque}
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
