// ============================================================
// IadeMesConges — page IADE : déposer une demande de congé et suivre ses demandes.
// Seule page où un compte IADE écrit. Tant qu'une demande est « en attente »,
// l'agent peut la retirer ; une fois décidée, elle est figée (RLS).
//
// Prop `apercu` = { userId, nom } : rend le MÊME écran en lecture seule pour la
// gestion (« Aperçu compte IADE ») — c'est ce que voit l'agent, sans pouvoir agir
// à sa place. `userId` peut être null : on montre alors l'écran vierge.
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { chargerMesConges, creerDemande, supprimerDemande } from '../utils/iadeCongesApi'
import {
  TYPES_CONGE, STATUTS, libelleType, libelleStatut,
  nbJours, nbJoursOuvres, formatPeriode, verifierDemande,
} from '../utils/iadeConges'

export default function IadeMesConges({ apercu = null }) {
  const { session, profile } = useAuth()
  const lectureSeule = apercu !== null
  const userId = lectureSeule ? apercu.userId : session?.user?.id

  const [demandes, setDemandes] = useState([])
  const [charge,   setCharge]   = useState(true)
  const [erreur,   setErreur]   = useState(null)
  const [succes,   setSucces]   = useState(null)
  const [envoi,    setEnvoi]    = useState(false)

  const [type,        setType]        = useState('conges')
  const [dateDebut,   setDateDebut]   = useState('')
  const [dateFin,     setDateFin]     = useState('')
  const [commentaire, setCommentaire] = useState('')

  const charger = useCallback(async () => {
    if (!userId) { setDemandes([]); setCharge(false); return }
    setCharge(true)
    try {
      setDemandes(await chargerMesConges(userId))
      setErreur(null)
    } catch {
      setErreur('Impossible de charger vos demandes.')
    } finally {
      setCharge(false)
    }
  }, [userId])

  // Chargement initial (asynchrone : les setState arrivent après la requête).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { charger() }, [charger])

  // La date de fin suit la date de début tant qu'elle n'a pas été saisie ou qu'elle précède.
  function majDebut(v) {
    setDateDebut(v)
    if (!dateFin || dateFin < v) setDateFin(v)
  }

  async function envoyer(e) {
    e.preventDefault()
    setErreur(null); setSucces(null)

    const probleme = verifierDemande({ dateDebut, dateFin, type }, demandes)
    if (probleme) { setErreur(probleme); return }

    setEnvoi(true)
    try {
      await creerDemande({ userId, dateDebut, dateFin, type, commentaire })
      setSucces(`Demande transmise (${formatPeriode(dateDebut, dateFin)}). Vous serez informé de la réponse ici.`)
      setDateDebut(''); setDateFin(''); setCommentaire(''); setType('conges')
      await charger()
    } catch {
      setErreur("Envoi impossible. Réessayez ; si le problème persiste, prévenez la personne qui gère les congés.")
    } finally {
      setEnvoi(false)
    }
  }

  async function retirer(d) {
    if (!confirm(`Retirer votre demande ${formatPeriode(d.date_debut, d.date_fin)} ?`)) return
    setErreur(null); setSucces(null)
    try {
      await supprimerDemande(d.id)
      setSucces('Demande retirée.')
      await charger()
    } catch {
      setErreur('Retrait impossible (la demande a peut-être déjà été traitée).')
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────
  const s = {
    section: { marginBottom: 32 },
    titre:   { fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12 },
    card: {
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      // Défilement horizontal plutôt que rognage : sur téléphone, les tableaux
      // se consultent en glissant le doigt au lieu de déborder de l'écran.
      overflowX: 'auto',
    },
    label: { fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 },
    input: {
      padding: '8px 12px',
      fontSize: 13,
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      outline: 'none',
    },
    tr: { borderBottom: '0.5px solid var(--color-border)' },
    th: { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' },
    td: { padding: '10px 14px', fontSize: 13, color: 'var(--color-text)', verticalAlign: 'top' },
    boutonSec: {
      fontSize: 12, padding: '3px 10px', borderRadius: 6,
      border: '0.5px solid var(--color-border)', background: 'transparent',
      color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
    },
    boutonPrimary: {
      padding: '8px 16px',
      background: 'var(--color-primary)', color: '#fff',
      border: 'none', borderRadius: 'var(--radius-md)',
      fontSize: 13, fontWeight: 500,
      cursor: envoi ? 'wait' : 'pointer', opacity: envoi ? 0.7 : 1,
    },
  }

  const badgeStatut = (statut) => ({
    fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10,
    background: STATUTS[statut]?.fond, color: STATUTS[statut]?.couleur, whiteSpace: 'nowrap',
  })

  const enAttente = demandes.filter(d => d.statut === 'en_attente')
  const traitees  = demandes.filter(d => d.statut !== 'en_attente')
  const nom = lectureSeule ? apercu.nom : (profile?.nom_complet?.trim() || profile?.email)

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Mes congés</h1>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
        {lectureSeule
          ? `${nom ?? 'Aucun agent sélectionné'} — ses demandes sont transmises à la personne qui gère les IADE.`
          : `${nom} — vos demandes sont transmises à la personne qui gère les IADE.`}
      </div>

      {erreur && <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>{erreur}</div>}
      {succes && <div style={{ fontSize: 13, color: 'var(--color-success)', background: 'var(--color-success-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>{succes}</div>}

      {/* ── Nouvelle demande ── */}
      <div style={s.section}>
        <div style={s.titre}>Nouvelle demande</div>
        <div style={s.card}>
          {/* En aperçu, le formulaire est montré tel que l'agent le voit, mais inerte. */}
          <form onSubmit={envoyer} style={{ padding: 20, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={s.label} htmlFor="iade-type">Motif</label>
              <select id="iade-type" value={type} disabled={lectureSeule} onChange={e => setType(e.target.value)} style={s.input}>
                {TYPES_CONGE.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label} htmlFor="iade-debut">Du</label>
              <input id="iade-debut" type="date" required={!lectureSeule} disabled={lectureSeule} value={dateDebut} onChange={e => majDebut(e.target.value)} style={s.input} />
            </div>
            <div>
              <label style={s.label} htmlFor="iade-fin">Au (inclus)</label>
              <input id="iade-fin" type="date" required={!lectureSeule} disabled={lectureSeule} value={dateFin} min={dateDebut || undefined} onChange={e => setDateFin(e.target.value)} style={s.input} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={s.label} htmlFor="iade-com">Précision (facultatif)</label>
              <input
                id="iade-com"
                type="text"
                value={commentaire}
                disabled={lectureSeule}
                onChange={e => setCommentaire(e.target.value)}
                placeholder="ex. mariage, garde d'enfant…"
                style={{ ...s.input, width: '100%' }}
              />
            </div>
            <button type="submit" disabled={envoi || lectureSeule} style={{ ...s.boutonPrimary, opacity: lectureSeule ? 0.5 : s.boutonPrimary.opacity }}>
              {envoi ? 'Envoi…' : 'Envoyer la demande'}
            </button>
          </form>

          {dateDebut && dateFin && dateFin >= dateDebut && (
            <div style={{
              borderTop: '0.5px solid var(--color-border)',
              padding: '10px 20px',
              fontSize: 12,
              color: 'var(--color-text-secondary)',
            }}>
              {formatPeriode(dateDebut, dateFin)} — {nbJours(dateDebut, dateFin)} jour(s) calendaire(s),
              dont <strong>{nbJoursOuvres(dateDebut, dateFin)}</strong> jour(s) ouvré(s).
            </div>
          )}
        </div>
      </div>

      {/* ── Demandes en attente ── */}
      <div style={s.section}>
        <div style={s.titre}>En attente de réponse ({enAttente.length})</div>
        {charge ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Chargement…</div>
        ) : enAttente.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Aucune demande en attente.</div>
        ) : (
          <div style={s.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>Période</th>
                  <th style={s.th}>Motif</th>
                  <th style={s.th}>Jours ouvrés</th>
                  <th style={s.th}>Précision</th>
                  <th style={s.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {enAttente.map(d => (
                  <tr key={d.id} style={s.tr}>
                    <td style={s.td}>{formatPeriode(d.date_debut, d.date_fin)}</td>
                    <td style={s.td}>{libelleType(d.type_conge)}</td>
                    <td style={s.td}>{nbJoursOuvres(d.date_debut, d.date_fin)}</td>
                    <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>{d.commentaire || '—'}</td>
                    <td style={s.td}>
                      <button style={s.boutonSec} disabled={lectureSeule} onClick={() => retirer(d)}>Retirer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Historique ── */}
      <div style={s.section}>
        <div style={s.titre}>Demandes traitées ({traitees.length})</div>
        {traitees.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Aucune demande traitée pour le moment.</div>
        ) : (
          <div style={s.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>Période</th>
                  <th style={s.th}>Motif</th>
                  <th style={s.th}>Jours ouvrés</th>
                  <th style={s.th}>Réponse</th>
                  <th style={s.th}>Commentaire de la réponse</th>
                </tr>
              </thead>
              <tbody>
                {traitees.map(d => (
                  <tr key={d.id} style={s.tr}>
                    <td style={s.td}>{formatPeriode(d.date_debut, d.date_fin)}</td>
                    <td style={s.td}>{libelleType(d.type_conge)}</td>
                    <td style={s.td}>{nbJoursOuvres(d.date_debut, d.date_fin)}</td>
                    <td style={s.td}><span style={badgeStatut(d.statut)}>{libelleStatut(d.statut)}</span></td>
                    <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>{d.motif_reponse || '—'}</td>
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
