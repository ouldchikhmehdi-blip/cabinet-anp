import { moisAnneeFR } from '../../utils/calendrier'

const JOUR_MS = 24 * 60 * 60 * 1000

/**
 * SelecteurSemaines — grille de cases à cocher pour sélectionner des semaines ISO,
 * découpée par mois (séparateur « Mars 2026 » au changement de mois).
 *
 * Props :
 *   semaines    — [{ num, lundi, label }] (issu de semainesDansPlage / listerSemaines)
 *   selection   — number[] (numéros de semaine cochés)
 *   onChange    — (nouvelleSelection: number[]) => void
 *   accent      — 'primary' (défaut) | 'danger' (pour les vacances refusées)
 *   desactivees — number[] : semaines non-sélectionnables (déjà choisies dans l'autre liste)
 *   semainesScolaires — number[] : semaines de vacances scolaires (gérées ailleurs, bloquées)
 */
export default function SelecteurSemaines({ semaines, selection, onChange, accent = 'primary', desactivees = [], semainesScolaires = [] }) {
  const couleur = accent === 'danger' ? 'var(--color-danger)' : 'var(--color-primary)'
  const couleurFond = accent === 'danger' ? 'var(--color-danger-light)' : 'var(--color-primary-light)'

  function toggle(num) {
    if (desactivees.includes(num) || semainesScolaires.includes(num)) return // bloqué
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
    item: (actif, bloque, scolaire) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 10px',
      fontSize: 12,
      borderRadius: 'var(--radius-md)',
      border: `0.5px solid ${actif ? couleur : scolaire ? '#2D6CB5' : 'var(--color-border)'}`,
      background: actif ? couleurFond : scolaire ? '#E3EEF9' : 'var(--color-bg)',
      color: scolaire ? '#2D6CB5' : bloque ? 'var(--color-text-tertiary)' : 'var(--color-text)',
      cursor: (bloque || scolaire) ? 'not-allowed' : 'pointer',
      opacity: (bloque && !scolaire) ? 0.5 : 1,
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

  // Construit la liste : séparateur de mois (rattachement par le jeudi) + cases.
  const elements = []
  let moisPrec = null
  for (const sem of semaines) {
    if (sem.lundi) {
      const jeudi = new Date(sem.lundi.getTime() + 3 * JOUR_MS)
      const mois = jeudi.getUTCMonth()
      if (mois !== moisPrec) {
        elements.push(<div key={`m-${sem.num}`} style={s.moisSep}>{moisAnneeFR(jeudi)}</div>)
        moisPrec = mois
      }
    }
    const actif = selection.includes(sem.num)
    const scolaire = semainesScolaires.includes(sem.num)
    const bloque = !actif && (desactivees.includes(sem.num) || scolaire)
    elements.push(
      <label
        key={sem.num}
        style={s.item(actif, bloque, scolaire)}
        title={scolaire
          ? 'Vacances scolaires — à gérer dans « Préférence vacances scolaires »'
          : bloque ? 'Déjà sélectionnée dans l\'autre liste' : undefined}
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
  }

  return <div style={s.grille}>{elements}</div>
}
