import { PERIODES } from '../../utils/calendrier'

/**
 * SelecteurPeriode — barre identité (lecture seule) + année + période ouverte.
 *
 * Props :
 *   initiales            — initiales de l'associé connecté (détectées du compte)
 *   annee, onChangeAnnee — année courante
 *   periode, onChangePeriode — période courante
 *   periodesOuvertes     — string[] des périodes ouvertes pour l'année
 *   annees               — liste d'années proposées
 */
export default function SelecteurPeriode({
  initiales, annee, onChangeAnnee, periode, onChangePeriode,
  periodesOuvertes = [], annees = [2025, 2026, 2027],
}) {
  const s = {
    barre: {
      display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap',
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 20,
    },
    label: { fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 },
    select: {
      padding: '8px 12px', fontSize: 14, border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)',
      outline: 'none', minWidth: 150,
    },
    badge: {
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 14px', fontSize: 14, fontWeight: 600,
      background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)',
      borderRadius: 'var(--radius-md)',
    },
  }

  return (
    <div style={s.barre} className="no-print">
      <div>
        <span style={s.label}>Vous</span>
        <span style={s.badge}>{initiales}</span>
      </div>
      <div>
        <label style={s.label} htmlFor="sel-annee">Année</label>
        <select id="sel-annee" value={annee} onChange={e => onChangeAnnee(Number(e.target.value))} style={s.select}>
          {annees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div>
        <label style={s.label} htmlFor="sel-periode">Période</label>
        <select
          id="sel-periode"
          value={periode ?? ''}
          onChange={e => onChangePeriode(e.target.value)}
          style={s.select}
          disabled={periodesOuvertes.length === 0}
        >
          {periodesOuvertes.length === 0
            ? <option value="">Aucune période ouverte</option>
            : periodesOuvertes.map(p => <option key={p} value={p}>{PERIODES[p]?.label ?? p}</option>)}
        </select>
      </div>
    </div>
  )
}
