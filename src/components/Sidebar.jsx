import { useState } from 'react'

const navItems = [
  { id: 'vue-globale', label: 'Vue globale', icon: '⊞' },
  { id: 'chiffre-affaires', label: "Chiffre d'affaires", icon: '↗' },
  { id: 'salaries-cdi', label: 'Salariés CDI', icon: '👤' },
  { id: 'remplacants-iade', label: 'Remplaçants IADE', icon: '↺', sub: true },
  { id: 'remplacants-mar', label: 'Remplaçants MAR', icon: '⚕', sub: true },
  { id: 'depenses', label: 'Dépenses', icon: '🧾' },
  { id: 'retrocessions', label: 'Rétrocessions', icon: '⇄' },
  { id: 'tresorerie', label: 'Trésorerie', icon: '🏦' },
  { id: 'regles-virements', label: 'Règles virements', icon: '🏷' },
]

export default function Sidebar({ currentPage, onNavigate }) {
  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      background: 'var(--color-surface)',
      borderRight: '0.5px solid var(--color-border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      height: '100vh',
      overflow: 'auto'
    }}>
      <div style={{
        padding: '20px 16px 12px',
        borderBottom: '0.5px solid var(--color-border)'
      }}>
        <div style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--color-primary)',
          letterSpacing: '0.02em'
        }}>SARM</div>
        <div style={{
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          marginTop: 2
        }}>Service Anesthésie Réanimation Millénaire</div>
      </div>

      <nav style={{ padding: '8px 0', flex: 1 }}>
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => !item.disabled && onNavigate(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: item.sub ? '7px 16px 7px 28px' : '8px 16px',
              fontSize: item.sub ? 12 : 13,
              fontWeight: currentPage === item.id ? 500 : 400,
              color: item.disabled
                ? 'var(--color-text-tertiary)'
                : currentPage === item.id
                  ? 'var(--color-primary)'
                  : 'var(--color-text-secondary)',
              background: currentPage === item.id
                ? 'var(--color-primary-light)'
                : 'transparent',
              border: 'none',
              borderLeft: currentPage === item.id
                ? '2px solid var(--color-primary)'
                : '2px solid transparent',
              textAlign: 'left',
              cursor: item.disabled ? 'default' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            {item.label}
            {item.disabled && (
              <span style={{
                marginLeft: 'auto',
                fontSize: 10,
                background: 'var(--color-bg)',
                color: 'var(--color-text-tertiary)',
                padding: '1px 6px',
                borderRadius: 10
              }}>bientôt</span>
            )}
          </button>
        ))}
      </nav>

      <div style={{
        padding: '12px 16px',
        borderTop: '0.5px solid var(--color-border)',
        fontSize: 11,
        color: 'var(--color-text-tertiary)'
      }}>
        8 associés · parts égales
      </div>
    </aside>
  )
}