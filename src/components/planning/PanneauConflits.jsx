// ============================================================
// PanneauConflits — encart de points en haut d'une étape de placement (PLANNING.md §13).
// Réutilisable en deux catégories distinctes :
//   - « À arbitrer » (bloquant) : un vrai problème à corriger (non placé, capacité dépassée…) ;
//   - « À surveiller » (non bloquant) : un point à vérifier (pont, gardes rapprochées, souhait ignoré…).
//
// Props : conflits = [{ severite:'danger'|'amber'|'info', semaine:number, message:string }]
//   titre (défaut « À arbitrer »), couleurBordure (défaut danger), messageVide (défaut « Rien à arbitrer ✓ »).
// ============================================================

const ORDRE_SEV = { danger: 0, amber: 1, info: 2 }
const COULEUR_SEV = {
  danger: 'var(--color-danger)',
  amber: 'var(--color-amber)',
  info: 'var(--color-primary)',
}

export default function PanneauConflits({
  conflits = [],
  titre = 'À arbitrer',
  couleurBordure = 'var(--color-danger)',
  messageVide = 'Rien à arbitrer ✓',
}) {
  if (!conflits || conflits.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--color-success)', marginBottom: 16 }}>
        {messageVide}
      </div>
    )
  }

  const tries = [...conflits].sort((a, b) =>
    ((ORDRE_SEV[a.severite] ?? 1) - (ORDRE_SEV[b.severite] ?? 1)) || (a.semaine - b.semaine)
  )

  const s = {
    carte: {
      background: 'var(--color-surface)', border: `0.5px solid ${couleurBordure}`,
      borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 16,
    },
    titre: { fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 10 },
    ligne: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginBottom: 7, lineHeight: 1.45 },
    point: (couleur) => ({ flex: '0 0 auto', marginTop: 5, width: 9, height: 9, borderRadius: '50%', background: couleur }),
  }

  return (
    <div style={s.carte}>
      <div style={s.titre}>{titre} ({tries.length})</div>
      {tries.map((c, i) => (
        <div key={i} style={s.ligne}>
          <span style={s.point(COULEUR_SEV[c.severite] ?? 'var(--color-amber)')} />
          <span style={{ color: 'var(--color-text)' }}>{c.message}</span>
        </div>
      ))}
    </div>
  )
}
