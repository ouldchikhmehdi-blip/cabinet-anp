// ============================================================
// IadeGestion — « Demandes IADE » : valider ou refuser les congés des IADE.
// Accessible au gestionnaire des IADE (profiles.is_gestion_iade), au faiseur de
// planning (is_faiseur) et à l'admin — cf. peut_gerer_iade() côté base.
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react'
import CalendrierConges from '../components/iade/CalendrierConges'
import { chargerDemandes, chargerAgentsIade, deciderDemande, chargerCalendrierIade } from '../utils/iadeCongesApi'
import { bornesMois, libelleType, libelleStatut, formatPeriode, nbJoursOuvres, STATUTS } from '../utils/iadeConges'
import { ANNEES } from '../utils/calendrier'

export default function IadeGestion() {
  const maintenant = new Date()
  const [annee, setAnnee] = useState(maintenant.getFullYear())
  const [mois,  setMois]  = useState(maintenant.getMonth())

  const [demandes, setDemandes] = useState([])
  const [agents,   setAgents]   = useState([])
  const [absences, setAbsences] = useState([])   // calendrier du mois affiché
  const [charge,   setCharge]   = useState(true)
  const [chargeCal, setChargeCal] = useState(true)
  const [erreur,   setErreur]   = useState(null)
  const [succes,   setSucces]   = useState(null)
  const [enCours,  setEnCours]  = useState(null) // id de la demande en cours de décision

  // Demandes de l'année + comptes IADE.
  const charger = useCallback(async () => {
    setCharge(true)
    try {
      const [d, a] = await Promise.all([chargerDemandes(annee), chargerAgentsIade()])
      setDemandes(d); setAgents(a); setErreur(null)
    } catch {
      setErreur('Impossible de charger les demandes.')
    } finally {
      setCharge(false)
    }
  }, [annee])

  // Chargement initial et à chaque changement d'année (asynchrone).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { charger() }, [charger])

  // Calendrier du mois affiché (rechargé après chaque décision via `demandes`).
  useEffect(() => {
    let annule = false
    // Repasse en « Chargement… » avant la requête (cf. IadeCalendrier).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChargeCal(true)
    const { debut, fin } = bornesMois(annee, mois)
    chargerCalendrierIade(debut, fin)
      .then(rows => { if (!annule) setAbsences(rows) })
      .catch(() => { if (!annule) setAbsences([]) })
      .finally(() => { if (!annule) setChargeCal(false) })
    return () => { annule = true }
  }, [annee, mois, demandes])

  function naviguer(delta) {
    const d = new Date(Date.UTC(annee, mois + delta, 1))
    setAnnee(d.getUTCFullYear())
    setMois(d.getUTCMonth())
  }

  const nomDe = useCallback((userId) => {
    return agents.find(a => a.id === userId)?.nom ?? 'Agent inconnu'
  }, [agents])

  async function decider(d, statut) {
    let motif = null
    if (statut === 'refusee') {
      const saisie = prompt(
        `Refuser la demande de ${nomDe(d.user_id)} (${formatPeriode(d.date_debut, d.date_fin)}).\n\n` +
        `Motif communiqué à l'agent (facultatif) :`, ''
      )
      if (saisie === null) return          // annulation de la boîte de dialogue
      motif = saisie
    } else if (!confirm(`Valider le congé de ${nomDe(d.user_id)} — ${formatPeriode(d.date_debut, d.date_fin)} ?`)) {
      return
    }

    setErreur(null); setSucces(null); setEnCours(d.id)
    try {
      await deciderDemande(d.id, statut, motif)
      setSucces(`Demande ${statut === 'validee' ? 'validée' : 'refusée'} — ${nomDe(d.user_id)}, ${formatPeriode(d.date_debut, d.date_fin)}.`)
      await charger()
    } catch {
      setErreur('Décision impossible (droits insuffisants ou demande supprimée).')
    } finally {
      setEnCours(null)
    }
  }

  const enAttente = useMemo(() => demandes.filter(d => d.statut === 'en_attente'), [demandes])
  const traitees  = useMemo(() => demandes.filter(d => d.statut !== 'en_attente'), [demandes])

  // Récapitulatif par agent sur l'année : jours ouvrés validés + demandes en attente.
  const recap = useMemo(() => agents.map(a => {
    const siennes = demandes.filter(d => d.user_id === a.id)
    return {
      ...a,
      jours:     siennes.filter(d => d.statut === 'validee').reduce((n, d) => n + nbJoursOuvres(d.date_debut, d.date_fin), 0),
      validees:  siennes.filter(d => d.statut === 'validee').length,
      attente:   siennes.filter(d => d.statut === 'en_attente').length,
    }
  }), [agents, demandes])

  // ── Styles ──────────────────────────────────────────────────────────
  const s = {
    section: { marginBottom: 32 },
    titre:   { fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12 },
    card: {
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    },
    tr: { borderBottom: '0.5px solid var(--color-border)' },
    th: { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' },
    td: { padding: '10px 14px', fontSize: 13, color: 'var(--color-text)', verticalAlign: 'top' },
    input: {
      padding: '6px 10px', fontSize: 13,
      border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    boutonValider: {
      fontSize: 12, padding: '3px 10px', borderRadius: 6,
      border: '0.5px solid var(--color-success)', background: 'var(--color-success)',
      color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
    },
    boutonRefuser: {
      fontSize: 12, padding: '3px 10px', borderRadius: 6,
      border: '0.5px solid var(--color-danger)', background: 'transparent',
      color: 'var(--color-danger)', cursor: 'pointer', whiteSpace: 'nowrap',
    },
  }

  const badgeStatut = (statut) => ({
    fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10,
    background: STATUTS[statut]?.fond, color: STATUTS[statut]?.couleur, whiteSpace: 'nowrap',
  })

  return (
    <div style={{ maxWidth: 1180 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Congés IADE</h1>
        <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={s.input}>
          {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
        Demandes de congés des infirmiers anesthésistes : à valider ou à refuser.
      </div>

      {erreur && <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>{erreur}</div>}
      {succes && <div style={{ fontSize: 13, color: 'var(--color-success)', background: 'var(--color-success-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>{succes}</div>}

      {/* ── À traiter ── */}
      <div style={s.section}>
        <div style={s.titre}>Demandes à traiter ({enAttente.length})</div>
        {charge ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Chargement…</div>
        ) : enAttente.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Aucune demande en attente.</div>
        ) : (
          <div style={s.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>Agent</th>
                  <th style={s.th}>Période</th>
                  <th style={s.th}>Motif</th>
                  <th style={s.th}>Jours ouvrés</th>
                  <th style={s.th}>Précision</th>
                  <th style={s.th}>Décision</th>
                </tr>
              </thead>
              <tbody>
                {enAttente.map(d => (
                  <tr key={d.id} style={s.tr}>
                    <td style={{ ...s.td, fontWeight: 500 }}>{nomDe(d.user_id)}</td>
                    <td style={s.td}>{formatPeriode(d.date_debut, d.date_fin)}</td>
                    <td style={s.td}>{libelleType(d.type_conge)}</td>
                    <td style={s.td}>{nbJoursOuvres(d.date_debut, d.date_fin)}</td>
                    <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>{d.commentaire || '—'}</td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={s.boutonValider} disabled={enCours === d.id} onClick={() => decider(d, 'validee')}>Valider</button>
                        <button style={s.boutonRefuser} disabled={enCours === d.id} onClick={() => decider(d, 'refusee')}>Refuser</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Calendrier d'équipe ── */}
      <div style={s.section}>
        <div style={s.titre}>Calendrier des absences</div>
        <CalendrierConges
          annee={annee}
          mois={mois}
          absences={absences}
          chargement={chargeCal}
          onNaviguer={naviguer}
        />
      </div>

      {/* ── Récapitulatif par agent ── */}
      <div style={s.section}>
        <div style={s.titre}>Par agent — {annee} ({recap.length} IADE)</div>
        {recap.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
            Aucun compte IADE pour le moment. L'administrateur les crée depuis l'onglet « Comptes ».
          </div>
        ) : (
          <div style={s.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>Agent</th>
                  <th style={s.th}>E-mail</th>
                  <th style={s.th}>Congés validés</th>
                  <th style={s.th}>Jours ouvrés posés</th>
                  <th style={s.th}>En attente</th>
                </tr>
              </thead>
              <tbody>
                {recap.map(a => (
                  <tr key={a.id} style={s.tr}>
                    <td style={{ ...s.td, fontWeight: 500 }}>
                      {a.nom}
                      {!a.actif && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--color-text-tertiary)' }}>(désactivé)</span>}
                    </td>
                    <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>{a.email}</td>
                    <td style={s.td}>{a.validees}</td>
                    <td style={s.td}>{a.jours}</td>
                    <td style={s.td}>{a.attente > 0 ? <span style={badgeStatut('en_attente')}>{a.attente}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Historique ── */}
      <div style={s.section}>
        <div style={s.titre}>Demandes traitées — {annee} ({traitees.length})</div>
        {traitees.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Aucune demande traitée sur l'année.</div>
        ) : (
          <div style={s.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>Agent</th>
                  <th style={s.th}>Période</th>
                  <th style={s.th}>Motif</th>
                  <th style={s.th}>Réponse</th>
                  <th style={s.th}>Commentaire</th>
                  <th style={s.th}>Revenir dessus</th>
                </tr>
              </thead>
              <tbody>
                {traitees.map(d => (
                  <tr key={d.id} style={s.tr}>
                    <td style={{ ...s.td, fontWeight: 500 }}>{nomDe(d.user_id)}</td>
                    <td style={s.td}>{formatPeriode(d.date_debut, d.date_fin)}</td>
                    <td style={s.td}>{libelleType(d.type_conge)}</td>
                    <td style={s.td}><span style={badgeStatut(d.statut)}>{libelleStatut(d.statut)}</span></td>
                    <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>{d.motif_reponse || '—'}</td>
                    <td style={s.td}>
                      <button
                        style={d.statut === 'validee' ? s.boutonRefuser : s.boutonValider}
                        disabled={enCours === d.id}
                        onClick={() => decider(d, d.statut === 'validee' ? 'refusee' : 'validee')}
                      >
                        {d.statut === 'validee' ? 'Refuser finalement' : 'Valider finalement'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
