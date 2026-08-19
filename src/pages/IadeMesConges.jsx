// ============================================================
// IadeMesConges — page IADE : poser ses jours de congé et suivre ses demandes.
// Seule page où un compte IADE écrit.
//
// L'agent choisit la nature du jour (congé payé / récupération de jour férié)
// puis clique les jours dans le calendrier. Aucun motif ne lui est demandé : la
// raison d'un congé ne regarde pas l'employeur. Tant qu'un jour est « en
// attente », l'agent peut le retirer ; une fois décidé, il est figé (RLS).
//
// Prop `apercu` = { userId, nom } : rend le MÊME écran en lecture seule pour la
// gestion (« Aperçu compte IADE ») — c'est ce que voit l'agent, sans pouvoir agir
// à sa place. `userId` peut être null : on montre alors l'écran vierge.
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import CalendrierSaisie from '../components/iade/CalendrierSaisie'
import { chargerMesConges, poserJours, supprimerJours, notifierConges } from '../utils/iadeCongesApi'
import {
  TYPES_CONGE, TYPE_DEFAUT, STATUTS,
  libelleType, libelleStatut, formatPeriode, resumeTypes,
  plages, indexJoursPoses, verifierSelection,
} from '../utils/iadeConges'

export default function IadeMesConges({ apercu = null }) {
  const { session, profile } = useAuth()
  const lectureSeule = apercu !== null
  const userId = lectureSeule ? apercu.userId : session?.user?.id

  const maintenant = new Date()
  const [annee, setAnnee] = useState(maintenant.getFullYear())
  const [mois,  setMois]  = useState(maintenant.getMonth())

  const [demandes, setDemandes] = useState([])
  const [charge,   setCharge]   = useState(true)
  const [erreur,   setErreur]   = useState(null)
  const [succes,   setSucces]   = useState(null)
  const [envoi,    setEnvoi]    = useState(false)

  const [typeActif, setTypeActif] = useState(TYPE_DEFAUT)
  const [selection, setSelection] = useState(new Map()) // iso → type

  const charger = useCallback(async () => {
    if (!userId) { setDemandes([]); setCharge(false); return }
    setCharge(true)
    try {
      setDemandes(await chargerMesConges(userId))
      setErreur(null)
    } catch {
      setErreur('Impossible de charger vos congés.')
    } finally {
      setCharge(false)
    }
  }, [userId])

  // Chargement initial (asynchrone : les setState arrivent après la requête).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { charger() }, [charger])

  const dejaPoses = useMemo(() => indexJoursPoses(demandes), [demandes])

  const enAttente = useMemo(
    () => plages(demandes.filter(d => d.statut === 'en_attente')),
    [demandes]
  )
  // Le motif de refus entre dans la clé : deux refus motivés différemment ne
  // doivent pas être fondus dans une seule ligne.
  const traitees = useMemo(
    () => plages(demandes.filter(d => d.statut !== 'en_attente'), ['type_conge', 'statut', 'motif_reponse']),
    [demandes]
  )

  const listeSelection = useMemo(
    () => [...selection.entries()].map(([jour, type]) => ({ jour, type })).sort((a, b) => a.jour.localeCompare(b.jour)),
    [selection]
  )

  function naviguer(delta) {
    const d = new Date(Date.UTC(annee, mois + delta, 1))
    setAnnee(d.getUTCFullYear())
    setMois(d.getUTCMonth())
  }

  // Un clic pose le jour dans la nature active ; le même clic sur la même nature
  // l'enlève ; sur l'autre nature, il la remplace.
  function basculerJour(iso) {
    setSelection(prev => {
      const suivant = new Map(prev)
      if (suivant.get(iso) === typeActif) suivant.delete(iso)
      else suivant.set(iso, typeActif)
      return suivant
    })
    setSucces(null)
  }

  async function envoyer() {
    setErreur(null); setSucces(null)

    const probleme = verifierSelection(listeSelection, dejaPoses)
    if (probleme) { setErreur(probleme); return }

    setEnvoi(true)
    try {
      const posees = await poserJours({ userId, jours: listeSelection })
      await notifierConges({ type: 'pose', lot: posees[0]?.lot })
      setSucces(`Demande transmise : ${listeSelection.length} jour(s) — ${resumeTypes(listeSelection.map(j => ({ type_conge: j.type })))}.`)
      setSelection(new Map())
      await charger()
    } catch (err) {
      // 23505 = index unique (user_id, jour) : le jour a été posé entre-temps.
      setErreur(err?.code === '23505'
        ? 'Un de ces jours a déjà été posé entre-temps. Rechargez la page.'
        : "Envoi impossible. Réessayez ; si le problème persiste, prévenez la personne qui gère les congés.")
    } finally {
      setEnvoi(false)
    }
  }

  async function retirer(plage) {
    if (!confirm(`Retirer ${plage.nb} jour(s) — ${libelleType(plage.type_conge)}, ${formatPeriode(plage.debut, plage.fin)} ?`)) return
    setErreur(null); setSucces(null)
    try {
      // Prévient la gestion AVANT la suppression (après, les lignes n'existent plus à relire).
      await notifierConges({ type: 'retrait', ids: plage.ids })
      await supprimerJours(plage.ids)
      setSucces('Jours retirés.')
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
    tr: { borderBottom: '0.5px solid var(--color-border)' },
    th: { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' },
    td: { padding: '10px 14px', fontSize: 13, color: 'var(--color-text)', verticalAlign: 'top' },
    boutonSec: {
      fontSize: 12, padding: '3px 10px', borderRadius: 6,
      border: '0.5px solid var(--color-border)', background: 'transparent',
      color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
    },
  }

  const badgeStatut = (statut) => ({
    fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10,
    background: STATUTS[statut]?.fond, color: STATUTS[statut]?.couleur, whiteSpace: 'nowrap',
  })

  // Sélecteur de nature : deux gros boutons, plus sûrs au doigt qu'une liste
  // déroulante et toujours visibles pendant qu'on clique dans le calendrier.
  const boutonType = (t) => {
    const actif = typeActif === t.id
    return {
      flex: '1 1 160px',
      padding: '10px 14px',
      fontSize: 13,
      fontWeight: actif ? 600 : 500,
      textAlign: 'left',
      borderRadius: 'var(--radius-md)',
      border: `1px solid ${actif ? t.couleur : 'var(--color-border)'}`,
      background: actif ? t.fond : 'var(--color-bg)',
      color: actif ? t.couleur : 'var(--color-text-secondary)',
      cursor: lectureSeule ? 'default' : 'pointer',
      opacity: lectureSeule ? 0.6 : 1,
    }
  }

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

      {/* ── Poser des jours ── */}
      <div style={s.section}>
        <div style={s.titre}>Poser des jours</div>
        <div style={{ ...s.card, padding: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
            1. Choisissez la nature du jour · 2. Cliquez les jours dans le calendrier · 3. Envoyez.
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {TYPES_CONGE.map(t => (
              <button
                key={t.id}
                type="button"
                disabled={lectureSeule}
                aria-pressed={typeActif === t.id}
                onClick={() => setTypeActif(t.id)}
                style={boutonType(t)}
              >
                <span style={{ fontWeight: 700, marginRight: 8 }}>{t.court}</span>
                {t.label}
              </button>
            ))}
          </div>

          <CalendrierSaisie
            annee={annee}
            mois={mois}
            onNaviguer={naviguer}
            typeActif={typeActif}
            selection={selection}
            dejaPoses={dejaPoses}
            onBasculerJour={basculerJour}
            lectureSeule={lectureSeule}
          />

          <div style={{
            borderTop: '0.5px solid var(--color-border)',
            marginTop: 18, paddingTop: 14,
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <div style={{ flex: '1 1 220px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {listeSelection.length === 0
                ? 'Aucun jour sélectionné.'
                : <><strong style={{ color: 'var(--color-text)' }}>{listeSelection.length} jour(s)</strong> — {resumeTypes(listeSelection.map(j => ({ type_conge: j.type })))}</>}
            </div>
            {listeSelection.length > 0 && !lectureSeule && (
              <button type="button" style={s.boutonSec} onClick={() => setSelection(new Map())}>Tout effacer</button>
            )}
            <button
              type="button"
              disabled={envoi || lectureSeule || listeSelection.length === 0}
              onClick={envoyer}
              style={{
                padding: '10px 18px',
                background: 'var(--color-primary)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-md)',
                fontSize: 14, fontWeight: 500,
                cursor: envoi ? 'wait' : 'pointer',
                opacity: (lectureSeule || listeSelection.length === 0) ? 0.45 : envoi ? 0.7 : 1,
              }}
            >
              {envoi ? 'Envoi…' : 'Envoyer la demande'}
            </button>
          </div>
        </div>
      </div>

      {/* ── En attente ── */}
      <div style={s.section}>
        <div style={s.titre}>En attente de réponse ({enAttente.reduce((n, p) => n + p.nb, 0)} jour(s))</div>
        {charge ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Chargement…</div>
        ) : enAttente.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Aucun jour en attente.</div>
        ) : (
          <div style={s.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>Période</th>
                  <th style={s.th}>Nature</th>
                  <th style={s.th}>Jours</th>
                  <th style={s.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {enAttente.map(p => (
                  <tr key={p.ids[0]} style={s.tr}>
                    <td style={s.td}>{formatPeriode(p.debut, p.fin)}</td>
                    <td style={s.td}>{libelleType(p.type_conge)}</td>
                    <td style={s.td}>{p.nb}</td>
                    <td style={s.td}>
                      <button style={s.boutonSec} disabled={lectureSeule} onClick={() => retirer(p)}>Retirer</button>
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
        <div style={s.titre}>Jours traités ({traitees.reduce((n, p) => n + p.nb, 0)} jour(s))</div>
        {traitees.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Aucune réponse pour le moment.</div>
        ) : (
          <div style={s.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>Période</th>
                  <th style={s.th}>Nature</th>
                  <th style={s.th}>Jours</th>
                  <th style={s.th}>Réponse</th>
                  <th style={s.th}>Commentaire</th>
                </tr>
              </thead>
              <tbody>
                {traitees.map(p => (
                  <tr key={p.ids[0]} style={s.tr}>
                    <td style={s.td}>{formatPeriode(p.debut, p.fin)}</td>
                    <td style={s.td}>{libelleType(p.type_conge)}</td>
                    <td style={s.td}>{p.nb}</td>
                    <td style={s.td}><span style={badgeStatut(p.statut)}>{libelleStatut(p.statut)}</span></td>
                    <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>{p.motif_reponse || '—'}</td>
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
