import { useState } from 'react'
import { TAXONOMIE, TOUTES_SOUS, catColor } from '../data/categories'

// Menu déroulant 2 niveaux (groupe → sous-catégorie)
export default function SelecteurCategorie({ value, onChange, categoriesDisponibles = TOUTES_SOUS, placeholder = '— Choisir une catégorie —' }) {
  const [ouvert, setOuvert] = useState(false)
  const [groupeOuvert, setGroupeOuvert] = useState(null)

  const groupesDispo = TAXONOMIE
    .map(g => ({ ...g, sous: g.sous.filter(s => categoriesDisponibles.includes(s)) }))
    .filter(g => g.sous.length > 0)

  const triggerStyle = {
    fontSize: 11, padding: '5px 10px',
    borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: value ? 'var(--color-text)' : 'var(--color-text-tertiary)',
    cursor: 'pointer', minWidth: 200, textAlign: 'left',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  }

  const choisir = (cat) => {
    onChange(cat)
    setOuvert(false)
    setGroupeOuvert(null)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button style={triggerStyle} onClick={() => setOuvert(o => !o)}>
        {value
          ? <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, ...catColor(value) }}>{value}</span>
          : <span>{placeholder}</span>}
        <span style={{ fontSize: 9 }}>▾</span>
      </button>

      {ouvert && (
        <>
          <div onClick={() => { setOuvert(false); setGroupeOuvert(null) }} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 11,
            minWidth: 220, maxHeight: 320, overflowY: 'auto',
            background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: '0 6px 20px rgba(0,0,0,0.12)', padding: 4,
          }}>
            {groupesDispo.map(g => {
              const gOuvert = groupeOuvert === g.groupe
              return (
                <div key={g.groupe}>
                  <button
                    onClick={() => setGroupeOuvert(gOuvert ? null : g.groupe)}
                    style={{
                      width: '100%', textAlign: 'left', cursor: 'pointer',
                      fontSize: 12, fontWeight: 500, color: 'var(--color-text)',
                      padding: '7px 10px', border: 'none', borderRadius: 6,
                      background: gOuvert ? 'var(--color-bg)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    {g.groupe}
                    <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{gOuvert ? '▾' : '▸'}</span>
                  </button>
                  {gOuvert && g.sous.map(s => (
                    <button
                      key={s}
                      onClick={() => choisir(s)}
                      style={{
                        width: '100%', textAlign: 'left', cursor: 'pointer',
                        fontSize: 12, color: 'var(--color-text-secondary)',
                        padding: '6px 10px 6px 24px', border: 'none', borderRadius: 6,
                        background: value === s ? 'var(--color-primary-light)' : 'transparent',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
