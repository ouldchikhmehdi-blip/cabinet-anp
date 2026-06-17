// ============================================================
// SyntheseColonnesEte.jsx — aide à la décision pour le faiseur (recueil d'été).
// Agrège, PAR COLONNE de la grille d'été, les préférences de tous les associés :
// qui la veut en prioritaire (avec son rang), qui peut la faire, qui l'évite.
// Signale les conflits (≥2 prioritaires) et les colonnes sans preneur. Pas d'attribution
// automatique : on éclaire, le faiseur arbitre.
// ============================================================

// Statut d'une colonne selon le nombre de prioritaires / possibles.
// Fonds via variables CSS thème-aware (lisibles en clair comme en sombre).
function statutColonne(nbPrio, nbPoss) {
  if (nbPrio >= 2) return { cle: 'conflit', label: 'Conflit', couleur: 'var(--color-danger)', fond: 'var(--color-danger-light)', icone: '🔴' }
  if (nbPrio === 1) return { cle: 'ok', label: 'Attribuable', couleur: 'var(--color-success)', fond: 'var(--color-success-light)', icone: '🟢' }
  if (nbPoss > 0) return { cle: 'dispo', label: 'Disponible', couleur: 'var(--color-primary)', fond: 'var(--color-primary-light)', icone: '🔵' }
  return { cle: 'vide', label: 'Sans preneur', couleur: 'var(--color-amber)', fond: 'var(--color-amber-light)', icone: '🟠' }
}

export default function SyntheseColonnesEte({ colonnes = [], associes = [] }) {
  if (colonnes.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Publiez la trame d'été pour voir la synthèse par colonne.</div>
  }

  // Agrégation par colonne.
  const parColonne = colonnes.map(col => {
    const prioritaires = []
    const possibles = []
    const refus = []
    for (const a of associes) {
      const p = a.pref ?? {}
      const rang = (p.prioritaires ?? []).indexOf(col.key)
      if (rang !== -1) prioritaires.push({ ini: a.ini, rang: rang + 1 })
      else if ((p.possibles ?? []).includes(col.key)) possibles.push(a.ini)
      else if ((p.refusees ?? []).includes(col.key)) refus.push(a.ini)
    }
    prioritaires.sort((x, y) => x.rang - y.rang)
    return { col, prioritaires, possibles, refus, statut: statutColonne(prioritaires.length, possibles.length) }
  })

  const nbConflits = parColonne.filter(c => c.statut.cle === 'conflit').length
  const nbVides = parColonne.filter(c => c.statut.cle === 'vide').length

  // Associés reliés n'ayant transmis aucun choix de colonne.
  const sansChoix = associes
    .filter(a => {
      const p = a.pref ?? {}
      return (p.prioritaires?.length ?? 0) === 0 && (p.possibles?.length ?? 0) === 0 && (p.refusees?.length ?? 0) === 0
    })
    .map(a => a.ini)

  const th = {
    padding: '7px 10px', fontSize: 12, fontWeight: 600, textAlign: 'left',
    color: 'var(--color-text-secondary)', borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap',
  }
  const td = {
    padding: '7px 10px', fontSize: 13, color: 'var(--color-text)', verticalAlign: 'top',
    borderBottom: '0.5px solid var(--color-border)',
  }

  return (
    <div className="recap-synthese-ete">
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
        Synthèse par colonne — été
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
        {parColonne.length} colonne{parColonne.length > 1 ? 's' : ''}
        {' · '}
        <span style={{ color: nbConflits ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
          {nbConflits} conflit{nbConflits > 1 ? 's' : ''}
        </span>
        {' · '}
        <span style={{ color: nbVides ? 'var(--color-amber)' : 'var(--color-text-secondary)' }}>
          {nbVides} sans preneur
        </span>
      </div>

      <div style={{ overflowX: 'auto', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={th}>Colonne</th>
              <th style={th}>⭐ Prioritaires (rang)</th>
              <th style={th}>👍 Possibles</th>
              <th style={th}>🚫 À éviter</th>
              <th style={th}>Statut</th>
            </tr>
          </thead>
          <tbody>
            {parColonne.map(({ col, prioritaires, possibles, refus, statut }) => (
              <tr key={col.key} style={{ background: statut.fond, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                <td style={{ ...td, fontWeight: 600 }}>{col.label}</td>
                <td style={td}>
                  {prioritaires.length === 0
                    ? <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                    : prioritaires.map(p => `${p.ini} (${p.rang}ᵉ)`).join(', ')}
                </td>
                <td style={td}>
                  {possibles.length === 0 ? <span style={{ color: 'var(--color-text-tertiary)' }}>—</span> : possibles.join(', ')}
                </td>
                <td style={td}>
                  {refus.length === 0 ? <span style={{ color: 'var(--color-text-tertiary)' }}>—</span> : refus.join(', ')}
                </td>
                <td style={td}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: statut.couleur, whiteSpace: 'nowrap' }}>
                    {statut.icone} {statut.label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sansChoix.length > 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: 10 }}>
          <strong>Sans choix transmis :</strong> {sansChoix.join(', ')}
        </div>
      )}
    </div>
  )
}
