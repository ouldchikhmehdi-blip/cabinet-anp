import { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES } from '../utils/calendrier'
import { ANNEE_DEFAUT } from '../utils/desiderata'
import { chargerTrames, sauverTrames } from '../utils/tramesApi'
import { JOURS, JOURS_LABEL, parserCollage, prochainIdTrame, colonneVide, suggererRoles } from '../utils/trames'

export default function PlanningTrames({ annee: anneeProp, onChangeAnnee, onStatut } = {}) {
  const { session, profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [anneeInterne, setAnneeInterne] = useState(ANNEE_DEFAUT)
  const annee = anneeProp ?? anneeInterne
  const setAnnee = onChangeAnnee ?? setAnneeInterne
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [enregistre, setEnregistre] = useState(false)

  // Zone de collage : colonnes de la trame candidate (avant ajout au catalogue) + son nom.
  const [texteCollage, setTexteCollage] = useState('')
  const [candidatColonnes, setCandidatColonnes] = useState([]) // [{ lun..ven }]
  const [candidatNom, setCandidatNom] = useState('')

  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    chargerTrames(annee)
      .then(d => { if (!annule) { setData(d); onStatut?.('vierge') } })
      .catch(() => { if (!annule) setErreur('Impossible de charger les trames.') })
    return () => { annule = true }
  }, [annee, estFaiseur, onStatut])

  // ── Collage : on (re)parse le bloc → colonnes de la trame candidate ──
  function majTexteCollage(valeur) {
    setTexteCollage(valeur)
    setCandidatColonnes(parserCollage(valeur))
  }

  function ajouterAuCatalogue() {
    if (candidatColonnes.length === 0) return
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => {
      const id = prochainIdTrame(prev.trames)
      const nom = candidatNom.trim() || `Trame ${id}`
      const colonnes = candidatColonnes.map(c => ({ ...c }))
      const trame = { id, nom, colonnes, ...suggererRoles(colonnes) }
      return { ...prev, trames: [...prev.trames, trame] }
    })
    setTexteCollage('')
    setCandidatColonnes([])
    setCandidatNom('')
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

  // Désigne la colonne « après week-end » / « avant week-end » d'une trame (index ou null).
  function majRoleColonne(idTrame, role, index) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => ({
      ...prev,
      trames: prev.trames.map(t => (t.id === idTrame ? { ...t, [role]: index } : t)),
    }))
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
    inputNom: {
      width: '100%', padding: '7px 10px', fontSize: 13, boxSizing: 'border-box',
      border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    table: { borderCollapse: 'collapse', fontSize: 13 },
    thJour: {
      padding: '6px 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
      textAlign: 'left', borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap',
    },
    thCol: {
      padding: '6px 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
      textAlign: 'center', borderBottom: '0.5px solid var(--color-border)',
      borderLeft: '0.5px solid var(--color-border)', minWidth: 96,
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
    badge: { fontSize: 10, fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap' },
    croix: {
      border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)',
      cursor: 'pointer', fontSize: 14, padding: '0 4px', lineHeight: 1,
    },
    trameCarte: {
      border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      padding: '10px 12px', marginBottom: 14, overflowX: 'auto',
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

  const cellule = (v) => (v && v.trim() ? v : <span style={s.repos}>repos</span>)

  // Les 4 colonnes spéciales désignables, avec libellé + repère + couleur.
  const ROLES = [
    { cle: 'rea', label: 'Colonne réa :', court: 'Réa', couleur: '#0E7C66' },
    { cle: 'vacances', label: 'Colonne vacances :', court: 'Vacances', couleur: '#2D6CB5' },
    { cle: 'avantWE', label: 'Colonne avant le week-end :', court: '→ avant WE', couleur: 'var(--color-primary-dark)' },
    { cle: 'apresWE', label: 'Colonne après le week-end :', court: '↩ après WE', couleur: 'var(--color-primary-dark)' },
  ]

  // Rendu d'une grille (jours en lignes × colonnes), pour l'aperçu et le catalogue.
  // roles (optionnel) = { rea, vacances, avantWE, apresWE } : repères sur les colonnes désignées.
  const grille = (colonnes, roles = null) => (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.thJour}>Jour</th>
          {colonnes.map((_, i) => (
            <th key={i} style={s.thCol}>
              <div>C{i + 1}</div>
              {roles && ROLES.filter(r => roles[r.cle] === i).map(r => (
                <div key={r.cle} style={{ ...s.badge, color: r.couleur }}>{r.court}</div>
              ))}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {JOURS.map(j => (
          <tr key={j}>
            <td style={s.tdJour}>{JOURS_LABEL[j]}</td>
            {colonnes.map((col, i) => {
              const estRole = roles && ROLES.some(r => roles[r.cle] === i)
              return (
                <td key={i} style={{ ...s.tdCell, background: estRole ? 'var(--color-primary-light)' : (colonneVide(col) ? 'var(--color-bg-subtle, transparent)' : 'transparent') }}>
                  {cellule(col[j])}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )

  // Sélecteur de colonne pour un rôle.
  const selecteurRole = (trame, role, label) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
      {label}
      <select
        value={trame[role] == null ? '' : trame[role]}
        onChange={e => majRoleColonne(trame.id, role, e.target.value === '' ? null : Number(e.target.value))}
        style={{ ...s.select, padding: '5px 8px', fontSize: 12 }}
      >
        <option value="">—</option>
        {trame.colonnes.map((_, i) => <option key={i} value={i}>C{i + 1}</option>)}
      </select>
    </label>
  )

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Trames {annee}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        Une <strong>trame</strong> est une <strong>semaine type entière</strong> : une grille de plusieurs
        colonnes, chaque colonne étant une séquence figée de postes du lundi au vendredi (case vide = repos).
        Les colonnes s'intervertissent entre associés selon les jours off. Sur chaque trame, vous désignez les
        4 colonnes spéciales — <strong>Réa</strong>, <strong>Vacances</strong>, <strong>avant le week-end</strong>,
        <strong>après le week-end</strong> (Réa et Vacances sont pré-suggérées, à vérifier). Elles se rempliront
        automatiquement à l'affectation ; les autres colonnes collent aux jours off demandés. Le catalogue se
        remplit par collage depuis Excel, autant de trames que vous voulez (« Normale », « Avec remplaçant »,
        « Vendredi de garde »…).
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
          {/* ── Coller une trame ── */}
          <div style={s.carte}>
            <div style={s.titreSection}>Coller une trame depuis Excel</div>
            <p style={s.aide}>
              Dans Excel, sélectionnez le bloc de la semaine type : <strong>5 lignes (lundi → vendredi)</strong> et
              toutes ses <strong>colonnes</strong> (sans la colonne des dates), puis collez-le ci-dessous (Ctrl+V).
              Vérifiez l'aperçu, nommez la trame, puis ajoutez-la au catalogue. Une cellule vide = repos.
            </p>
            <textarea
              value={texteCollage}
              onChange={e => majTexteCollage(e.target.value)}
              placeholder="Collez ici les cellules copiées depuis Excel…"
              style={s.textarea}
            />

            {candidatColonnes.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', margin: '14px 0 12px' }}>
                  <div style={{ flex: '0 0 320px' }}>
                    <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Nom de la trame</label>
                    <input
                      type="text"
                      value={candidatNom}
                      onChange={e => setCandidatNom(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterAuCatalogue() } }}
                      placeholder="ex. Normale, Avec remplaçant Dr X, Vendredi de garde…"
                      style={s.inputNom}
                    />
                  </div>
                  <button type="button" onClick={ajouterAuCatalogue} style={s.boutonSecondaire}>
                    + Ajouter au catalogue
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', alignSelf: 'center' }}>
                    {candidatColonnes.length} colonne{candidatColonnes.length > 1 ? 's' : ''} détectée{candidatColonnes.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>{grille(candidatColonnes)}</div>
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
                Aucune trame pour l'instant. Collez une semaine type ci-dessus pour commencer.
              </p>
            ) : (
              <div style={{ marginTop: 8 }}>
                {data.trames.map(t => (
                  <div key={t.id} style={s.trameCarte}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <input
                        type="text"
                        value={t.nom}
                        onChange={e => majNomTrame(t.id, e.target.value)}
                        style={{ ...s.inputNom, fontWeight: 600, flex: '0 0 320px' }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {t.colonnes.length} colonne{t.colonnes.length > 1 ? 's' : ''}
                      </span>
                      <button type="button" onClick={() => supprimerTrame(t.id)} style={{ ...s.croix, marginLeft: 'auto' }} title="Supprimer cette trame">✕</button>
                    </div>
                    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
                      {ROLES.map(r => <span key={r.cle}>{selecteurRole(t, r.cle, r.label)}</span>)}
                    </div>
                    {grille(t.colonnes, { rea: t.rea, vacances: t.vacances, avantWE: t.avantWE, apresWE: t.apresWE })}
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
