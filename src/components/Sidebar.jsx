import { supabase } from '../lib/supabase'

const navItems = [
  { id: 'vue-globale', label: 'Vue globale', icon: '⊞' },
  { id: 'chiffre-affaires', label: "Chiffre d'affaires", icon: '↗' },
  { id: 'salaries-cdi', label: 'Salariés CDI', icon: '👤' },
  { id: 'remplacants-iade', label: 'Remplaçants IADE', icon: '↺', sub: true },
  { id: 'remplacants-mar', label: 'Remplaçants MAR', icon: '⚕', sub: true },
  { id: 'depenses', label: 'Dépenses', icon: '🧾' },
  { id: 'consultations', label: 'Consultations', icon: '🩺' },
  { id: 'retrocessions', label: 'Virements associés', icon: '⇄' },
  { id: 'tresorerie', label: 'Trésorerie', icon: '🏦' },
  { id: 'regles-virements', label: 'Règles virements', icon: '🏷' },
  { section: true, label: 'Planning' },
  { id: 'planning-desiderata', label: 'Mes desiderata', icon: '📝' },
  { id: 'planning-suivi', label: 'Suivi desiderata', icon: '✅' },
]

// Entrée de navigation admin (ajoutée dynamiquement si admin)
const adminItem = { id: 'admin-users', label: 'Comptes', icon: '🔑' }

export default function Sidebar({ currentPage, onNavigate, masque, onToggleMasque, sombre, onToggleSombre, isAdmin }) {
  const toggleBtn = (active) => ({
    flex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '6px 8px',
    fontSize: 11,
    borderRadius: 'var(--radius-md)',
    border: active ? '0.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
    background: active ? 'var(--color-primary-light)' : 'var(--color-bg)',
    color: active ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  })

  const items = isAdmin ? [...navItems, adminItem] : navItems

  async function deconnecter() {
    await supabase.auth.signOut()
    // AuthContext détecte la déconnexion → App affiche Login
  }

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
        {items.map(item => (
          item.section ? (
            <div
              key={`section-${item.label}`}
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
                padding: '14px 16px 4px',
              }}
            >
              {item.label}
            </div>
          ) : (
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
          )
        ))}
      </nav>

      <div style={{
        padding: '12px 16px',
        borderTop: '0.5px solid var(--color-border)',
        display: 'flex', flexDirection: 'column', gap: 8
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onToggleMasque}
            title={masque ? 'Afficher les montants' : 'Masquer les montants'}
            aria-pressed={masque}
            style={toggleBtn(masque)}
          >
            <span>{masque ? '🙈' : '👁'}</span> Montants
          </button>
          <button
            onClick={onToggleSombre}
            title={sombre ? 'Passer en clair' : 'Passer en sombre'}
            aria-pressed={sombre}
            style={toggleBtn(sombre)}
          >
            <span>{sombre ? '☀️' : '🌙'}</span> Thème
          </button>
        </div>
        <button
          onClick={deconnecter}
          title="Se déconnecter"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '6px 8px',
            fontSize: 11,
            borderRadius: 'var(--radius-md)',
            border: '0.5px solid var(--color-border)',
            background: 'var(--color-bg)',
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer',
            transition: 'all 0.15s',
            width: '100%',
          }}
        >
          ⎋ Déconnexion
        </button>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          8 associés · parts égales
        </div>
      </div>
    </aside>
  )
}
