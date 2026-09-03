// ============================================================
// CreneauxGestion — onglet « Créneaux » : les salles qui ne tournent pas.
//
// La gestion note qu'un créneau saute — telle salle, tels jours, journée entière
// ou demi-journée, et quel opérateur est absent. L'information remonte dans
// l'onglet « Planning IADE » : c'est là qu'on voit d'un coup d'œil où il y a du
// monde en trop, et c'est le point de départ de la décision RH.
//
// La saisie suit la façon dont l'information arrive : un opérateur envoie ses
// absences d'un bloc, on clique ses jours au calendrier et on nomme la salle une
// seule fois. Et comme ça bouge tout le temps (un opérateur se décommande, puis
// revient), tout se corrige et se retire ligne par ligne, rien n'est définitif.
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  chargerCreneaux, ajouterCreneaux, modifierCreneau, supprimerCreneau,
} from '../../utils/iadeCreneauxApi'
import {
  MOMENTS, momentCourt, indexerParJour, sallesConnues,
  compterDemiJournees, verifierCreneau, verifierLot, basculerJour, resumeJours,
} from '../../utils/iadeCreneaux'
import { formatJour, bornesMois } from '../../utils/iadeConges'
import { MOIS_FR } from '../../utils/calendrier'
import CalendrierCreneaux from './CalendrierCreneaux'

const VIDE = { jours: [], moment: 'journee', salle: '', absent: '', note: '' }

export default function CreneauxGestion({ annee }) {
  const maintenant = new Date()
  const [mois, setMois] = useState(maintenant.getMonth())
  const [creneaux, setCreneaux] = useState([])
  const [saisie, setSaisie] = useState(VIDE)
  const [ancre, setAncre] = useState(null)
  const [editeId, setEditeId] = useState(null)
  const [charge, setCharge] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [succes, setSucces] = useState(null)
  const [portee, setPortee] = useState('mois')

  const charger = useCallback(async () => {
    setCharge(true)
    try {
      setCreneaux(await chargerCreneaux(annee))
      setErreur(null)
    } catch {
      setErreur('Impossible de charger les créneaux.')
    } finally {
      setCharge(false)
    }
  }, [annee])

  // Chargement initial et à chaque changement d'année (asynchrone).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { charger() }, [charger])

  const { debut, fin } = bornesMois(annee, mois)
  const affiches = useMemo(() => {
    const dans = portee === 'mois'
      ? creneaux.filter(c => c.jour >= debut && c.jour <= fin)
      : creneaux
    return [...dans].sort((a, b) => a.jour.localeCompare(b.jour) || a.salle.localeCompare(b.salle, 'fr'))
  }, [creneaux, portee, debut, fin])

  const salles = useMemo(() => sallesConnues(creneaux), [creneaux])
  const parJour = useMemo(() => indexerParJour(affiches), [affiches])
  // Le calendrier montre l'année entière : on peut sélectionner à cheval sur deux mois.
  const fermesParJour = useMemo(() => indexerParJour(creneaux), [creneaux])
  const demiJournees = compterDemiJournees(affiches)

  function changer(champ, valeur) {
    setSaisie(prev => ({ ...prev, [champ]: valeur }))
    setSucces(null)
  }

  // En correction, un clic déplace le jour du créneau ; en saisie, il l'ajoute
  // ou le retire du lot.
  function clicJour(iso, { plage } = {}) {
    setSucces(null); setErreur(null)
    setSaisie(prev => ({
      ...prev,
      jours: editeId ? [iso] : basculerJour(prev.jours, iso, { plage, ancre }),
    }))
    setAncre(iso)
  }

  function viderSelection() {
    setSaisie(prev => ({ ...prev, jours: [] }))
    setAncre(null); setSucces(null); setErreur(null)
  }

  function corriger(c) {
    setEditeId(c.id)
    setSaisie({
      jours: [c.jour], moment: c.moment, salle: c.salle,
      absent: c.absent ?? '', note: c.note ?? '',
    })
    setMois(Number(c.jour.slice(5, 7)) - 1)
    setAncre(c.jour)
    setErreur(null); setSucces(null)
  }

  function annulerEdition() {
    setEditeId(null); setSaisie(VIDE); setAncre(null); setErreur(null)
  }

  async function enregistrer() {
    setErreur(null); setSucces(null)

    if (editeId) {
      const jour = saisie.jours[0] ?? ''
      const probleme = verifierCreneau({ ...saisie, jour, id: editeId }, creneaux)
      if (probleme) { setErreur(probleme); return }
      setEnvoi(true)
      try {
        await modifierCreneau(editeId, {
          jour, moment: saisie.moment, salle: saisie.salle,
          absent: saisie.absent || null, note: saisie.note || null,
        })
        setSucces('Créneau corrigé.')
        setSaisie(VIDE); setEditeId(null); setAncre(null)
        await charger()
      } catch (err) {
        setErreur(messageEchec(err))
      } finally {
        setEnvoi(false)
      }
      return
    }

    const { message, aPoser, refus } = verifierLot(saisie, creneaux)
    if (message) { setErreur(message); return }

    setEnvoi(true)
    try {
      await ajouterCreneaux(aPoser, saisie)
      const quoi = `${saisie.salle} — ${momentCourt(saisie.moment).toLowerCase()}`
      const ignores = refus.length > 0
        ? ` (${refus.length} jour(s) déjà noté(s), laissé(s) de côté : ${resumeJours(refus.map(r => r.jour))})`
        : ''
      setSucces(`${aPoser.length} créneau(x) noté(s) — ${quoi} : ${resumeJours(aPoser)}.${ignores}`)
      setSaisie(VIDE); setAncre(null)
      await charger()
    } catch (err) {
      setErreur(messageEchec(err))
    } finally {
      setEnvoi(false)
    }
  }

  function messageEchec(err) {
    return err?.code === '23505'
      ? 'Cette salle est déjà notée sur ce créneau.'
      : "Enregistrement impossible. Réessayez ; si le problème persiste, vérifiez vos droits."
  }

  async function retirer(c) {
    if (!confirm(`Retirer ce créneau ?\n\n${c.salle} — ${momentCourt(c.moment).toLowerCase()} du ${formatJour(c.jour)}`)) return
    setErreur(null); setSucces(null)
    try {
      await supprimerCreneau(c.id)
      if (editeId === c.id) annulerEdition()
      setSucces('Créneau retiré — la salle retourne à son fonctionnement normal.')
      await charger()
    } catch {
      setErreur('Retrait impossible.')
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────
  const carte = {
    background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)', padding: 20,
  }
  const champ = {
    padding: '7px 10px', fontSize: 13, boxSizing: 'border-box',
    border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
  }
  const label = { display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }
  const bouton = (variante) => ({
    fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `0.5px solid var(--color-${variante})`,
    background: variante === 'primary' ? 'var(--color-primary)' : 'transparent',
    color: variante === 'primary' ? '#fff' : `var(--color-${variante})`,
  })
  const th = { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const td = { padding: '8px 14px', fontSize: 13, color: 'var(--color-text)', verticalAlign: 'middle' }
  const tr = { borderBottom: '0.5px solid var(--color-border)' }
  const titre = { fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12 }
  const pastilleMoment = (moment) => ({
    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
    background: moment === 'journee' ? 'var(--color-danger-light)' : 'var(--color-amber-light)',
    color: moment === 'journee' ? 'var(--color-danger)' : 'var(--color-amber)',
  })

  const choisis = saisie.jours.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {erreur && <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px' }}>{erreur}</div>}
      {succes && <div style={{ fontSize: 13, color: 'var(--color-success)', background: 'var(--color-success-light)', borderRadius: 8, padding: '10px 14px' }}>{succes}</div>}

      {/* ── Saisie ── */}
      <div style={carte}>
        <div style={titre}>{editeId ? 'Corriger le créneau' : 'Noter des créneaux en moins'}</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <CalendrierCreneaux
            annee={annee}
            mois={mois}
            onNaviguer={(pas) => setMois(m => Math.min(11, Math.max(0, m + pas)))}
            selection={saisie.jours}
            dejaFermes={fermesParJour}
            onClicJour={clicJour}
            monoJour={!!editeId}
          />

          <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              fontSize: 13, padding: '8px 12px', borderRadius: 8,
              background: choisis > 0 ? 'var(--color-primary-light)' : 'var(--color-bg)',
              color: choisis > 0 ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <span style={{ fontWeight: 600 }}>
                {choisis === 0 ? 'Aucun jour choisi'
                  : choisis === 1 ? '1 jour choisi' : `${choisis} jours choisis`}
              </span>
              {choisis > 0 && <span style={{ fontSize: 12 }}>{resumeJours(saisie.jours)}</span>}
              {choisis > 0 && !editeId && (
                <button type="button" onClick={viderSelection}
                        style={{ ...bouton('border'), marginLeft: 'auto', color: 'var(--color-text-secondary)' }}>
                  Tout effacer
                </button>
              )}
            </div>

            <label>
              <span style={label}>Quand — s'applique à tous les jours choisis</span>
              <select value={saisie.moment} onChange={e => changer('moment', e.target.value)}
                      style={{ ...champ, width: '100%' }}>
                {MOMENTS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label>
              <span style={label}>Salle qui ne tourne pas</span>
              <input type="text" list="salles-connues" value={saisie.salle} maxLength={60}
                     placeholder="Bloc B, Endoscopie 2…"
                     onChange={e => changer('salle', e.target.value)}
                     style={{ ...champ, width: '100%' }} />
              <datalist id="salles-connues">
                {salles.map(s => <option key={s} value={s} />)}
              </datalist>
            </label>
            <label>
              <span style={label}>Opérateur absent (facultatif)</span>
              <input type="text" value={saisie.absent} maxLength={80} placeholder="Dr Martin"
                     onChange={e => changer('absent', e.target.value)}
                     style={{ ...champ, width: '100%' }} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={enregistrer} disabled={envoi || choisis === 0}
                      style={{ ...bouton('primary'), padding: '8px 16px', fontSize: 13, opacity: (envoi || choisis === 0) ? 0.6 : 1 }}>
                {editeId ? 'Enregistrer'
                  : choisis > 1 ? `Ajouter les ${choisis} jours` : 'Ajouter'}
              </button>
              {editeId && (
                <button type="button" onClick={annulerEdition} style={{ ...bouton('border'), padding: '8px 14px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  Annuler
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
              Une ligne par salle et par jour : deux salles fermées le même matin font
              deux saisies. Ce que tu notes ici apparaît dans l'onglet
              <strong> Planning IADE</strong>, en face du jour.
            </div>
          </div>
        </div>
      </div>

      {/* ── Liste ── */}
      <div style={carte}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ ...titre, marginBottom: 0 }}>Créneaux en moins</div>
          <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Voir&nbsp;:
            <select value={portee} onChange={e => setPortee(e.target.value)} style={{ ...champ, marginLeft: 8 }}>
              <option value="mois">{MOIS_FR[mois]} {annee}</option>
              <option value="annee">toute l'année {annee}</option>
            </select>
          </label>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {affiches.length === 0
              ? 'Rien de signalé'
              : `${affiches.length} créneau(x) sur ${parJour.size} jour(s) — ${demiJournees} demi-journée(s)`}
          </span>
        </div>

        {charge ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Chargement…</div>
        ) : affiches.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Aucune salle signalée sur cette période. Tout tourne normalement.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={tr}>
                  <th style={th}>Jour</th>
                  <th style={th}>Quand</th>
                  <th style={th}>Salle</th>
                  <th style={th}>Opérateur absent</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {affiches.map(c => (
                  <tr key={c.id} style={{ ...tr, background: c.id === editeId ? 'var(--color-primary-light)' : undefined }}>
                    <td style={{ ...td, fontWeight: 500, whiteSpace: 'nowrap' }}>{formatJour(c.jour)}</td>
                    <td style={td}><span style={pastilleMoment(c.moment)}>{momentCourt(c.moment)}</span></td>
                    <td style={{ ...td, fontWeight: 500 }}>{c.salle}</td>
                    <td style={{ ...td, color: 'var(--color-text-secondary)' }}>{c.absent || '—'}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" style={bouton('primary')} onClick={() => corriger(c)}>Corriger</button>
                        <button type="button" style={bouton('danger')} onClick={() => retirer(c)}>Retirer</button>
                      </div>
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
