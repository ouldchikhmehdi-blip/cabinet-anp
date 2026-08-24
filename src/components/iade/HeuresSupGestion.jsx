// ============================================================
// HeuresSupGestion — bloc « heures supplémentaires » de l'écran Congés IADE.
//
// Deux usages pour la gestion :
//   • AJOUTER des heures à un agent : elles naissent VALIDÉES (la base l'impose),
//     l'agent est informé par e-mail, il n'a rien à approuver ;
//   • TRANCHER EN SECOURS une déclaration adressée à un MAR qui ne répond pas.
//     Le circuit normal reste : l'agent déclare → le MAR désigné valide.
//
// Composant à part et sans mémoïsation manuelle : gardé dans IadeGestion, un bloc
// de cette taille empêche le compilateur React d'optimiser toute la page.
// ============================================================
import { useState, useMemo } from 'react'
import {
  ajouterHeuresGestion, deciderHeures, notifierHeuresSup,
} from '../../utils/iadeHeuresSupApi'
import {
  MIN_HEURES, MAX_HEURES, formatHeures, libelleOrigine,
  verifierAjoutGestion, indexJoursDeclares, totalHeures, resumeHeures,
} from '../../utils/iadeHeuresSup'
import { STATUTS, libelleStatut, formatJour } from '../../utils/iadeConges'

const VIDE = { userId: '', jour: '', heures: '', commentaire: '' }

export default function HeuresSupGestion({ heuresSup = [], agents = [], annee, onChange }) {
  const [saisie,  setSaisie]  = useState(VIDE)
  const [envoi,   setEnvoi]   = useState(false)
  const [erreur,  setErreur]  = useState(null)
  const [succes,  setSucces]  = useState(null)
  const [enCours, setEnCours] = useState(null)

  const nomDe = (userId) => agents.find(a => a.id === userId)?.nom ?? 'Agent inconnu'

  const enAttente = useMemo(() => heuresSup.filter(l => l.statut === 'en_attente'), [heuresSup])
  const traitees  = useMemo(() => heuresSup.filter(l => l.statut !== 'en_attente'), [heuresSup])
  const validees  = useMemo(() => heuresSup.filter(l => l.statut === 'validee'), [heuresSup])

  // Jours déjà pris pour l'agent sélectionné : la base refuse le doublon,
  // autant le dire avant d'envoyer.
  const dejaDeclares = useMemo(
    () => indexJoursDeclares(heuresSup.filter(l => l.user_id === saisie.userId)),
    [heuresSup, saisie.userId]
  )

  function changer(champ, valeur) {
    setSaisie(prev => ({ ...prev, [champ]: valeur }))
    setSucces(null)
  }

  async function ajouter() {
    setErreur(null); setSucces(null)

    const heures = Number(saisie.heures)
    const probleme = verifierAjoutGestion({ ...saisie, heures }, dejaDeclares)
    if (probleme) { setErreur(probleme); return }

    setEnvoi(true)
    try {
      const creee = await ajouterHeuresGestion({ ...saisie, heures })
      // Ces heures sont déjà actées : l'agent est informé, pas sollicité.
      await notifierHeuresSup({ type: 'ajout', ids: [creee.id] })
      setSucces(`${formatHeures(heures)} ajoutées à ${nomDe(saisie.userId)} le ${formatJour(saisie.jour)} — l'agent est prévenu.`)
      setSaisie(VIDE)
      await onChange?.()
    } catch (err) {
      setErreur(err?.code === '23505'
        ? 'Cet agent a déjà une ligne sur ce jour.'
        : "Ajout impossible. Réessayez ; si le problème persiste, vérifiez vos droits.")
    } finally {
      setEnvoi(false)
    }
  }

  async function decider(ligne, statut) {
    const quoi = `${nomDe(ligne.user_id)} — ${formatHeures(ligne.heures)} le ${formatJour(ligne.jour)}`
    let motif = null

    if (statut === 'refusee') {
      const saisieMotif = prompt(`Refuser : ${quoi}\n\nMotif communiqué à l'agent (facultatif) :`, '')
      if (saisieMotif === null) return
      motif = saisieMotif
    } else if (!confirm(`Valider : ${quoi} ?\n\nVous tranchez à la place du MAR désigné.`)) {
      return
    }

    setErreur(null); setSucces(null); setEnCours(ligne.id)
    try {
      await deciderHeures([ligne.id], statut, motif)
      await notifierHeuresSup({ type: 'decision', ids: [ligne.id] })
      setSucces(`${quoi} — ${statut === 'validee' ? 'validées' : 'refusées'}.`)
      await onChange?.()
    } catch {
      setErreur('Décision impossible (droits insuffisants ou ligne supprimée).')
    } finally {
      setEnCours(null)
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────
  const s = {
    card: {
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      overflowX: 'auto',
    },
    tr: { borderBottom: '0.5px solid var(--color-border)' },
    th: { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' },
    td: { padding: '10px 14px', fontSize: 13, color: 'var(--color-text)', verticalAlign: 'top' },
    champ: {
      padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box',
      border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    label: { display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 },
    sousTitre: { fontSize: 13, fontWeight: 600, color: 'var(--color-text)', margin: '20px 0 10px' },
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
    <div>
      {erreur && <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>{erreur}</div>}
      {succes && <div style={{ fontSize: 13, color: 'var(--color-success)', background: 'var(--color-success-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>{succes}</div>}

      {/* ── Ajouter des heures à un agent ── */}
      <div style={{ ...s.card, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
          Ces heures sont <strong>immédiatement acquises</strong> : l'agent en est informé par e-mail,
          il n'a rien à valider.
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={s.label} htmlFor="hsg-agent">Agent</label>
            <select id="hsg-agent" style={s.champ} value={saisie.userId} onChange={e => changer('userId', e.target.value)}>
              <option value="">Choisir…</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={s.label} htmlFor="hsg-jour">Jour</label>
            <input
              id="hsg-jour" type="date" style={s.champ}
              min={`${annee}-01-01`} max={`${annee}-12-31`}
              value={saisie.jour} onChange={e => changer('jour', e.target.value)}
            />
          </div>
          <div style={{ flex: '0 1 120px' }}>
            <label style={s.label} htmlFor="hsg-heures">Heures</label>
            <input
              id="hsg-heures" type="number" step="1" min={MIN_HEURES} max={MAX_HEURES} style={s.champ}
              value={saisie.heures} onChange={e => changer('heures', e.target.value)}
            />
          </div>
          <div style={{ flex: '2 1 240px' }}>
            <label style={s.label} htmlFor="hsg-com">Précision (facultatif)</label>
            <input
              id="hsg-com" type="text" style={s.champ} maxLength={200}
              placeholder="Ex. : renfort viscérale"
              value={saisie.commentaire} onChange={e => changer('commentaire', e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          disabled={envoi}
          onClick={ajouter}
          style={{
            padding: '10px 18px',
            background: 'var(--color-primary)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-md)',
            fontSize: 14, fontWeight: 500,
            cursor: envoi ? 'wait' : 'pointer', opacity: envoi ? 0.7 : 1,
          }}
        >
          {envoi ? 'Ajout…' : 'Ajouter ces heures'}
        </button>
      </div>

      {/* ── Déclarations en attente d'un MAR ── */}
      <div style={s.sousTitre}>
        En attente d'un MAR ({resumeHeures(enAttente)})
      </div>
      {enAttente.length === 0 ? (
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
          Aucune déclaration en attente.
        </div>
      ) : (
        <div style={s.card}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', padding: '10px 14px 0' }}>
            C'est au MAR désigné de répondre. Ne tranchez ici que s'il ne le fait pas
            et que la paie approche.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr style={s.tr}>
                <th style={s.th}>Agent</th>
                <th style={s.th}>Jour</th>
                <th style={s.th}>Heures</th>
                <th style={s.th}>Précision</th>
                <th style={s.th}>Trancher en secours</th>
              </tr>
            </thead>
            <tbody>
              {enAttente.map(l => (
                <tr key={l.id} style={s.tr}>
                  <td style={{ ...s.td, fontWeight: 500 }}>{nomDe(l.user_id)}</td>
                  <td style={s.td}>{formatJour(l.jour)}</td>
                  <td style={{ ...s.td, fontWeight: 500 }}>{formatHeures(l.heures)}</td>
                  <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>{l.commentaire || '—'}</td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={s.boutonValider} disabled={enCours === l.id} onClick={() => decider(l, 'validee')}>Valider</button>
                      <button style={s.boutonRefuser} disabled={enCours === l.id} onClick={() => decider(l, 'refusee')}>Refuser</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Historique ── */}
      <div style={s.sousTitre}>
        Traitées — {annee} ({traitees.length}) · {formatHeures(totalHeures(validees))} validées
      </div>
      {traitees.length === 0 ? (
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Aucune décision sur l'année.</div>
      ) : (
        <div style={s.card}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={s.tr}>
                <th style={s.th}>Agent</th>
                <th style={s.th}>Jour</th>
                <th style={s.th}>Heures</th>
                <th style={s.th}>Origine</th>
                <th style={s.th}>Réponse</th>
                <th style={s.th}>Commentaire</th>
                <th style={s.th}>Revenir dessus</th>
              </tr>
            </thead>
            <tbody>
              {traitees.map(l => (
                <tr key={l.id} style={s.tr}>
                  <td style={{ ...s.td, fontWeight: 500 }}>{nomDe(l.user_id)}</td>
                  <td style={s.td}>{formatJour(l.jour)}</td>
                  <td style={{ ...s.td, fontWeight: 500 }}>{formatHeures(l.heures)}</td>
                  <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>{libelleOrigine(l.origine)}</td>
                  <td style={s.td}><span style={badgeStatut(l.statut)}>{libelleStatut(l.statut)}</span></td>
                  <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>
                    {l.motif_reponse || l.commentaire || '—'}
                  </td>
                  <td style={s.td}>
                    <button
                      style={l.statut === 'validee' ? s.boutonRefuser : s.boutonValider}
                      disabled={enCours === l.id}
                      onClick={() => decider(l, l.statut === 'validee' ? 'refusee' : 'validee')}
                    >
                      {l.statut === 'validee' ? 'Retirer' : 'Valider finalement'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
