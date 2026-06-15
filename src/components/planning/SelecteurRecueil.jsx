import { ANNEES } from '../../utils/calendrier'

/**
 * SelecteurRecueil — barre identité (lecture seule) + année + recueil ouvert.
 *
 * Props :
 *   initiales              — initiales de l'associé connecté
 *   annee, onChangeAnnee   — année courante
 *   recueilId, onChangeRecueil — recueil sélectionné (id)
 *   recueils               — recueils OUVERTS de l'année [{ id, nom, semaine_debut, semaine_fin }]
 */
export default function SelecteurRecueil({
  initiales, annee, onChangeAnnee, recueilId, onChangeRecueil, recueils = [],
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
      outline: 'none', minWidth: 180,
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
          {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div>
        <label style={s.label} htmlFor="sel-recueil">Recueil</label>
        <select
          id="sel-recueil"
          value={recueilId ?? ''}
          onChange={e => onChangeRecueil(e.target.value)}
          style={s.select}
          disabled={recueils.length === 0}
        >
          {recueils.length === 0
            ? <option value="">Aucun recueil ouvert</option>
            : recueils.map(r => (
              <option key={r.id} value={r.id}>
                {r.nom} (S{r.semaine_debut}→S{r.semaine_fin})
              </option>
            ))}
        </select>
      </div>
    </div>
  )
}
