// ============================================================
// IadeGestion — « Congés, HS et rempla » : l'écran de gestion des IADE.
// Accessible au gestionnaire des IADE (profiles.is_gestion_iade), au faiseur de
// planning (is_faiseur) et à l'admin — cf. peut_gerer_iade() côté base.
//
// Quatre problématiques distinctes, quatre onglets — pas un seul long
// défilement : on vient ici pour traiter UNE chose (des congés à valider, des
// heures à trancher, la synthèse à envoyer à la comptable), et le reste n'est
// que du bruit à ce moment-là. Les données, elles, sont chargées une seule fois
// pour l'année : changer d'onglet ne relance aucune requête.
//
// Les jours sont stockés un par un ; l'écran les regroupe en plages contiguës de
// même nature issues d'un même envoi, pour qu'une semaine de congés se traite
// d'un seul clic sans perdre la possibilité de répondre jour par jour.
//
// L'export mensuel destiné à la comptable vit dans son propre composant
// (components/iade/SyntheseMensuelle.jsx).
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react'
import CalendrierConges from '../components/iade/CalendrierConges'
import SyntheseMensuelle from '../components/iade/SyntheseMensuelle'
import HeuresSupGestion from '../components/iade/HeuresSupGestion'
import RemplaGestion from '../components/iade/RemplaGestion'
import RecapPlanningColle from '../components/iade/RecapPlanningColle'
import { chargerDemandes, chargerAgentsIade, deciderJours, chargerCalendrierIade, notifierConges } from '../utils/iadeCongesApi'
import { chargerHeuresSupAnnee } from '../utils/iadeHeuresSupApi'
import {
  bornesMois, libelleType, libelleStatut, formatPeriode,
  plages, compterParType, TYPES_CONGE, STATUTS,
} from '../utils/iadeConges'
import { ANNEES } from '../utils/calendrier'

// Une problématique = un onglet. `attente` désigne le compteur affiché en
// pastille : ce qui attend une décision, donc ce qui doit sauter aux yeux.
const ONGLETS = [
  { id: 'conges',   icone: '🌴', label: 'Congés',    attente: 'conges',
    texte: 'Jours posés par les infirmiers anesthésistes — congés payés et récupérations de jours fériés — à valider ou à refuser.' },
  { id: 'hs',       icone: '⏱', label: 'Heures sup', attente: 'hs',
    texte: 'Heures supplémentaires déclarées par les agents, et heures ajoutées directement par la gestion. Le MAR désigné tranche ; vous pouvez trancher en secours s\'il ne répond pas.' },
  { id: 'rempla',   icone: '↺', label: 'Rempla',
    texte: 'Les jours où il faut un remplaçant, le mail à envoyer pour en chercher un, et le nom de celui qu\'on a trouvé — qui s\'inscrit alors dans le planning.' },
  { id: 'synthese', icone: '📊', label: 'Synthèse comptable',
    texte: 'Les récapitulatifs mensuels à transmettre : ce que le dashboard a validé, agent par agent, et le récap tiré du fichier du planning collé.' },
]

export default function IadeGestion() {
  const maintenant = new Date()
  const [annee, setAnnee] = useState(maintenant.getFullYear())
  const [mois,  setMois]  = useState(maintenant.getMonth())
  const [vue,   setVue]   = useState('conges')

  const [demandes,  setDemandes]  = useState([])   // jours posés sur l'année
  const [heuresSup, setHeuresSup] = useState([])   // heures sup de l'année
  const [agents,   setAgents]   = useState([])
  const [absences, setAbsences] = useState([])   // calendrier du mois affiché
  const [charge,   setCharge]   = useState(true)
  const [chargeCal, setChargeCal] = useState(true)
  const [erreur,   setErreur]   = useState(null)
  const [succes,   setSucces]   = useState(null)
  const [enCours,  setEnCours]  = useState(null) // clé de la plage en cours de décision

  // Jours de l'année + heures sup de l'année + comptes IADE.
  const charger = useCallback(async () => {
    setCharge(true)
    try {
      const [d, h, a] = await Promise.all([
        chargerDemandes(annee), chargerHeuresSupAnnee(annee), chargerAgentsIade(),
      ])
      setDemandes(d); setHeuresSup(h); setAgents(a); setErreur(null)
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

  // Une ligne à traiter = des jours consécutifs, de même nature, issus du même envoi.
  const enAttente = useMemo(
    () => plages(demandes.filter(d => d.statut === 'en_attente'), ['user_id', 'lot', 'type_conge', 'statut']),
    [demandes]
  )
  // Le motif de refus entre dans la clé : deux refus motivés différemment restent séparés.
  const traitees = useMemo(
    () => plages(demandes.filter(d => d.statut !== 'en_attente'), ['user_id', 'type_conge', 'statut', 'motif_reponse']),
    [demandes]
  )

  async function decider(plage, statut) {
    const quoi = `${nomDe(plage.user_id)} — ${libelleType(plage.type_conge)}, ${formatPeriode(plage.debut, plage.fin)} (${plage.nb} jour(s))`
    let motif = null

    if (statut === 'refusee') {
      const saisie = prompt(`Refuser : ${quoi}\n\nMotif communiqué à l'agent (facultatif) :`, '')
      if (saisie === null) return          // annulation de la boîte de dialogue
      motif = saisie
    } else if (!confirm(`Valider : ${quoi} ?`)) {
      return
    }

    setErreur(null); setSucces(null); setEnCours(plage.ids[0])
    try {
      await deciderJours(plage.ids, statut, motif)
      await notifierConges({ type: 'decision', ids: plage.ids })
      setSucces(`${plage.nb} jour(s) ${statut === 'validee' ? 'validé(s)' : 'refusé(s)'} — ${quoi}.`)
      await charger()
    } catch {
      setErreur('Décision impossible (droits insuffisants ou demande supprimée).')
    } finally {
      setEnCours(null)
    }
  }

  // Le calendrier attend des lignes déjà nommées (comme celles de la RPC des congés).
  const heuresSupNommees = useMemo(
    () => heuresSup.map(h => ({ ...h, nom: nomDe(h.user_id) })),
    [heuresSup, nomDe]
  )

  // Récapitulatif par agent sur l'année : jours validés par nature + jours en attente.
  const recap = useMemo(() => agents.map(a => {
    const siens = demandes.filter(d => d.user_id === a.id)
    return {
      ...a,
      valides: compterParType(siens.filter(d => d.statut === 'validee')),
      attente: siens.filter(d => d.statut === 'en_attente').length,
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
      // Défilement horizontal plutôt que rognage : sur téléphone, les tableaux
      // se consultent en glissant le doigt au lieu de déborder de l'écran.
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

  const totalAttente = enAttente.reduce((n, p) => n + p.nb, 0)
  const hsAttente = heuresSup.filter(h => h.statut === 'en_attente').length
  const compteurs = { conges: totalAttente, hs: hsAttente }

  // Même langage visuel que les onglets d'« Aperçu compte IADE ».
  const styleOnglet = (actif) => ({
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '8px 16px', fontSize: 13, fontWeight: actif ? 600 : 400,
    borderRadius: 'var(--radius-md)',
    border: actif ? '0.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
    background: actif ? 'var(--color-primary-light)' : 'var(--color-bg)',
    color: actif ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
    cursor: 'pointer',
  })

  // Pastille de ce qui attend une décision. Rien à traiter = pas de pastille :
  // un « 0 » permanent finit par ne plus rien vouloir dire.
  const pastille = {
    fontSize: 11, fontWeight: 700, lineHeight: 1, padding: '3px 7px', borderRadius: 10,
    background: 'var(--color-danger)', color: '#fff',
  }

  const actif = ONGLETS.find(o => o.id === vue) ?? ONGLETS[0]

  return (
    <div style={{ maxWidth: 1180 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Congés, HS et rempla</h1>
        <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={s.input}>
          {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {ONGLETS.map(o => {
          const n = compteurs[o.attente] ?? 0
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={vue === o.id}
              style={styleOnglet(vue === o.id)}
              onClick={() => setVue(o.id)}
            >
              <span aria-hidden="true">{o.icone}</span>
              {o.label}
              {n > 0 && <span style={pastille}>{n}</span>}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
        {actif.texte}
      </div>

      {erreur && <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>{erreur}</div>}
      {succes && <div style={{ fontSize: 13, color: 'var(--color-success)', background: 'var(--color-success-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>{succes}</div>}

      {/* ══ Onglet « Congés » ══════════════════════════════════════════════ */}
      {/* ── À traiter ── */}
      {vue === 'conges' && (<>
      <div style={s.section}>
        <div style={s.titre}>Demandes à traiter ({totalAttente} jour(s))</div>
        {charge ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Chargement…</div>
        ) : enAttente.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Aucune demande en attente.</div>
        ) : (
          <div style={s.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>Agent</th>
                  <th style={s.th}>Période</th>
                  <th style={s.th}>Nature</th>
                  <th style={s.th}>Jours</th>
                  <th style={s.th}>Décision</th>
                </tr>
              </thead>
              <tbody>
                {enAttente.map(p => (
                  <tr key={p.ids[0]} style={s.tr}>
                    <td style={{ ...s.td, fontWeight: 500 }}>{nomDe(p.user_id)}</td>
                    <td style={s.td}>{formatPeriode(p.debut, p.fin)}</td>
                    <td style={s.td}>{libelleType(p.type_conge)}</td>
                    <td style={s.td}>{p.nb}</td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={s.boutonValider} disabled={enCours === p.ids[0]} onClick={() => decider(p, 'validee')}>Valider</button>
                        <button style={s.boutonRefuser} disabled={enCours === p.ids[0]} onClick={() => decider(p, 'refusee')}>Refuser</button>
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
      {/* Il reste dans « Congés » : on y lit d'abord qui est absent. Les heures
          sup y figurent en second plan, elles ne le déplacent pas ailleurs. */}
      <div style={s.section}>
        <div style={s.titre}>Calendrier des absences et des heures sup</div>
        <CalendrierConges
          annee={annee}
          mois={mois}
          absences={absences}
          heuresSup={heuresSupNommees}
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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>Agent</th>
                  <th style={s.th}>E-mail</th>
                  {TYPES_CONGE.map(t => <th key={t.id} style={s.th}>{t.label} validés</th>)}
                  <th style={s.th}>Total validé</th>
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
                    {TYPES_CONGE.map(t => <td key={t.id} style={s.td}>{a.valides[t.id]}</td>)}
                    <td style={{ ...s.td, fontWeight: 500 }}>
                      {TYPES_CONGE.reduce((n, t) => n + a.valides[t.id], 0)}
                    </td>
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
        <div style={s.titre}>Jours traités — {annee} ({traitees.reduce((n, p) => n + p.nb, 0)} jour(s))</div>
        {traitees.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Aucune décision sur l'année.</div>
        ) : (
          <div style={s.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>Agent</th>
                  <th style={s.th}>Période</th>
                  <th style={s.th}>Nature</th>
                  <th style={s.th}>Jours</th>
                  <th style={s.th}>Réponse</th>
                  <th style={s.th}>Commentaire</th>
                  <th style={s.th}>Revenir dessus</th>
                </tr>
              </thead>
              <tbody>
                {traitees.map(p => (
                  <tr key={p.ids[0]} style={s.tr}>
                    <td style={{ ...s.td, fontWeight: 500 }}>{nomDe(p.user_id)}</td>
                    <td style={s.td}>{formatPeriode(p.debut, p.fin)}</td>
                    <td style={s.td}>{libelleType(p.type_conge)}</td>
                    <td style={s.td}>{p.nb}</td>
                    <td style={s.td}><span style={badgeStatut(p.statut)}>{libelleStatut(p.statut)}</span></td>
                    <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>{p.motif_reponse || '—'}</td>
                    <td style={s.td}>
                      <button
                        style={p.statut === 'validee' ? s.boutonRefuser : s.boutonValider}
                        disabled={enCours === p.ids[0]}
                        onClick={() => decider(p, p.statut === 'validee' ? 'refusee' : 'validee')}
                      >
                        {p.statut === 'validee' ? 'Refuser finalement' : 'Valider finalement'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>)}

      {/* ══ Onglet « Heures sup » ══════════════════════════════════════════ */}
      {vue === 'hs' && (
        <div style={s.section}>
          <HeuresSupGestion
            heuresSup={heuresSup}
            agents={agents}
            annee={annee}
            onChange={charger}
          />
        </div>
      )}

      {/* ══ Onglet « Rempla » ══════════════════════════════════════════════ */}
      {vue === 'rempla' && (
        <div style={s.section}>
          <RemplaGestion annee={annee} conges={demandes} agents={agents} />
        </div>
      )}

      {/* ══ Onglet « Synthèse comptable » ══════════════════════════════════ */}
      {/* Deux récapitulatifs du même mois, deux sources : ce que le dashboard a
          validé, et ce que dit le fichier du planning. Ils vivent côte à côte
          parce que c'est le même geste — préparer ce qu'on transmet. */}
      {vue === 'synthese' && (
        <>
          <div style={s.section}>
            <div style={s.titre}>D'après le dashboard — congés et heures sup validés</div>
            <SyntheseMensuelle jours={demandes} heuresSup={heuresSup} agents={agents} annee={annee} />
          </div>
          <div style={s.section}>
            <div style={s.titre}>D'après le fichier du planning — mois collé</div>
            <RecapPlanningColle />
          </div>
        </>
      )}
    </div>
  )
}
