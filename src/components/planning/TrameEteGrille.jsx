// ============================================================
// TrameEteGrille.jsx — rendu fidèle d'une grille d'été (collée depuis Excel par le faiseur).
// 1ʳᵉ colonne = dates ; colonnes suivantes (B, C…) = postes déjà placés, avec leur fond de couleur.
// En lecture seule par défaut ; les en-têtes de colonne peuvent être cliquables (choix associé) et
// surlignés selon le niveau de préférence choisi.
// ============================================================

// Couleur d'accent par niveau de préférence (en-tête de colonne).
const ACCENT = {
  prioritaire: { bord: 'var(--color-success)', fond: 'var(--color-success-light, #e7f6ee)' },
  possible: { bord: '#2D6CB5', fond: '#e8f0fa' },
  refus: { bord: 'var(--color-danger)', fond: 'var(--color-danger-light, #fdecec)' },
}

export default function TrameEteGrille({
  colonnes = [],
  lignes = [],
  niveauParColonne = {},
  rangParColonne = {},
  onSelectColonne = null,
}) {
  if (colonnes.length === 0 || lignes.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Grille vide.</div>
  }

  const thBase = {
    padding: '6px 8px', fontSize: 12, fontWeight: 600, textAlign: 'center',
    borderBottom: '0.5px solid var(--color-border)', borderLeft: '0.5px solid var(--color-border)',
    color: 'var(--color-text)', whiteSpace: 'nowrap', position: 'sticky', top: 0,
    background: 'var(--color-surface)', zIndex: 1,
  }
  const tdDate = {
    padding: '3px 8px', fontSize: 11, color: 'var(--color-text-secondary)',
    borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap',
  }
  const tdCell = {
    padding: '3px 8px', fontSize: 11, textAlign: 'center', color: '#111',
    borderBottom: '0.5px solid var(--color-border)', borderLeft: '0.5px solid var(--color-border)',
    minWidth: 54, whiteSpace: 'nowrap',
  }

  return (
    <div style={{ overflowX: 'auto', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...thBase, textAlign: 'left' }}>Date</th>
            {colonnes.map(col => {
              const niveau = niveauParColonne[col.key] || ''
              const accent = ACCENT[niveau]
              const rang = rangParColonne[col.key] ?? null
              return (
                <th
                  key={col.key}
                  onClick={onSelectColonne ? () => onSelectColonne(col.key) : undefined}
                  style={{
                    ...thBase,
                    cursor: onSelectColonne ? 'pointer' : 'default',
                    background: accent ? accent.fond : thBase.background,
                    borderTop: accent ? `2px solid ${accent.bord}` : '2px solid transparent',
                  }}
                  title={onSelectColonne ? 'Cliquer pour faire défiler le niveau de préférence' : undefined}
                >
                  {col.label}
                  {niveau === 'prioritaire' && rang != null && (
                    <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--color-success)' }}>#{rang}</span>
                  )}
                  {niveau === 'possible' && <span style={{ marginLeft: 4, fontSize: 10 }}>👍</span>}
                  {niveau === 'refus' && <span style={{ marginLeft: 4, fontSize: 10 }}>🚫</span>}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne, r) => (
            <tr key={r}>
              <td style={tdDate}>{ligne.dateLabel}</td>
              {colonnes.map((col, c) => {
                const cell = ligne.cells[c] ?? { texte: '', couleur: '' }
                return (
                  <td key={col.key} style={{ ...tdCell, background: cell.couleur || 'transparent' }}>
                    {cell.texte}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
