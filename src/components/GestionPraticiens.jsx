import { useState } from 'react'
import { ajouterPraticien, definirMasquePraticien } from '../data/consultations'

/**
 * Panneau de gestion des praticiens d'une spécialité (arrivées / départs).
 *
 * Props :
 *   spec     — objet spécialité courant (avec spec.praticiens)
 *   onChange — callback appelé après chaque modification pour rafraîchir la page
 */
export default function GestionPraticiens({ spec, onChange }) {
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const [gestionOuverte, setGestionOuverte] = useState(false)
  const [fNom, setFNom] = useState('')

  if (!spec.praticiens) return null

  const ajouter = () => {
    if (!fNom.trim()) return
    ajouterPraticien(spec.id, fNom.trim())
    onChange()
    setFNom('')
    setAjoutOuvert(false)
  }

  const btnBase = {
    fontSize: 11, padding: '4px 10px',
    borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)',
    background: 'var(--color-surface)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  }

  const champStyle = {
    fontSize: 12, padding: '6px 8px',
    borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    flex: 1, minWidth: 160,
  }

  const cardStyle = {
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>

      {/* Barre d'actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() => { setAjoutOuvert(o => !o); setGestionOuverte(false) }}
          style={{
            ...btnBase,
            background: ajoutOuvert ? 'var(--color-primary-light)' : 'var(--color-surface)',
            color: ajoutOuvert ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
          }}
        >
          + Ajouter un praticien
        </button>
        <button
          onClick={() => { setGestionOuverte(o => !o); setAjoutOuvert(false) }}
          style={{
            ...btnBase,
            background: gestionOuverte ? 'var(--color-primary-light)' : 'var(--color-surface)',
            color: gestionOuverte ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
          }}
        >
          Gérer les praticiens
        </button>
      </div>

      {/* Formulaire d'ajout */}
      {ajoutOuvert && (
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            style={champStyle}
            placeholder="Nom du praticien (ex. Dr. MARTIN Sophie)"
            value={fNom}
            onChange={e => setFNom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ajouter()}
            autoFocus
          />
          <button
            onClick={ajouter}
            disabled={!fNom.trim()}
            style={{
              fontSize: 11, padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              border: '0.5px solid #1D9E75',
              background: fNom.trim() ? '#E1F5EE' : 'var(--color-bg)',
              color: fNom.trim() ? '#085041' : 'var(--color-text-tertiary)',
              cursor: fNom.trim() ? 'pointer' : 'default',
            }}
          >
            Ajouter
          </button>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexBasis: '100%' }}>
            Au 1ᵉʳ import Doctolib, son nom apparaîtra dans la file d'attente pour être classé une fois.
          </span>
        </div>
      )}

      {/* Panneau de gestion masquage/réaffichage */}
      {gestionOuverte && (
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
            {spec.nom} — {spec.praticiens.length} praticien{spec.praticiens.length > 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {spec.praticiens.map(p => (
              <div
                key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-md)',
                  background: p.masque ? 'var(--color-bg)' : 'transparent',
                  opacity: p.masque ? 0.55 : 1,
                  border: '0.5px solid var(--color-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text)' }}>{p.nom}</span>
                  {p.masque && (
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                      masqué
                    </span>
                  )}
                  {p.ajoutManuel && (
                    <span style={{ fontSize: 9, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', padding: '1px 5px', borderRadius: 8 }}>
                      ajouté
                    </span>
                  )}
                </div>
                {p.masque ? (
                  <button
                    onClick={() => { definirMasquePraticien(spec.id, p.id, false); onChange() }}
                    style={{
                      fontSize: 10, padding: '3px 9px',
                      borderRadius: 'var(--radius-md)',
                      border: '0.5px solid #1D9E75',
                      background: '#E1F5EE', color: '#085041',
                      cursor: 'pointer',
                    }}
                  >
                    Réafficher
                  </button>
                ) : (
                  <button
                    onClick={() => { definirMasquePraticien(spec.id, p.id, true); onChange() }}
                    style={{
                      fontSize: 10, padding: '3px 9px',
                      borderRadius: 'var(--radius-md)',
                      border: '0.5px solid var(--color-border)',
                      background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    Masquer
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Note d'info */}
          <div style={{ marginTop: 10, padding: '8px 10px', background: '#EEEDFE', border: '0.5px solid #AFA9EC', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: 11, color: '#3C3489', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span>ℹ</span>
              <span>
                Masquer un praticien le retire des graphiques de détail, mais conserve ses chiffres dans le total de la spécialité.
                Un praticien masqué peut être réaffiché à tout moment.
                Les nouveaux opérateurs seront classés automatiquement lors du 1ᵉʳ import Doctolib.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
