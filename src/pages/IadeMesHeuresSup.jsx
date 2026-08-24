// ============================================================
// IadeMesHeuresSup — page IADE : déclarer ses heures supplémentaires.
//
// L'agent indique le jour, le nombre d'heures, et DÉSIGNE le MAR qui les lui a
// demandées. C'est ce MAR qui valide (la gestion IADE peut trancher en secours
// s'il ne répond pas). Tant que personne n'a décidé, l'agent peut corriger ou
// retirer sa déclaration ; ensuite elle est figée (RLS).
//
// Les heures ajoutées directement par la gestion apparaissent ici aussi, déjà
// validées : l'agent en est informé, il n'a rien à approuver.
//
// Prop `apercu` = { userId, nom } : rend le MÊME écran en lecture seule pour la
// gestion (« Aperçu compte IADE ») — c'est ce que voit l'agent, sans pouvoir agir
// à sa place. `userId` peut être null : on montre alors l'écran vierge.
//
// Schéma + RLS : supabase/iade_heures_sup.sql
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import RecapHeuresSup from '../components/iade/RecapHeuresSup'
import {
  chargerMesHeuresSup, chargerMars, declarerHeures, modifierDeclaration,
  supprimerDeclaration, notifierHeuresSup,
} from '../utils/iadeHeuresSupApi'
import {
  MIN_HEURES, MAX_HEURES, formatHeures, libelleOrigine,
  verifierDeclaration, indexJoursDeclares, totalHeures, resumeHeures,
} from '../utils/iadeHeuresSup'
import { STATUTS, libelleStatut, formatJour } from '../utils/iadeConges'

const VIDE = { jour: '', heures: '', marId: '', commentaire: '' }

export default function IadeMesHeuresSup({ apercu = null }) {
  const { session, profile } = useAuth()
  const lectureSeule = apercu !== null
  const userId = lectureSeule ? apercu.userId : session?.user?.id
  const maintenant = new Date()
  const annee = maintenant.getFullYear()
  const [mois, setMois] = useState(maintenant.getMonth())

  const [lignes, setLignes] = useState([])
  const [mars,   setMars]   = useState([])
  const [charge, setCharge] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [succes, setSucces] = useState(null)
  const [envoi,  setEnvoi]  = useState(false)

  const [saisie,  setSaisie]  = useState(VIDE)
  const [editeId, setEditeId] = useState(null)   // déclaration en cours de correction

  const charger = useCallback(async () => {
    if (!userId) { setLignes([]); setCharge(false); return }
    setCharge(true)
    try {
      const [l, m] = await Promise.all([chargerMesHeuresSup(userId), chargerMars()])
      setLignes(l); setMars(m); setErreur(null)
    } catch {
      setErreur('Impossible de charger vos heures supplémentaires.')
    } finally {
      setCharge(false)
    }
  }, [userId])

  // Chargement initial (asynchrone : les setState arrivent après la requête).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { charger() }, [charger])

  // Le jour en cours de correction ne doit pas se bloquer lui-même.
  const dejaDeclares = useMemo(() => {
    const index = indexJoursDeclares(lignes)
    if (editeId) {
      for (const [iso, l] of index) if (l.id === editeId) index.delete(iso)
    }
    return index
  }, [lignes, editeId])

  const enAttente = useMemo(() => lignes.filter(l => l.statut === 'en_attente'), [lignes])
  const traitees  = useMemo(() => lignes.filter(l => l.statut !== 'en_attente'), [lignes])
  const validees  = useMemo(() => lignes.filter(l => l.statut === 'validee'), [lignes])

  const nomMar = useCallback(
    (id) => mars.find(m => m.id === id)?.nom ?? '—',
    [mars]
  )

  function changer(champ, valeur) {
    setSaisie(prev => ({ ...prev, [champ]: valeur }))
    setSucces(null)
  }

  // Le récapitulatif porte sur l'année en cours : on reste dans ses 12 mois.
  function naviguerMois(delta) {
    setMois(m => Math.min(11, Math.max(0, m + delta)))
  }

  function annulerEdition() {
    setEditeId(null); setSaisie(VIDE); setErreur(null)
  }

  function corriger(ligne) {
    setEditeId(ligne.id)
    setSaisie({
      jour:        ligne.jour,
      heures:      String(ligne.heures),
      marId:       ligne.mar_id ?? '',
      commentaire: ligne.commentaire ?? '',
    })
    setErreur(null); setSucces(null)
  }

  async function envoyer() {
    setErreur(null); setSucces(null)

    const heures = Number(saisie.heures)
    const probleme = verifierDeclaration({ ...saisie, heures }, dejaDeclares)
    if (probleme) { setErreur(probleme); return }

    setEnvoi(true)
    try {
      if (editeId) {
        await modifierDeclaration(editeId, { ...saisie, heures })
        setSucces('Déclaration corrigée.')
      } else {
        const creee = await declarerHeures({ userId, ...saisie, heures })
        // Le MAR désigné est prévenu par e-mail — sans lui, personne ne saurait
        // qu'il y a quelque chose à valider.
        await notifierHeuresSup({ type: 'declaration', ids: [creee.id] })
        setSucces(`Déclaration transmise à ${nomMar(saisie.marId)} : ${formatHeures(heures)} le ${formatJour(saisie.jour)}.`)
      }
      setSaisie(VIDE); setEditeId(null)
      await charger()
    } catch (err) {
      // 23505 = index unique (user_id, jour) : une déclaration existe déjà ce jour-là.
      setErreur(err?.code === '23505'
        ? 'Vous avez déjà une déclaration sur ce jour. Rechargez la page.'
        : "Envoi impossible. Réessayez ; si le problème persiste, prévenez la personne qui gère les IADE.")
    } finally {
      setEnvoi(false)
    }
  }

  async function retirer(ligne) {
    if (!confirm(`Retirer la déclaration de ${formatHeures(ligne.heures)} du ${formatJour(ligne.jour)} ?`)) return
    setErreur(null); setSucces(null)
    try {
      await supprimerDeclaration(ligne.id)
      if (editeId === ligne.id) annulerEdition()
      setSucces('Déclaration retirée.')
      await charger()
    } catch {
      setErreur('Retrait impossible (elle a peut-être déjà été traitée).')
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
    champ: {
      padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box',
      border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    label: { display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 },
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

  const nom = lectureSeule ? apercu.nom : (profile?.nom_complet?.trim() || profile?.email)

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Mes heures sup</h1>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
        {lectureSeule
          ? `${nom ?? 'Aucun agent sélectionné'} — le MAR qu'il désigne valide ses heures.`
          : `${nom} — indiquez le MAR qui vous a demandé ces heures : c'est lui qui les valide.`}
      </div>

      {erreur && <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>{erreur}</div>}
      {succes && <div style={{ fontSize: 13, color: 'var(--color-success)', background: 'var(--color-success-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>{succes}</div>}

      {/* ── Déclarer ── */}
      <div style={s.section}>
        <div style={s.titre}>{editeId ? 'Corriger la déclaration' : 'Déclarer des heures'}</div>
        <div style={{ ...s.card, padding: 20 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ flex: '1 1 160px' }}>
              <label style={s.label} htmlFor="hs-jour">Jour concerné</label>
              <input
                id="hs-jour" type="date" style={s.champ} disabled={lectureSeule}
                min={`${annee - 1}-01-01`} max={`${annee + 1}-12-31`}
                value={saisie.jour} onChange={e => changer('jour', e.target.value)}
              />
            </div>
            <div style={{ flex: '0 1 130px' }}>
              <label style={s.label} htmlFor="hs-heures">Heures ({MIN_HEURES} à {MAX_HEURES})</label>
              <input
                id="hs-heures" type="number" step="1" min={MIN_HEURES} max={MAX_HEURES} style={s.champ}
                disabled={lectureSeule}
                value={saisie.heures} onChange={e => changer('heures', e.target.value)}
              />
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <label style={s.label} htmlFor="hs-mar">MAR qui vous les a demandées</label>
              <select
                id="hs-mar" style={s.champ} disabled={lectureSeule}
                value={saisie.marId} onChange={e => changer('marId', e.target.value)}
              >
                <option value="">Choisir…</option>
                {mars.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={s.label} htmlFor="hs-com">Précision (facultatif)</label>
            <input
              id="hs-com" type="text" style={s.champ} maxLength={200} disabled={lectureSeule}
              placeholder="Ex. : bloc prolongé, urgence en fin de programme"
              value={saisie.commentaire} onChange={e => changer('commentaire', e.target.value)}
            />
          </div>

          <div style={{
            borderTop: '0.5px solid var(--color-border)', paddingTop: 14,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <div style={{ flex: '1 1 200px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {lectureSeule
                ? "Aperçu : les commandes sont inertes, on n'agit pas à la place de l'agent."
                : mars.length === 0 && !charge
                  ? 'Aucun MAR à désigner pour le moment.'
                  : 'Le MAR désigné reçoit un e-mail et valide depuis son dashboard.'}
            </div>
            {editeId && !lectureSeule && (
              <button type="button" style={s.boutonSec} onClick={annulerEdition}>Annuler la correction</button>
            )}
            <button
              type="button"
              disabled={envoi || lectureSeule}
              onClick={envoyer}
              style={{
                padding: '10px 18px',
                background: 'var(--color-primary)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-md)',
                fontSize: 14, fontWeight: 500,
                cursor: envoi ? 'wait' : 'pointer',
                opacity: lectureSeule ? 0.45 : envoi ? 0.7 : 1,
              }}
            >
              {envoi ? 'Envoi…' : editeId ? 'Enregistrer la correction' : 'Déclarer'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Récapitulatif de l'année ── */}
      <div style={s.section}>
        <div style={s.titre}>Mes heures sur {annee}</div>
        {charge ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Chargement…</div>
        ) : (
          <RecapHeuresSup lignes={lignes} annee={annee} mois={mois} onNaviguer={naviguerMois} />
        )}
      </div>

      {/* ── En attente ── */}
      <div style={s.section}>
        <div style={s.titre}>En attente de validation ({resumeHeures(enAttente)})</div>
        {charge ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Chargement…</div>
        ) : enAttente.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Aucune déclaration en attente.</div>
        ) : (
          <div style={s.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>Jour</th>
                  <th style={s.th}>Heures</th>
                  <th style={s.th}>Validation attendue de</th>
                  <th style={s.th}>Précision</th>
                  <th style={s.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {enAttente.map(l => (
                  <tr key={l.id} style={s.tr}>
                    <td style={s.td}>{formatJour(l.jour)}</td>
                    <td style={{ ...s.td, fontWeight: 500 }}>{formatHeures(l.heures)}</td>
                    <td style={s.td}>{nomMar(l.mar_id)}</td>
                    <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>{l.commentaire || '—'}</td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={s.boutonSec} disabled={lectureSeule} onClick={() => corriger(l)}>Corriger</button>
                        <button style={s.boutonSec} disabled={lectureSeule} onClick={() => retirer(l)}>Retirer</button>
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
          Déclarations traitées ({traitees.length}) — {formatHeures(totalHeures(validees))} validées cette année
        </div>
        {traitees.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Aucune réponse pour le moment.</div>
        ) : (
          <div style={s.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>Jour</th>
                  <th style={s.th}>Heures</th>
                  <th style={s.th}>Origine</th>
                  <th style={s.th}>Réponse</th>
                  <th style={s.th}>Commentaire</th>
                </tr>
              </thead>
              <tbody>
                {traitees.map(l => (
                  <tr key={l.id} style={s.tr}>
                    <td style={s.td}>{formatJour(l.jour)}</td>
                    <td style={{ ...s.td, fontWeight: 500 }}>{formatHeures(l.heures)}</td>
                    <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>{libelleOrigine(l.origine)}</td>
                    <td style={s.td}><span style={badgeStatut(l.statut)}>{libelleStatut(l.statut)}</span></td>
                    <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>
                      {l.motif_reponse || l.commentaire || '—'}
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
