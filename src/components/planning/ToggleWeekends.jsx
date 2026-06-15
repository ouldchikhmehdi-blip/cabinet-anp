/**
 * ToggleWeekends — statut de disponibilité par week-end (§11B).
 *
 * Props :
 *   weekends  — [{ num, label }] (issu de listerWeekends)
 *   valeurs   — { '<num>': 'dispo'|'indispo'|'garde-ok'|'astreinte-ok' }
 *   onChange  — (nouvellesValeurs) => void
 */
const OPTIONS = [
  { cle: null, libelle: '—', titre: 'Non renseigné' },
  { cle: 'dispo', libelle: 'Dispo', titre: 'Disponible' },
  { cle: 'indispo', libelle: 'Indispo', titre: 'Pas disponible' },
  { cle: 'garde-ok', libelle: 'Garde OK', titre: 'OK pour une garde' },
  { cle: 'astreinte-ok', libelle: 'Astreinte OK', titre: 'OK pour une astreinte' },
]

export default function ToggleWeekends({ weekends, valeurs, onChange }) {
  function definir(num, cle) {
    const copie = { ...valeurs }
    if (cle === null) {
      delete copie[num]
    } else {
      copie[num] = cle
    }
    onChange(copie)
  }

  const s = {
    conteneur: {
      maxHeight: 320,
      overflowY: 'auto',
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
    },
    ligne: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '6px 12px',
      borderBottom: '0.5px solid var(--color-border)',
    },
    label: { fontSize: 12, color: 'var(--color-text-secondary)', width: 150, flexShrink: 0 },
    groupe: { display: 'flex', gap: 4, flexWrap: 'wrap' },
    bouton: (actif) => ({
      padding: '3px 9px',
      fontSize: 11,
      borderRadius: 'var(--radius-md)',
      border: `0.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-border)'}`,
      background: actif ? 'var(--color-primary-light)' : 'var(--color-bg)',
      color: actif ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
      fontWeight: actif ? 600 : 400,
    }),
  }

  return (
    <div style={s.conteneur}>
      {weekends.map(we => {
        const courant = valeurs[we.num] ?? null
        return (
          <div key={we.num} style={s.ligne}>
            <span style={s.label}>{we.label}</span>
            <div style={s.groupe}>
              {OPTIONS.map(opt => (
                <button
                  key={String(opt.cle)}
                  type="button"
                  title={opt.titre}
                  onClick={() => definir(we.num, opt.cle)}
                  style={s.bouton(courant === opt.cle)}
                >
                  {opt.libelle}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
