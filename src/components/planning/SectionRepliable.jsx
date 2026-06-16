import { useState } from 'react'

/**
 * SectionRepliable — carte dont le contenu se replie/déplie (allègement visuel).
 * En-tête cliquable : chevron + titre + résumé (affiché quand replié).
 *
 * Props :
 *   titre          — string (en-tête)
 *   resume         — ReactNode|string (aperçu affiché quand la section est repliée)
 *   ouvertParDefaut— bool (défaut false : replié)
 *   children       — contenu (masqué quand replié)
 */
export default function SectionRepliable({ titre, resume = null, ouvertParDefaut = false, children }) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut)

  const s = {
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '14px 20px', marginBottom: 16,
    },
    entete: {
      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
      border: 'none', background: 'transparent', padding: 0, width: '100%', textAlign: 'left',
    },
    chevron: { fontSize: 12, color: 'var(--color-text-secondary)', width: 12, flex: '0 0 auto' },
    titre: { fontSize: 14, fontWeight: 600, color: 'var(--color-text)' },
    resume: { fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 'auto', textAlign: 'right' },
    corps: { marginTop: 14 },
  }

  return (
    <div style={s.carte}>
      <button type="button" onClick={() => setOuvert(o => !o)} style={s.entete}>
        <span style={s.chevron}>{ouvert ? '▾' : '▸'}</span>
        <span style={s.titre}>{titre}</span>
        {!ouvert && resume != null && <span style={s.resume}>{resume}</span>}
      </button>
      {ouvert && <div style={s.corps}>{children}</div>}
    </div>
  )
}
