// ============================================================
// CalendrierConges — bandeau mensuel des absences IADE (lecture seule).
// Une ligne par agent absent dans le mois, une colonne par jour.
// Partagé par « Congés de l'équipe » (IADE) et « Congés IADE » (gestion).
//
// Chaque case porte l'abréviation de la NATURE du jour (CP / RF) et prend la
// couleur de son STATUT (ambre = demandé, vert = validé) : les deux informations
// se lisent d'un coup d'œil sans dépendre de la seule couleur.
//
// `heuresSup` (facultatif) ajoute les jours portant des heures supplémentaires,
// affichés « +Xh ». Il n'est passé QUE depuis l'écran de gestion : les heures d'un
// agent ne sont pas montrées à ses collègues dans le calendrier d'équipe.
// Les lignes attendues portent `nom` (comme celles de la RPC iade_calendrier).
// Si un jour porte les deux, le congé prime — comme dans le planning Excel.
// ============================================================
import { moisAnneeFR } from '../../utils/calendrier'
import { joursDuMois, grouperParAgent, absenceDuJour, courtType, libelleTypeDetaille, formatJour, libelleStatut, STATUTS } from '../../utils/iadeConges'

export default function CalendrierConges({ annee, mois, absences = [], heuresSup = [], chargement = false, onNaviguer }) {
  const jours = joursDuMois(annee, mois)

  // Index des heures sup : agent → jour → ligne.
  const hsParAgent = new Map()
  for (const h of heuresSup) {
    if (h.statut === 'refusee') continue
    if (!hsParAgent.has(h.user_id)) hsParAgent.set(h.user_id, new Map())
    const jour = hsParAgent.get(h.user_id)
    // La ligne validée l'emporte sur celle en attente (même règle que les congés).
    if (!jour.has(h.jour) || h.statut === 'validee') jour.set(h.jour, h)
  }

  // Un agent qui n'a que des heures sup ce mois-ci doit apparaître lui aussi.
  const lignes = [...grouperParAgent(absences)]
  for (const [userId, parJour] of hsParAgent) {
    if (lignes.some(l => l.userId === userId)) continue
    const dansLeMois = [...parJour.values()].some(h => jours.some(j => j.iso === h.jour))
    if (!dansLeMois) continue
    lignes.push({ userId, nom: [...parJour.values()][0].nom ?? '—', jours: [] })
  }
  lignes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))

  const cellule = {
    border: '0.5px solid var(--color-border)',
    padding: 0,
    width: 26,
    minWidth: 26,
    height: 28,
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
                    const a  = absenceDuJour(ligne.jours, j.iso)
                    const hs = hsParAgent.get(ligne.userId)?.get(j.iso) ?? null
                    // Le congé prime : la case ne porte qu'une information.
                    const marque = a ?? hs
                    const st = marque ? STATUTS[marque.statut] : null
                    const infobulle = [
                      a  ? `${libelleTypeDetaille(a.type_conge, a.ferie)} · ${formatJour(a.jour)} · ${libelleStatut(a.statut).toLowerCase()}` : null,
                      hs ? `${hs.heures} h supplémentaires · ${libelleStatut(hs.statut).toLowerCase()}` : null,
                    ].filter(Boolean).join(' — ')
                    return (
                      <td
                        key={j.iso}
                        title={infobulle || undefined}
                        style={{
                          ...cellule,
                          background: marque
                            ? st?.fond
                            : j.weekend || j.ferie ? 'var(--color-bg)' : 'transparent',
                          color: st?.couleur,
                          fontWeight: 700,
                          fontSize: 9,
                          letterSpacing: '0.02em',
                        }}
                      >
                        {a ? courtType(a.type_conge) : hs ? `+${hs.heures}` : ''}
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
        <span><strong>CP</strong> congé payé · <strong>RF</strong> récup. jour férié</span>
        <span style={{ color: 'var(--color-success)' }}>fond vert : validé</span>
        <span style={{ color: 'var(--color-amber)' }}>fond ambre : en attente</span>
        <span>Colonnes grisées : week-ends et jours fériés</span>
      </div>
    </div>
  )
}
