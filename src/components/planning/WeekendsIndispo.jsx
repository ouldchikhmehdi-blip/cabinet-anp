import { moisAnneeFR } from '../../utils/calendrier'

/**
 * WeekendsIndispo — pour chaque week-end de la période, l'associé coche s'il est
 * INDISPONIBLE. Simple et épuré (§11B simplifié), découpé par mois.
 *
 * Option « veille » : pour un week-end coché indisponible, l'associé peut en plus demander
 * à ne PAS être de garde ni d'astreinte le VENDREDI qui précède (la veille du week-end bloqué).
 *
 * Props :
 *   weekends   — [{ num, samedi, label }] (issu de weekendsDansPlage)
 *   selection  — number[] (n° de semaine des week-ends indisponibles)
 *   onChange   — (nouvelleSelection: number[]) => void
 *   semainesScolaires — number[] : week-ends en vacances scolaires (non sélectionnables ;
 *                       les congés s'y gèrent dans « Préférence vacances scolaires »)
 *   veille          — number[] : sous-ensemble de `selection` où la veille (vendredi) est aussi bloquée
 *   onChangeVeille  — (nouvelleVeille: number[]) => void
 */
export default function WeekendsIndispo({ weekends, selection, onChange, semainesScolaires = [], veille = [], onChangeVeille }) {
  const scolSet = new Set(semainesScolaires)
  const veilleSet = new Set(veille)

  function toggle(num) {
    // On autorise toujours le décochage (répare un état ancien) ; on bloque seulement l'ajout.
    if (selection.includes(num)) {
      onChange(selection.filter(n => n !== num))
      if (veilleSet.has(num)) onChangeVeille?.(veille.filter(n => n !== num)) // la veille suit le WE retiré
      return
    }
    if (scolSet.has(num)) return
    onChange([...selection, num].sort((a, b) => a - b))
  }

  function toggleVeille(num) {
    if (veilleSet.has(num)) onChangeVeille?.(veille.filter(n => n !== num))
    else onChangeVeille?.([...veille, num].sort((a, b) => a - b))
  }

  const s = {
    grille: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
      gap: 6,
    },
    item: (actif, scolaire) => ({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: '8px 12px',
      fontSize: 12,
      borderRadius: 'var(--radius-md)',
      border: `0.5px solid ${actif ? 'var(--color-danger)' : scolaire ? '#2D6CB5' : 'var(--color-border)'}`,
      background: actif ? 'var(--color-danger-light)' : scolaire ? '#E3EEF9' : 'var(--color-bg)',
      color: scolaire ? '#2D6CB5' : 'var(--color-text)',
      userSelect: 'none',
    }),
    coche: (scolaire) => ({
      display: 'flex', alignItems: 'center', gap: 8, flex: 1,
      cursor: scolaire ? 'not-allowed' : 'pointer',
    }),
    veille: (on) => ({
      fontSize: 10,
      padding: '2px 8px',
      borderRadius: 999,
      border: `0.5px solid ${on ? 'var(--color-amber)' : 'var(--color-border)'}`,
      background: on ? 'var(--color-amber-light)' : 'transparent',
      color: on ? 'var(--color-amber)' : 'var(--color-text-secondary)',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      fontWeight: on ? 600 : 400,
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
    const scolaire = !actif && scolSet.has(we.num)
    elements.push(
      <div
        key={we.num}
        style={s.item(actif, scolaire)}
        title={scolaire ? 'Vacances scolaires — congés gérés dans « Préférence vacances scolaires »' : undefined}
      >
        <label style={s.coche(scolaire)}>
          <input
            type="checkbox"
            checked={actif}
            disabled={scolaire}
            onChange={() => toggle(we.num)}
            style={{ accentColor: 'var(--color-danger)' }}
          />
          {we.label}
        </label>
        {actif && (
          <button
            type="button"
            onClick={() => toggleVeille(we.num)}
            style={s.veille(veilleSet.has(we.num))}
            title="Ni garde ni astreinte le vendredi qui précède (pas un jour off : vous travaillez ce vendredi)"
          >
            {veilleSet.has(we.num) ? '✓ vendredi sans garde/astreinte' : '+ vendredi'}
          </button>
        )}
      </div>
    )
  }

  return <div style={s.grille}>{elements}</div>
}
