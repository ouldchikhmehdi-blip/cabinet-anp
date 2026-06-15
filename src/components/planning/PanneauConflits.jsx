// ============================================================
// PanneauConflits — signalement explicite des conflits à arbitrer (Week-ends / Vacances / Réa).
// L'outil n'impose rien (PLANNING.md §13) : il explique le conflit (où, qui, pourquoi) et
// l'arbitrage possible ; le faiseur tranche. Affiché en haut de chaque étape de placement.
//
// Props : conflits = [{ severite:'danger'|'amber', semaine:number, message:string }]
// ============================================================

const ORDRE_SEV = { danger: 0, amber: 1 }

export default function PanneauConflits({ conflits = [] }) {
  if (!conflits || conflits.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--color-success)', marginBottom: 16 }}>
        Aucun conflit à arbitrer ✓
      </div>
    )
  }

  const tries = [...conflits].sort((a, b) =>
    (ORDRE_SEV[a.severite] - ORDRE_SEV[b.severite]) || (a.semaine - b.semaine)
  )

  const s = {
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-danger)',
      borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 16,
    },
    titre: { fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 10 },
    ligne: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginBottom: 7, lineHeight: 1.45 },
    point: (couleur) => ({ flex: '0 0 auto', marginTop: 5, width: 9, height: 9, borderRadius: '50%', background: couleur }),
  }

  return (
    <div style={s.carte}>
      <div style={s.titre}>⚠ Conflits à arbitrer ({tries.length})</div>
      {tries.map((c, i) => (
        <div key={i} style={s.ligne}>
          <span style={s.point(c.severite === 'danger' ? 'var(--color-danger)' : 'var(--color-amber)')} />
          <span style={{ color: 'var(--color-text)' }}>{c.message}</span>
        </div>
      ))}
    </div>
  )
}
