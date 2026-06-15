import { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES } from '../utils/calendrier'
import { ANNEE_DEFAUT } from '../utils/desiderata'
import { chargerTrames, sauverTrames } from '../utils/tramesApi'
import { parserCollage, prochainIdTrame, suggererRoles } from '../utils/trames'
import TrameGrille from '../components/planning/TrameGrille'

export default function PlanningTrames({ annee: anneeProp, onChangeAnnee, onStatut, sansEntete = false } = {}) {
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
      const trame = { id, nom, colonnes, ...suggererRoles(colonnes), remplacants: [] }
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
    setData(prev => ({
      ...prev,
      principaleId: prev.principaleId === idTrame ? null : prev.principaleId,
      trames: prev.trames.filter(t => t.id !== idTrame),
    }))
  }

  // Désigne (ou retire) la trame principale, celle affichée aux associés dans leurs desiderata.
  function definirPrincipale(idTrame) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => ({ ...prev, principaleId: prev.principaleId === idTrame ? null : idTrame }))
  }

  // Désigne une colonne spéciale d'une trame (réa / vacances / avantWE / apresWE) — index ou null.
  function majRoleColonne(idTrame, role, index) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => ({
      ...prev,
      trames: prev.trames.map(t => (t.id === idTrame ? { ...t, [role]: index } : t)),
    }))
  }

  // ── Colonnes remplaçant (0, 1, 2… par trame) ──
  function ajouterRemplacant(idTrame) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => ({
      ...prev,
      trames: prev.trames.map(t => (t.id === idTrame
        ? { ...t, remplacants: [...t.remplacants, { col: null, nom: `Remplaçant ${t.remplacants.length + 1}` }] }
        : t)),
    }))
  }

  function majRemplacant(idTrame, idx, champ, valeur) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => ({
      ...prev,
      trames: prev.trames.map(t => (t.id === idTrame
        ? { ...t, remplacants: t.remplacants.map((r, k) => (k === idx ? { ...r, [champ]: valeur } : r)) }
        : t)),
    }))
  }

  function supprimerRemplacant(idTrame, idx) {
    setEnregistre(false); onStatut?.('modifie')
    setData(prev => ({
      ...prev,
      trames: prev.trames.map(t => (t.id === idTrame
        ? { ...t, remplacants: t.remplacants.filter((_, k) => k !== idx) }
        : t)),
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

  // Les 4 colonnes spéciales désignables, avec libellé + repère + couleur.
  const ROLES = [
    { cle: 'rea', label: 'Colonne réa :', court: 'Réa', couleur: '#0E7C66' },
    { cle: 'vacances', label: 'Colonne vacances :', court: 'Vacances', couleur: '#2D6CB5' },
    { cle: 'avantWE', label: 'Colonne avant le week-end :', court: '→ avant WE', couleur: 'var(--color-primary-dark)' },
    { cle: 'apresWE', label: 'Colonne après le week-end :', court: '↩ après WE', couleur: 'var(--color-primary-dark)' },
  ]

  const COULEUR_REMPLACANT = '#B45309'

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
      {!sansEntete && <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Trames {annee}</h1>}
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        Une <strong>trame</strong> est une <strong>semaine type entière</strong> : une grille de plusieurs
        colonnes, chaque colonne étant une séquence figée de postes du lundi au vendredi (case vide = repos).
        Les colonnes s'intervertissent entre associés selon les jours off. Sur chaque trame, vous désignez les
        4 colonnes spéciales — <strong>Réa</strong>, <strong>Vacances</strong>, <strong>avant le week-end</strong>,
        <strong>après le week-end</strong> (Réa et Vacances sont pré-suggérées, à vérifier). Elles se rempliront
        automatiquement à l'affectation ; les autres colonnes collent aux jours off demandés. Si la trame comporte
        une ou plusieurs colonnes <strong>remplaçant</strong> (colonnes en plus), désignez-les et nommez-les
        (« Remplaçant 1 », « Remplaçant 2 »…). Le catalogue se remplit par collage depuis Excel, autant de trames
        que vous voulez (« Normale », « Avec 1 remplaçant », « Avec 2 remplaçants », « Vendredi de garde »…).
        Cochez enfin une <strong>trame principale</strong> : c'est elle qui sera montrée aux associés dans
        leurs desiderata pour qu'ils choisissent une colonne par semaine.
      </p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        {!sansEntete && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Année</label>
            <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={s.select}>
              {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        )}
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
                <div style={{ overflowX: 'auto' }}><TrameGrille colonnes={candidatColonnes} /></div>
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
                      <label
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto',
                          fontSize: 12, fontWeight: data.principaleId === t.id ? 600 : 500,
                          color: data.principaleId === t.id ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
                          cursor: 'pointer',
                        }}
                        title="La trame affichée aux associés dans leurs desiderata"
                      >
                        <input type="checkbox" checked={data.principaleId === t.id} onChange={() => definirPrincipale(t.id)} />
                        Trame principale
                      </label>
                      <button type="button" onClick={() => supprimerTrame(t.id)} style={s.croix} title="Supprimer cette trame">✕</button>
                    </div>
                    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
                      {ROLES.map(r => <span key={r.cle}>{selecteurRole(t, r.cle, r.label)}</span>)}
                    </div>

                    {/* Colonnes remplaçant (0, 1, 2…) */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: COULEUR_REMPLACANT, marginBottom: 6 }}>Colonnes remplaçant</div>
                      {t.remplacants.map((r, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                          <select
                            value={r.col == null ? '' : r.col}
                            onChange={e => majRemplacant(t.id, idx, 'col', e.target.value === '' ? null : Number(e.target.value))}
                            style={{ ...s.select, padding: '5px 8px', fontSize: 12 }}
                          >
                            <option value="">— colonne —</option>
                            {t.colonnes.map((_, i) => <option key={i} value={i}>C{i + 1}</option>)}
                          </select>
                          <input
                            type="text"
                            value={r.nom}
                            onChange={e => majRemplacant(t.id, idx, 'nom', e.target.value)}
                            placeholder={`Remplaçant ${idx + 1}`}
                            style={{ ...s.inputNom, flex: '0 0 220px' }}
                          />
                          <button type="button" onClick={() => supprimerRemplacant(t.id, idx)} style={s.croix} title="Retirer ce remplaçant">✕</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => ajouterRemplacant(t.id)} style={{ ...s.boutonSecondaire, padding: '5px 10px', fontSize: 12 }}>
                        + Ajouter une colonne remplaçant
                      </button>
                    </div>

                    <TrameGrille colonnes={t.colonnes} roles={{ rea: t.rea, vacances: t.vacances, avantWE: t.avantWE, apresWE: t.apresWE, remplacants: t.remplacants }} />
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
