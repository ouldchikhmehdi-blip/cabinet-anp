import { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES } from '../utils/calendrier'
import { ANNEE_DEFAUT } from '../utils/desiderata'
import { chargerTrames, sauverTrames } from '../utils/tramesApi'
import { JOURS, JOURS_LABEL, parserCollage, prochainIdTrame } from '../utils/trames'

export default function PlanningTrames({ annee: anneeProp, onChangeAnnee, onStatut } = {}) {
  const { session, profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [anneeInterne, setAnneeInterne] = useState(ANNEE_DEFAUT)
  const annee = anneeProp ?? anneeInterne
  const setAnnee = onChangeAnnee ?? setAnneeInterne
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [enregistre, setEnregistre] = useState(false)

  // Zone de collage + colonnes candidates (avant ajout au catalogue).
  const [texteCollage, setTexteCollage] = useState('')
  const [candidats, setCandidats] = useState([]) // [{ jours, nom, inclure }]

  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    chargerTrames(annee)
      .then(d => { if (!annule) { setData(d); onStatut?.('vierge') } })
      .catch(() => { if (!annule) setErreur('Impossible de charger les trames.') })
    return () => { annule = true }
  }, [annee, estFaiseur, onStatut])

  // ── Collage : on (re)parse le bloc et on prépare les colonnes candidates ──
  function majTexteCollage(valeur) {
    setTexteCollage(valeur)
    const cols = parserCollage(valeur)
    setCandidats(cols.map(c => ({ jours: c.jours, nom: '', inclure: true })))
  }

  function majCandidatNom(i, nom) {
    setCandidats(prev => prev.map((c, idx) => (idx === i ? { ...c, nom } : c)))
  }

  function toggleCandidat(i) {
    setCandidats(prev => prev.map((c, idx) => (idx === i ? { ...c, inclure: !c.inclure } : c)))
  }

  function ajouterAuCatalogue() {
    const aAjouter = candidats.filter(c => c.inclure)
    if (aAjouter.length === 0) return
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const trames = [...prev.trames]
      let id = prochainIdTrame(trames)
      for (const c of aAjouter) {
        const nom = c.nom.trim() || `Trame ${id}`
        trames.push({ id, nom, jours: { ...c.jours } })
        id += 1
      }
      return { ...prev, trames }
    })
    setTexteCollage('')
    setCandidats([])
  }

  function majNomTrame(idTrame, nom) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => ({
      ...prev,
      trames: prev.trames.map(t => (t.id === idTrame ? { ...t, nom } : t)),
    }))
  }

  function supprimerTrame(idTrame) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => ({ ...prev, trames: prev.trames.filter(t => t.id !== idTrame) }))
  }

  async function enregistrer() {
    setErreur(null)
    try {
      await sauverTrames(annee, data, session.user.id)
      setEnregistre(true); onStatut?.('enregistre')
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
    boutonSecondaire: {
      padding: '8px 14px', fontSize: 13, fontWeight: 500, background: 'transparent',
      color: 'var(--color-primary)', border: '0.5px solid var(--color-primary)',
      borderRadius: 'var(--radius-md)', cursor: 'pointer',
    },
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 24,
    },
    titreSection: { fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 },
    aide: { fontSize: 12.5, color: 'var(--color-text-secondary)', marginBottom: 12, lineHeight: 1.5 },
    textarea: {
      width: '100%', minHeight: 90, padding: '10px 12px', fontSize: 13, fontFamily: 'monospace',
      border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', resize: 'vertical',
      boxSizing: 'border-box',
    },
    table: { borderCollapse: 'collapse', fontSize: 13, marginTop: 12 },
    thJour: {
      padding: '6px 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
      textAlign: 'left', borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap',
    },
    thCol: {
      padding: '6px 8px', borderBottom: '0.5px solid var(--color-border)',
      borderLeft: '0.5px solid var(--color-border)', minWidth: 120, verticalAlign: 'top',
    },
    tdJour: {
      padding: '5px 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
      borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap',
    },
    tdCell: {
      padding: '5px 8px', fontSize: 13, textAlign: 'center', color: 'var(--color-text)',
      borderBottom: '0.5px solid var(--color-border)', borderLeft: '0.5px solid var(--color-border)',
    },
    repos: { color: 'var(--color-text-tertiary)', fontStyle: 'italic' },
    inputNom: {
      width: '100%', padding: '5px 7px', fontSize: 12.5, boxSizing: 'border-box',
      border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    croix: {
      border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)',
      cursor: 'pointer', fontSize: 14, padding: '0 4px', lineHeight: 1,
    },
    trameCarte: {
      border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      padding: '10px 12px', minWidth: 200,
    },
  }

  if (!estFaiseur) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Trames</h1>
        <div style={{ ...s.carte, color: 'var(--color-text-secondary)', fontSize: 14, padding: 24 }}>
          Cette page est réservée au faiseur de planning.
        </div>
      </div>
    )
  }

  const reposOuPoste = (v) => (v && v.trim() ? v : <span style={s.repos}>repos</span>)
  const aInclure = candidats.filter(c => c.inclure).length

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Trames {annee}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        Une <strong>trame</strong> est la semaine (lundi → vendredi) d'un associé : une suite de postes,
        une case vide = repos. Le catalogue se remplit par collage depuis Excel, autant de trames que
        vous voulez, nommées librement (« Normale post-WE », « Avec remplaçant », « Vendredi de garde »…).
        Le week-end est géré dans l'étape Week-ends.
      </p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Année</label>
          <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={s.select}>
            {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <button type="button" onClick={enregistrer} disabled={data === null} style={{ ...s.bouton, opacity: data === null ? 0.5 : 1 }}>
          Enregistrer
        </button>
        {enregistre && <span style={{ fontSize: 13, color: 'var(--color-success)', alignSelf: 'center' }}>Enregistré ✓</span>}
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
          {/* ── Coller des trames ── */}
          <div style={s.carte}>
            <div style={s.titreSection}>Coller des trames depuis Excel</div>
            <p style={s.aide}>
              Dans Excel, sélectionnez un bloc de <strong>5 lignes (lundi → vendredi)</strong> et autant
              de <strong>colonnes</strong> que de trames (un associé = une colonne), puis collez-le
              ci-dessous (Ctrl+V). Chaque colonne devient une trame à nommer. Une cellule vide = repos.
            </p>
            <textarea
              value={texteCollage}
              onChange={e => majTexteCollage(e.target.value)}
              placeholder="Collez ici les cellules copiées depuis Excel…"
              style={s.textarea}
            />

            {candidats.length > 0 && (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.thJour}>Jour</th>
                        {candidats.map((c, i) => (
                          <th key={i} style={s.thCol}>
                            <input
                              type="text"
                              value={c.nom}
                              onChange={e => majCandidatNom(i, e.target.value)}
                              placeholder={`Trame ${i + 1}`}
                              style={s.inputNom}
                            />
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12, color: 'var(--color-text-secondary)', justifyContent: 'center' }}>
                              <input type="checkbox" checked={c.inclure} onChange={() => toggleCandidat(i)} />
                              inclure
                            </label>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {JOURS.map(j => (
                        <tr key={j}>
                          <td style={s.tdJour}>{JOURS_LABEL[j]}</td>
                          {candidats.map((c, i) => (
                            <td key={i} style={{ ...s.tdCell, opacity: c.inclure ? 1 : 0.4 }}>
                              {reposOuPoste(c.jours[j])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
                  <button type="button" onClick={ajouterAuCatalogue} disabled={aInclure === 0} style={{ ...s.boutonSecondaire, opacity: aInclure === 0 ? 0.5 : 1 }}>
                    + Ajouter au catalogue ({aInclure})
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {candidats.length} colonne{candidats.length > 1 ? 's' : ''} détectée{candidats.length > 1 ? 's' : ''}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* ── Catalogue ── */}
          <div style={s.carte}>
            <div style={s.titreSection}>
              Catalogue {data.trames.length > 0 && <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>· {data.trames.length} trame{data.trames.length > 1 ? 's' : ''}</span>}
            </div>
            {data.trames.length === 0 ? (
              <p style={{ ...s.aide, marginBottom: 0 }}>
                Aucune trame pour l'instant. Collez un bloc Excel ci-dessus pour commencer.
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
                {data.trames.map(t => (
                  <div key={t.id} style={s.trameCarte}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <input
                        type="text"
                        value={t.nom}
                        onChange={e => majNomTrame(t.id, e.target.value)}
                        style={{ ...s.inputNom, fontWeight: 600 }}
                      />
                      <button type="button" onClick={() => supprimerTrame(t.id)} style={s.croix} title="Supprimer cette trame">✕</button>
                    </div>
                    <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
                      <tbody>
                        {JOURS.map(j => (
                          <tr key={j}>
                            <td style={{ ...s.tdJour, padding: '4px 8px' }}>{JOURS_LABEL[j]}</td>
                            <td style={{ padding: '4px 8px', borderBottom: '0.5px solid var(--color-border)', textAlign: 'right' }}>
                              {reposOuPoste(t.jours[j])}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
