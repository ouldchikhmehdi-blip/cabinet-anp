// ============================================================
// CalendrierConges — bandeau mensuel des absences IADE (lecture seule).
// Une ligne par agent absent dans le mois, une colonne par jour.
// Partagé par « Congés de l'équipe » (IADE) et « Demandes IADE » (gestion).
// ============================================================
import { moisAnneeFR } from '../../utils/calendrier'
import { joursDuMois, grouperParAgent, absenceDuJour, libelleType, formatPeriode, STATUTS } from '../../utils/iadeConges'

export default function CalendrierConges({ annee, mois, absences = [], chargement = false, onNaviguer }) {
  const jours = joursDuMois(annee, mois)
  const lignes = grouperParAgent(absences)

  const cellule = {
    border: '0.5px solid var(--color-border)',
    padding: 0,
    width: 22,
    minWidth: 22,
    height: 26,
    textAlign: 'center',
    fontSize: 10,
  }

  const boutonNav = {
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  }

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px',
        borderBottom: '0.5px solid var(--color-border)',
      }}>
        <button type="button" style={boutonNav} onClick={() => onNaviguer?.(-1)}>‹ Mois précédent</button>
        <div style={{ fontSize: 14, fontWeight: 600, minWidth: 150, textAlign: 'center' }}>
          {moisAnneeFR(new Date(Date.UTC(annee, mois, 1)))}
        </div>
        <button type="button" style={boutonNav} onClick={() => onNaviguer?.(1)}>Mois suivant ›</button>
      </div>

      {chargement ? (
        <div style={{ padding: 20, fontSize: 13, color: 'var(--color-text-secondary)' }}>Chargement…</div>
      ) : lignes.length === 0 ? (
        <div style={{ padding: 20, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Aucune absence ce mois-ci.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{
                  ...cellule,
                  width: 150, minWidth: 150, textAlign: 'left',
                  padding: '4px 10px',
                  fontSize: 11, fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                  position: 'sticky', left: 0, zIndex: 1,
                  background: 'var(--color-surface)',
                }}>
                  Agent
                </th>
                {jours.map(j => (
                  <th key={j.iso} style={{
                    ...cellule,
                    fontWeight: 500,
                    color: j.weekend || j.ferie ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                    background: j.weekend || j.ferie ? 'var(--color-bg)' : 'transparent',
                  }}>
                    {j.numero}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map(ligne => (
                <tr key={ligne.userId}>
                  <td style={{
                    ...cellule,
                    width: 150, minWidth: 150, textAlign: 'left',
                    padding: '4px 10px',
                    fontSize: 12,
                    color: 'var(--color-text)',
                    whiteSpace: 'nowrap',
                    position: 'sticky', left: 0, zIndex: 1,
                    background: 'var(--color-surface)',
                  }}>
                    {ligne.nom}
                  </td>
                  {jours.map(j => {
                    const a = absenceDuJour(ligne.absences, j.iso)
                    const st = a ? STATUTS[a.statut] : null
                    return (
                      <td
                        key={j.iso}
                        title={a ? `${libelleType(a.type_conge)} · ${formatPeriode(a.date_debut, a.date_fin)} · ${st?.label}` : undefined}
                        style={{
                          ...cellule,
                          background: a
                            ? st?.fond
                            : j.weekend || j.ferie ? 'var(--color-bg)' : 'transparent',
                          color: st?.couleur,
                          fontWeight: 600,
                        }}
                      >
                        {a ? (a.statut === 'validee' ? '●' : '○') : ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap',
        padding: '10px 16px',
        borderTop: '0.5px solid var(--color-border)',
        fontSize: 11, color: 'var(--color-text-tertiary)',
      }}>
        <span style={{ color: 'var(--color-success)' }}>● congé validé</span>
        <span style={{ color: 'var(--color-amber)' }}>○ demande en attente</span>
        <span>Colonnes grisées : week-ends et jours fériés</span>
      </div>
    </div>
  )
}
