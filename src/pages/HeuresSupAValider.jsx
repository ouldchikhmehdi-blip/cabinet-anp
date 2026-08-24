// ============================================================
// HeuresSupAValider — écran MAR : valider les heures sup qu'un IADE déclare
// avoir faites À MA demande.
//
// Chaque associé ne voit QUE les déclarations qui le désignent : la RPC
// iade_hs_pour_mar() filtre sur mar_id = auth.uid(). Un associé qui n'est pas
// gestionnaire IADE ne peut pas lire les profils des agents — c'est la RPC qui
// joint leur nom, et seulement pour ces lignes-là.
//
// Il peut valider ou refuser, rien d'autre : le trigger en base lui interdit de
// réécrire le nombre d'heures ou le jour (supabase/iade_heures_sup.sql).
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react'
import { chargerHeuresSupPourMar, deciderHeures, notifierHeuresSup } from '../utils/iadeHeuresSupApi'
import { formatHeures, totalHeures, resumeHeures, finFenetre, peutRevenirDessus } from '../utils/iadeHeuresSup'
import { STATUTS, libelleStatut, formatJour } from '../utils/iadeConges'
import { ANNEES } from '../utils/calendrier'

export default function HeuresSupAValider() {
  const [annee, setAnnee] = useState(new Date().getFullYear())

  const [lignes,  setLignes]  = useState([])
  const [charge,  setCharge]  = useState(true)
  const [erreur,  setErreur]  = useState(null)
  const [succes,  setSucces]  = useState(null)
  const [enCours, setEnCours] = useState(null)

  const charger = useCallback(async () => {
    setCharge(true)
    try {
      setLignes(await chargerHeuresSupPourMar(annee))
      setErreur(null)
    } catch {
      setErreur('Impossible de charger les déclarations.')
    } finally {
      setCharge(false)
    }
  }, [annee])

  // Chargement initial et à chaque changement d'année (asynchrone).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { charger() }, [charger])

  const enAttente = useMemo(() => lignes.filter(l => l.statut === 'en_attente'), [lignes])
  const traitees  = useMemo(() => lignes.filter(l => l.statut !== 'en_attente'), [lignes])
  const validees  = useMemo(() => lignes.filter(l => l.statut === 'validee'), [lignes])

  async function decider(ligne, statut) {
    const quoi = `${ligne.nom} — ${formatHeures(ligne.heures)} le ${formatJour(ligne.jour)}`
    let motif = null

    if (statut === 'refusee') {
      const saisie = prompt(`Refuser : ${quoi}\n\nMotif communiqué à l'agent (facultatif) :`, '')
      if (saisie === null) return          // annulation de la boîte de dialogue
      motif = saisie
    } else if (!confirm(`Valider : ${quoi} ?\n\nVous confirmez avoir demandé ces heures.`)) {
      return
    }

    setErreur(null); setSucces(null); setEnCours(ligne.id)
    try {
      await deciderHeures([ligne.id], statut, motif)
      await notifierHeuresSup({ type: 'decision', ids: [ligne.id] })
      setSucces(`${quoi} — ${statut === 'validee' ? 'validées' : 'refusées'}.`)
      await charger()
    } catch {
      setErreur('Décision impossible (déclaration modifiée ou supprimée entre-temps).')
    } finally {
      setEnCours(null)
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
      overflowX: 'auto',
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
    <div style={{ maxWidth: 1080 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Heures sup à valider</h1>
        <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={s.input}>
          {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
        Heures supplémentaires que des IADE déclarent avoir faites <strong>à votre demande</strong>.
        Vous ne voyez que celles qui vous désignent. Vous pouvez aussi répondre directement
        depuis l'e-mail reçu, sans passer par ici. Une erreur se corrige jusqu'à la
        <strong> fin du mois suivant</strong> le jour concerné ; ensuite, seule la gestion IADE
        peut intervenir.
      </div>

      {erreur && <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>{erreur}</div>}
      {succes && <div style={{ fontSize: 13, color: 'var(--color-success)', background: 'var(--color-success-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>{succes}</div>}

      {/* ── À valider ── */}
      <div style={s.section}>
        <div style={s.titre}>À valider ({resumeHeures(enAttente)})</div>
        {charge ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Chargement…</div>
        ) : enAttente.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
            Rien à valider. Un IADE vous préviendra par e-mail s'il déclare des heures faites à votre demande.
          </div>
        ) : (
          <div style={s.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>Agent</th>
                  <th style={s.th}>Jour</th>
                  <th style={s.th}>Heures</th>
                  <th style={s.th}>Précision</th>
                  <th style={s.th}>Décision</th>
                </tr>
              </thead>
              <tbody>
                {enAttente.map(l => (
                  <tr key={l.id} style={s.tr}>
                    <td style={{ ...s.td, fontWeight: 500 }}>{l.nom}</td>
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
      </div>

      {/* ── Historique ── */}
      <div style={s.section}>
        <div style={s.titre}>
          Traitées — {annee} ({traitees.length}) · {formatHeures(totalHeures(validees))} validées
        </div>
        {traitees.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Aucune décision sur l'année.</div>
        ) : (
          <div style={s.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>Agent</th>
                  <th style={s.th}>Jour</th>
                  <th style={s.th}>Heures</th>
                  <th style={s.th}>Réponse</th>
                  <th style={s.th}>Revenir dessus</th>
                </tr>
              </thead>
              <tbody>
                {traitees.map(l => {
                  const ouvert = peutRevenirDessus(l)
                  return (
                    <tr key={l.id} style={s.tr}>
                      <td style={{ ...s.td, fontWeight: 500 }}>{l.nom}</td>
                      <td style={s.td}>{formatJour(l.jour)}</td>
                      <td style={{ ...s.td, fontWeight: 500 }}>{formatHeures(l.heures)}</td>
                      <td style={s.td}><span style={badgeStatut(l.statut)}>{libelleStatut(l.statut)}</span></td>
                      <td style={s.td}>
                        {ouvert ? (
                          <>
                            <button
                              style={l.statut === 'validee' ? s.boutonRefuser : s.boutonValider}
                              disabled={enCours === l.id}
                              onClick={() => decider(l, l.statut === 'validee' ? 'refusee' : 'validee')}
                            >
                              {l.statut === 'validee' ? 'Refuser finalement' : 'Valider finalement'}
                            </button>
                            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                              jusqu'au {formatJour(finFenetre(l.jour))}
                            </div>
                          </>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                            Délai passé (le {formatJour(finFenetre(l.jour))}) — voir la gestion IADE
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
