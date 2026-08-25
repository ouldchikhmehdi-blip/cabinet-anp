// ============================================================
// IadeApercu — « Aperçu compte IADE » : voir l'application telle qu'un agent la voit,
// depuis un compte de gestion (gestionnaire IADE, faiseur, admin), sans second compte.
//
// Strictement en LECTURE : on ne dépose, ne retire ni ne déclare rien à la place de
// l'agent. Trois de ses quatre écrans sont reproduits ici — « Mes congés »,
// « Mes heures sup » et « Congés de l'équipe ». Le quatrième, « Sync agenda »,
// n'y est pas : la gestion l'ouvre directement depuis sa propre navigation.
//
// ⚠️ Tout écran ajouté à la navigation d'un agent (cf. iadeAgentItems dans
// Sidebar.jsx) doit être ajouté ici aussi, sinon l'aperçu ment par omission.
// ============================================================
import { useState, useEffect } from 'react'
import IadeMesConges from './IadeMesConges'
import IadeMesHeuresSup from './IadeMesHeuresSup'
import IadePlanning from './IadePlanning'
import CalendrierConges from '../components/iade/CalendrierConges'
import { chargerAgentsIade, chargerCalendrierIade } from '../utils/iadeCongesApi'
import { bornesMois } from '../utils/iadeConges'

export default function IadeApercu() {
  const maintenant = new Date()
  const [agents,  setAgents]  = useState([])
  const [agentId, setAgentId] = useState('')
  const [erreur,  setErreur]  = useState(null)
  const [ecran,   setEcran]   = useState('mes-conges') // 'mes-conges' | 'mes-heures-sup' | 'equipe'

  const [annee, setAnnee] = useState(maintenant.getFullYear())
  const [mois,  setMois]  = useState(maintenant.getMonth())
  const [absences,  setAbsences]  = useState([])
  const [chargeCal, setChargeCal] = useState(true)

  useEffect(() => {
    let annule = false
    chargerAgentsIade()
      .then(liste => {
        if (annule) return
        setAgents(liste)
        setAgentId(prev => prev || liste[0]?.id || '')
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger la liste des IADE.') })
    return () => { annule = true }
  }, [])

  useEffect(() => {
    if (ecran !== 'equipe') return
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
  }, [annee, mois, ecran])

  function naviguer(delta) {
    const d = new Date(Date.UTC(annee, mois + delta, 1))
    setAnnee(d.getUTCFullYear())
    setMois(d.getUTCMonth())
  }

  const agent = agents.find(a => a.id === agentId) ?? null

  const input = {
    padding: '6px 10px', fontSize: 13,
    border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
  }

  const onglet = (actif) => ({
    padding: '6px 14px', fontSize: 12,
    borderRadius: 'var(--radius-md)',
    border: actif ? '0.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
    background: actif ? 'var(--color-primary-light)' : 'var(--color-bg)',
    color: actif ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
    cursor: 'pointer',
  })

  return (
    <div style={{ maxWidth: 1180 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Aperçu d'un compte IADE</h1>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        L'application telle qu'un infirmier anesthésiste la voit en se connectant. Avec
        « Sync agenda », que vous ouvrez depuis votre propre menu, ces écrans sont les
        <strong> seuls</strong> auxquels son compte donne accès.
      </div>

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
          {erreur}
        </div>
      )}

      {/* ── Barre d'aperçu ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        background: 'var(--color-amber-light)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px 16px',
        marginBottom: 20,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-amber)' }}>
          👁 Aperçu — lecture seule
        </span>

        <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Écran de&nbsp;:
          <select
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            disabled={agents.length === 0}
            style={{ ...input, marginLeft: 8 }}
          >
            {agents.length === 0
              ? <option value="">aucun compte IADE créé</option>
              : agents.map(a => (
                  <option key={a.id} value={a.id}>{a.nom}{a.actif ? '' : ' (désactivé)'}</option>
                ))}
          </select>
        </label>

        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button type="button" style={onglet(ecran === 'mes-conges')} onClick={() => setEcran('mes-conges')}>
            🌴 Mes congés
          </button>
          <button type="button" style={onglet(ecran === 'mes-heures-sup')} onClick={() => setEcran('mes-heures-sup')}>
            ⏱ Mes heures sup
          </button>
          <button type="button" style={onglet(ecran === 'equipe')} onClick={() => setEcran('equipe')}>
            📆 Congés de l'équipe
          </button>
          {/* Le planning est identique pour tous : pas de prop `apercu`, il n'y a
              rien à personnaliser par agent. */}
          <button type="button" style={onglet(ecran === 'planning')} onClick={() => setEcran('planning')}>
            📋 Planning IADE
          </button>
        </div>
      </div>

      {agents.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
          Aucun compte IADE n'existe encore : l'écran ci-dessous est celui que verra le premier
          agent invité (onglet « Comptes » → rôle « IADE (congés uniquement) »).
        </div>
      )}

      {/* ── Rendu de l'écran choisi, dans un cadre pour bien marquer l'aperçu ── */}
      <div style={{
        border: '0.5px dashed var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 20,
        background: 'var(--color-bg)',
      }}>
        {ecran === 'mes-conges' ? (
          <IadeMesConges
            key={agentId || 'vide'}
            apercu={{ userId: agentId || null, nom: agent?.nom ?? null }}
          />
        ) : ecran === 'mes-heures-sup' ? (
          <IadeMesHeuresSup
            key={agentId || 'vide'}
            apercu={{ userId: agentId || null, nom: agent?.nom ?? null }}
          />
        ) : ecran === 'planning' ? (
          <IadePlanning />
        ) : (
          <div style={{ maxWidth: 1000 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Congés de l'équipe</h1>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
              Absences demandées ou validées de l'équipe IADE. Utile avant de poser une date.
            </div>
            <CalendrierConges
              annee={annee}
              mois={mois}
              absences={absences}
              chargement={chargeCal}
              onNaviguer={naviguer}
            />
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 12 }}>
              L'agent voit exactement ces données : la nature des jours et leur statut, mais
              ni les motifs de refus, ni les jours refusés de ses collègues.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
