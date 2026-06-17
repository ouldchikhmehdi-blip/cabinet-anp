import { useState } from 'react'
import { ASSOCIES } from '../../data/associes'
import { PARAMS_REF, compteursVides, parserTableauCompteurs, VERSION_CREF } from '../../utils/compteursRef'

// ============================================================
// CompteursReference — panneau « Compteurs de référence (cumul à ce stade) » de l'année.
// Le faiseur tient son tableau récap (paramètres × associés) dans Excel ; il le COLLE ici et les cases
// se remplissent automatiquement. Le tableau affiché sert à la fois de modèle (ce qu'il faut coller) et
// de résultat éditable, validé puis enregistré (socle pour construire le 3ᵉ recueil). Le tableau collé
// doit inclure le compte de Noël.
//
// Props : { annee, valeur, onEnregistrer(data), onSupprimer(), enregistrement }
//   - valeur : objet { compteurs, importeLe } enregistré, ou null.
// ============================================================
export default function CompteursReference({ annee, valeur, onEnregistrer, onSupprimer, enregistrement = false }) {
  const [ouvert, setOuvert] = useState(false)
  const [texte, setTexte] = useState('')
  const [edit, setEdit] = useState(() => valeur?.compteurs ?? compteursVides())
  const [msg, setMsg] = useState(null)

  // Resynchronise le tableau éditable quand la valeur enregistrée change (chargement / après save).
  // Pattern « état dérivé d'une prop » sans effet (évite react-hooks/set-state-in-effect).
  const [refValeur, setRefValeur] = useState(valeur)
  if (valeur !== refValeur) {
    setRefValeur(valeur)
    setEdit(valeur?.compteurs ?? compteursVides())
  }

  function coller(e) {
    const brut = e.clipboardData?.getData('text/plain') ?? ''
    if (!brut) return
    e.preventDefault()
    setTexte(brut)
    const { compteurs, nbParams, nbAssocies } = parserTableauCompteurs(brut)
    setEdit(compteurs)
    setMsg(nbParams > 0
      ? `Tableau lu : ${nbParams} paramètre${nbParams > 1 ? 's' : ''} × ${nbAssocies} associé${nbAssocies > 1 ? 's' : ''} reconnus.`
      : 'Aucun paramètre reconnu — vérifiez que le tableau contient les libellés et les initiales des associés.')
    setTimeout(() => setMsg(null), 5000)
  }

  function modifierCellule(ini, param, val) {
    const n = val === '' ? 0 : Math.max(0, Math.round(Number(val) || 0))
    setEdit(prev => ({ ...prev, [ini]: { ...prev[ini], [param]: n } }))
  }

  async function enregistrer() {
    setMsg(null)
    await onEnregistrer({ v: VERSION_CREF, importeLe: new Date().toISOString(), inclutNoel: true, compteurs: edit })
    setMsg('Compteurs de référence enregistrés.')
    setTexte('')
    setTimeout(() => setMsg(null), 4000)
  }

  const aDejaEnregistre = !!valeur?.importeLe

  const styles = {
    th: { padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'center', borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap' },
    thParam: { padding: '6px 8px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)', textAlign: 'left', borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap' },
    td: { padding: '3px 4px', textAlign: 'center', borderBottom: '0.5px solid var(--color-border)' },
    input: {
      width: 46, padding: '4px 4px', fontSize: 13, textAlign: 'center',
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
  }

  return (
    <div style={{
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 24,
    }} className="no-print">
      <button
        type="button"
        onClick={() => setOuvert(o => !o)}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left', display: 'block' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{ouvert ? '▾' : '▸'}</span>
          Compteurs de référence (cumul à ce stade) — {annee}
          {aDejaEnregistre && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-success)' }}>● enregistrés</span>}
        </span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
          Collez votre tableau récapitulatif des compteurs par associé pour fixer le socle de la suite.
        </span>
      </button>

      {ouvert && (
        <div style={{ marginTop: 16 }}>
          {msg && <div style={{ fontSize: 12, color: 'var(--color-success)', marginBottom: 12 }}>{msg}</div>}

          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
            Collez (Ctrl+V) le <strong>tableau récapitulatif</strong> des compteurs depuis Excel : mêmes
            lignes que le tableau ci-dessous (un paramètre par ligne, une colonne par associé). Les cases se
            remplissent automatiquement. <strong>Ce tableau doit inclure le compte, Noël compris.</strong>
          </p>
          <textarea
            value={texte}
            onChange={e => setTexte(e.target.value)}
            onPaste={coller}
            placeholder="Collez ici le tableau récapitulatif des compteurs (paramètres × associés) copié depuis Excel…"
            style={{
              width: '100%', minHeight: 70, padding: '10px 12px', fontSize: 13, fontFamily: 'monospace',
              border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
            }}
          />

          {/* Tableau éditable paramètres × associés (modèle + résultat) */}
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...styles.thParam, textAlign: 'left' }}>Paramètre</th>
                  {ASSOCIES.map(ini => <th key={ini} style={styles.th}>{ini}</th>)}
                </tr>
              </thead>
              <tbody>
                {PARAMS_REF.map(([param, label]) => (
                  <tr key={param}>
                    <td style={styles.thParam}>{label}</td>
                    {ASSOCIES.map(ini => (
                      <td key={ini} style={styles.td}>
                        <input
                          type="number"
                          min="0"
                          value={edit?.[ini]?.[param] ?? 0}
                          onChange={e => modifierCellule(ini, param, e.target.value)}
                          style={styles.input}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 16 }}>
            <button
              type="button"
              onClick={enregistrer}
              disabled={enregistrement}
              style={{
                padding: '9px 16px', background: 'var(--color-primary)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500,
                opacity: enregistrement ? 0.6 : 1,
              }}
            >
              {enregistrement ? 'Enregistrement…' : 'Enregistrer la référence'}
            </button>
            {aDejaEnregistre && (
              <button
                type="button"
                onClick={onSupprimer}
                style={{
                  padding: '5px 10px', fontSize: 12, borderRadius: 'var(--radius-md)',
                  border: '0.5px solid var(--color-danger)', background: 'transparent', color: 'var(--color-danger)',
                }}
              >
                Supprimer la référence
              </button>
            )}
          </div>

          {aDejaEnregistre && valeur?.importeLe && (
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 10 }}>
              Dernier enregistrement : {new Date(valeur.importeLe).toLocaleString('fr-FR')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
