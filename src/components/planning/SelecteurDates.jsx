import { useState } from 'react'
import { parseISO, formatDateLongueFR } from '../../utils/calendrier'

/**
 * SelecteurDates — ajout/suppression de dates précises (bornées à l'année).
 *
 * Props :
 *   dates     — string[] au format 'YYYY-MM-DD'
 *   onChange  — (nouvellesDates: string[]) => void
 *   annee     — number (borne min/max du sélecteur)
 *   accent    — 'primary' (défaut) | 'danger'
 */
export default function SelecteurDates({ dates, onChange, annee, accent = 'primary' }) {
  const [saisie, setSaisie] = useState('')
  const couleur = accent === 'danger' ? 'var(--color-danger)' : 'var(--color-primary)'
  const couleurFond = accent === 'danger' ? 'var(--color-danger-light)' : 'var(--color-primary-light)'

  function ajouter() {
    if (!saisie || dates.includes(saisie)) { setSaisie(''); return }
    onChange([...dates, saisie].sort())
    setSaisie('')
  }

  function retirer(d) {
    onChange(dates.filter(x => x !== d))
  }

  const s = {
    ligne: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: dates.length ? 12 : 0 },
    input: {
      padding: '8px 12px',
      fontSize: 14,
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      outline: 'none',
    },
    bouton: {
      padding: '8px 14px',
      background: couleur,
      color: '#fff',
      border: 'none',
      borderRadius: 'var(--radius-md)',
      fontSize: 13,
      fontWeight: 500,
    },
    chips: { display: 'flex', gap: 6, flexWrap: 'wrap' },
    chip: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      fontSize: 12,
      borderRadius: 999,
      background: couleurFond,
      border: `0.5px solid ${couleur}`,
      color: 'var(--color-text)',
    },
    croix: {
      background: 'none',
      border: 'none',
      color: couleur,
      fontSize: 14,
      lineHeight: 1,
      padding: 0,
    },
  }

  return (
    <div>
      <div style={s.ligne}>
        <input
          type="date"
          value={saisie}
          min={`${annee}-01-01`}
          max={`${annee}-12-31`}
          onChange={e => setSaisie(e.target.value)}
          style={s.input}
        />
        <button type="button" onClick={ajouter} disabled={!saisie} style={s.bouton}>
          Ajouter
        </button>
      </div>
      {dates.length > 0 && (
        <div style={s.chips}>
          {dates.map(d => (
            <span key={d} style={s.chip}>
              {formatDateLongueFR(parseISO(d))}
              <button type="button" onClick={() => retirer(d)} style={s.croix} aria-label={`Retirer ${d}`}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
