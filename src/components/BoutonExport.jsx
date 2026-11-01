import { useState } from 'react'
import { exporterExcel, exporterClasseur } from '../utils/export'

// exports = [{ label, build }] où build() renvoie { nomFichier, lignes, feuille } (une feuille)
// ou { nomFichier, feuilles: [{ nom, lignes }] } (plusieurs feuilles, ex. une par année).
// build() peut être asynchrone (données lues en base à la demande) : le bouton patiente.
export default function BoutonExport({ exports, disabled = false }) {
  const [ouvert, setOuvert] = useState(false)
  const [enCours, setEnCours] = useState(false)

  const lancer = async (entry) => {
    setOuvert(false)
    setEnCours(true)
    try {
      const { nomFichier, lignes, feuille, feuilles } = await entry.build()
      if (feuilles) exporterClasseur(nomFichier, feuilles)
      else exporterExcel(nomFichier, lignes, feuille)
    } catch (e) {
      window.alert(`Export impossible : ${e.message || e}`)
    } finally {
      setEnCours(false)
    }
  }

  const btnStyle = {
    fontSize: 11, padding: '5px 12px',
    borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)',
    background: disabled ? 'var(--color-bg)' : 'var(--color-surface)',
    color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
    cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
  }

  const titre = disabled ? 'Désactivé quand les montants sont masqués' : 'Exporter les données de la période en Excel'

  if (exports.length === 1) {
    return (
      <button style={btnStyle} disabled={disabled || enCours} title={titre} onClick={() => lancer(exports[0])}>
        {enCours ? '… Export en cours' : '⬇ Exporter (Excel)'}
      </button>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <button style={btnStyle} disabled={disabled || enCours} title={titre} onClick={() => setOuvert(o => !o)}>
        {enCours ? '… Export en cours' : <>⬇ Exporter (Excel) <span style={{ fontSize: 9 }}>▾</span></>}
      </button>
      {ouvert && !disabled && (
        <>
          <div onClick={() => setOuvert(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 11,
            minWidth: 200, background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)', padding: 4,
          }}>
            {exports.map((e, i) => (
              <button
                key={i}
                onClick={() => lancer(e)}
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer',
                  fontSize: 12, color: 'var(--color-text)',
                  padding: '7px 10px', border: 'none', borderRadius: 6, background: 'transparent',
                }}
              >
                {e.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
