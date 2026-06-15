import { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES } from '../utils/calendrier'
import { ANNEE_DEFAUT } from '../utils/desiderata'
import { ASSOCIES } from '../data/associes'
import { chargerObjectifs, sauverObjectifs } from '../utils/objectifsApi'

export default function PlanningObjectifs({ annee: anneeProp, onChangeAnnee } = {}) {
  const { session, profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [anneeInterne, setAnneeInterne] = useState(ANNEE_DEFAUT)
  const annee = anneeProp ?? anneeInterne
  const setAnnee = onChangeAnnee ?? setAnneeInterne
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [enregistre, setEnregistre] = useState(false)
  const [nouvelleLigne, setNouvelleLigne] = useState('')

  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    chargerObjectifs(annee)
      .then(d => { if (!annule) setData(d) })
      .catch(() => { if (!annule) setErreur('Impossible de charger les objectifs.') })
    return () => { annule = true }
  }, [annee, estFaiseur])

  // Met à jour la valeur d'une cellule (associé × ligne). Vide → on retire la clé.
  function majValeur(associe, ligneId, valeur) {
    setEnregistre(false)
    setData(prev => {
      const valeurs = { ...prev.valeurs }
      const ligneAssocie = { ...(valeurs[associe] ?? {}) }
      if (valeur === '' || valeur == null) {
        delete ligneAssocie[ligneId]
      } else {
        ligneAssocie[ligneId] = Number(valeur)
      }
      valeurs[associe] = ligneAssocie
      return { ...prev, valeurs }
    })
  }

  function ajouterLigne() {
    const label = nouvelleLigne.trim()
    if (!label) return
    setEnregistre(false)
    setData(prev => {
      // id unique stable (pas de Date.now/Math.random — on s'appuie sur le compte existant).
      const n = prev.lignes.filter(l => l.supprimable).length + 1
      let id = `custom-${n}`
      while (prev.lignes.some(l => l.id === id)) id = `custom-${Number(id.slice(7)) + 1}`
      return { ...prev, lignes: [...prev.lignes, { id, label, supprimable: true }] }
    })
    setNouvelleLigne('')
  }

  function supprimerLigne(ligneId) {
    setEnregistre(false)
    setData(prev => {
      const valeurs = {}
      for (const a of Object.keys(prev.valeurs)) {
        const reste = { ...prev.valeurs[a] }
        delete reste[ligneId]
        valeurs[a] = reste
      }
      return { ...prev, lignes: prev.lignes.filter(l => l.id !== ligneId), valeurs }
    })
  }

  async function enregistrer() {
    setErreur(null)
    try {
      await sauverObjectifs(annee, data, session.user.id)
      setEnregistre(true)
      setTimeout(() => setEnregistre(false), 3000)
    } catch {
      setErreur('Enregistrement impossible (réservé au faiseur).')
    }
  }

  // ── Styles ──
  const s = {
    select: {
      padding: '8px 12px', fontSize: 14, border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    bouton: {
      padding: '10px 20px', background: 'var(--color-primary)', color: '#fff', border: 'none',
      borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500,
    },
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '12px 14px', marginBottom: 24, overflowX: 'auto',
    },
    table: { borderCollapse: 'collapse', fontSize: 13, minWidth: 720 },
    th: {
      padding: '8px 6px', fontSize: 12, fontWeight: 600, color: 'var(--color-text)',
      textAlign: 'center', borderBottom: '0.5px solid var(--color-border)',
      background: 'var(--color-primary-light)', minWidth: 56,
    },
    thLabel: {
      padding: '8px 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
      textAlign: 'left', borderBottom: '0.5px solid var(--color-border)',
    },
    tdLabel: {
      padding: '6px 10px', fontSize: 13, color: 'var(--color-text)', whiteSpace: 'nowrap',
      borderBottom: '0.5px solid var(--color-border)',
    },
    td: { padding: '4px 4px', textAlign: 'center', borderBottom: '0.5px solid var(--color-border)' },
    input: {
      width: 52, padding: '6px 4px', fontSize: 13, textAlign: 'center',
      border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    croix: {
      border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)',
      cursor: 'pointer', fontSize: 14, padding: '0 4px', lineHeight: 1,
    },
    ajout: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 },
    inputTexte: {
      flex: '0 0 260px', padding: '8px 12px', fontSize: 13,
      border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
  }

  if (!estFaiseur) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Objectifs</h1>
        <div style={{ ...s.carte, color: 'var(--color-text-secondary)', fontSize: 14, padding: 24 }}>
          Cette page est réservée au faiseur de planning.
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Objectifs {annee}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        Pour chaque associé, le nombre visé sur l'année : gardes de week-end, astreintes et gardes
        du vendredi, semaines de réa… Toutes les cases sont facultatives. Vous pouvez ajouter vos
        propres lignes d'objectif. Servira de cible « Réalisé vs Objectif » dans le planning.
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Année</label>
        <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={s.select}>
          {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          {erreur}
        </div>
      )}

      {data === null ? (
        <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Chargement…</div>
      ) : (
        <>
          <div style={s.carte}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.thLabel}>Objectif</th>
                  {ASSOCIES.map(a => <th key={a} style={s.th}>{a}</th>)}
                  <th style={{ ...s.thLabel, width: 24 }} aria-label="Supprimer" />
                </tr>
              </thead>
              <tbody>
                {data.lignes.map(ligne => (
                  <tr key={ligne.id}>
                    <td style={s.tdLabel}>{ligne.label}</td>
                    {ASSOCIES.map(a => (
                      <td key={a} style={s.td}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={data.valeurs[a]?.[ligne.id] ?? ''}
                          onChange={e => majValeur(a, ligne.id, e.target.value)}
                          style={s.input}
                        />
                      </td>
                    ))}
                    <td style={{ ...s.td, width: 24 }}>
                      {ligne.supprimable && (
                        <button
                          type="button"
                          onClick={() => supprimerLigne(ligne.id)}
                          style={s.croix}
                          title="Supprimer cette ligne"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={s.ajout}>
              <input
                type="text"
                value={nouvelleLigne}
                onChange={e => setNouvelleLigne(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterLigne() } }}
                placeholder="Nom d'un nouvel objectif (ex. Fériés J-1)"
                style={s.inputTexte}
              />
              <button
                type="button"
                onClick={ajouterLigne}
                disabled={!nouvelleLigne.trim()}
                style={{ ...s.bouton, padding: '8px 14px', fontSize: 13, background: 'transparent', color: 'var(--color-primary)', border: '0.5px solid var(--color-primary)', opacity: nouvelleLigne.trim() ? 1 : 0.5 }}
              >
                + Ajouter une ligne
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 24 }}>
            <button type="button" onClick={enregistrer} style={s.bouton}>Enregistrer</button>
            {enregistre && <span style={{ fontSize: 13, color: 'var(--color-success)' }}>Enregistré ✓</span>}
          </div>
        </>
      )}
    </div>
  )
}
