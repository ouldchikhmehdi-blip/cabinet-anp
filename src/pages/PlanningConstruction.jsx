import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEE_DEFAUT } from '../utils/desiderata'
import { definirGardeNavigation } from '../utils/gardeNavigation'
import PlanningCalendrier from './PlanningCalendrier'
import PlanningObjectifs from './PlanningObjectifs'
import PlanningWeekends from './PlanningWeekends'
import PlanningVacances from './PlanningVacances'
import PlanningRea from './PlanningRea'
import PlanningNoel from './PlanningNoel'
import PlanningSemaines from './PlanningSemaines'

// Étapes successives du faiseur.
// Une seule entrée sidebar « Construction planning » → assistant guidé Précédent/Suivant.
const ETAPES = [
  { id: 'calendrier', titre: 'Base calendrier' },
  { id: 'objectifs', titre: 'Objectifs' },
  { id: 'weekends', titre: 'Week-ends' },
  { id: 'vacances', titre: 'Vacances' },
  { id: 'rea', titre: 'Réa' },
  { id: 'noel', titre: 'Noël' },
  { id: 'semaine', titre: 'En semaine' },
]

export default function PlanningConstruction() {
  const { profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [i, setI] = useState(0)
  const [annee, setAnnee] = useState(ANNEE_DEFAUT) // partagée entre toutes les étapes
  const [statuts, setStatuts] = useState({})       // { <etapeId>: 'enregistre' | 'modifie' | 'vierge' }

  // Callbacks stables (sinon l'effet de chargement des sous-pages se relancerait à chaque rendu).
  const statutCalendrier = useCallback(st => setStatuts(p => ({ ...p, calendrier: st })), [])
  const statutObjectifs = useCallback(st => setStatuts(p => ({ ...p, objectifs: st })), [])
  const statutWeekends = useCallback(st => setStatuts(p => ({ ...p, weekends: st })), [])
  const statutVacances = useCallback(st => setStatuts(p => ({ ...p, vacances: st })), [])
  const statutRea = useCallback(st => setStatuts(p => ({ ...p, rea: st })), [])
  const statutNoel = useCallback(st => setStatuts(p => ({ ...p, noel: st })), [])
  const statutSemaine = useCallback(st => setStatuts(p => ({ ...p, semaine: st })), [])

  // Sauvegarde de l'étape courante, enregistrée par la sous-page montée (cf. onRegisterSave).
  const saveRef = useRef(null)
  const registerSave = useCallback(fn => { saveRef.current = fn }, [])

  // Navigation gardée : si l'étape courante a des modifs non enregistrées, on demande confirmation.
  const [pendingIdx, setPendingIdx] = useState(null) // index d'étape cible en attente (modal ouvert)
  const aModifie = (idx = i) => statuts[ETAPES[idx].id] === 'modifie'

  function tenterNav(idx) {
    if (idx === i || idx < 0 || idx >= ETAPES.length) return
    if (aModifie()) setPendingIdx(idx)
    else setI(idx)
  }

  async function enregistrerEtContinuer() {
    const cible = pendingIdx
    const ok = await saveRef.current?.()
    if (ok !== false) setI(cible) // succès (ou pas de sauvegarde) → on navigue ; échec → on reste
    setPendingIdx(null)
  }

  // Garde la sortie de « Construction planning » via la sidebar (réutilise gardeNavigation/App).
  useEffect(() => {
    definirGardeNavigation(() =>
      !ETAPES.some(e => statuts[e.id] === 'modifie') ||
      window.confirm('Vous avez des modifications non enregistrées dans la construction du planning. Quitter sans enregistrer ?')
    )
    return () => definirGardeNavigation(null)
  }, [statuts])

  // ── Styles ──
  const s = {
    barre: {
      position: 'sticky', top: -24, zIndex: 5,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap',
      background: 'var(--color-bg)', padding: '12px 0 12px',
      borderBottom: '0.5px solid var(--color-border)', marginBottom: 20,
    },
    pills: { display: 'flex', gap: 8, flexWrap: 'wrap' },
    pill: (actif, fait) => ({
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 14px', fontSize: 13, fontWeight: actif ? 600 : 500,
      borderRadius: 'var(--radius-md)', cursor: 'pointer',
      border: `0.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-border)'}`,
      background: actif ? 'var(--color-primary-light)' : 'var(--color-bg)',
      color: actif ? 'var(--color-primary-dark)' : fait ? 'var(--color-text)' : 'var(--color-text-secondary)',
    }),
    // Rond numéroté : vert ✓ si enregistré, ambre • si modifié non enregistré, neutre sinon.
    num: (statut) => {
      const fond = statut === 'enregistre' ? 'var(--color-success)'
        : statut === 'modifie' ? 'var(--color-amber)'
          : 'var(--color-border)'
      const texte = (statut === 'enregistre' || statut === 'modifie') ? '#fff' : 'var(--color-text-secondary)'
      return {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: '50%', fontSize: 11, fontWeight: 700,
        background: fond, color: texte,
      }
    },
    nav: { display: 'flex', gap: 8 },
    boutonNav: (off) => ({
      padding: '8px 16px', fontSize: 13, fontWeight: 500,
      borderRadius: 'var(--radius-md)', cursor: off ? 'default' : 'pointer',
      border: '0.5px solid var(--color-border)', background: 'var(--color-bg)',
      color: 'var(--color-text-secondary)', opacity: off ? 0.4 : 1,
    }),
    boutonSuivant: (off) => ({
      padding: '8px 18px', fontSize: 13, fontWeight: 600,
      borderRadius: 'var(--radius-md)', cursor: off ? 'default' : 'pointer',
      border: 'none', background: 'var(--color-primary)', color: '#fff',
      opacity: off ? 0.4 : 1,
    }),
    overlay: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    },
    modal: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 460, width: '100%',
      boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
    },
    modalTitre: { fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 },
    modalTexte: { fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 20 },
    modalActions: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
    btnPrimaire: {
      padding: '9px 16px', fontSize: 13, fontWeight: 600, borderRadius: 'var(--radius-md)',
      border: 'none', background: 'var(--color-primary)', color: '#fff', cursor: 'pointer',
    },
    btnDanger: {
      padding: '9px 16px', fontSize: 13, fontWeight: 500, borderRadius: 'var(--radius-md)',
      border: '0.5px solid var(--color-danger)', background: 'transparent', color: 'var(--color-danger)', cursor: 'pointer',
    },
    btnNeutre: {
      padding: '9px 16px', fontSize: 13, fontWeight: 500, borderRadius: 'var(--radius-md)',
      border: '0.5px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer',
    },
  }

  if (!estFaiseur) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Construction du planning</h1>
        <div style={{
          background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', padding: 24, color: 'var(--color-text-secondary)', fontSize: 14,
        }}>
          Cette page est réservée au faiseur de planning.
        </div>
      </div>
    )
  }

  const etape = ETAPES[i]
  const premier = i === 0
  const dernier = i === ETAPES.length - 1

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={s.barre}>
        <div style={s.pills}>
          {ETAPES.map((e, idx) => {
            const statut = statuts[e.id]
            const contenu = statut === 'enregistre' ? '✓' : statut === 'modifie' ? '•' : idx + 1
            return (
              <button key={e.id} type="button" onClick={() => tenterNav(idx)} style={s.pill(idx === i, statut === 'enregistre')}>
                <span style={s.num(statut)}>{contenu}</span>
                {e.titre}
              </button>
            )
          })}
        </div>
        <div style={s.nav}>
          <button type="button" disabled={premier} onClick={() => tenterNav(i - 1)} style={s.boutonNav(premier)}>
            ← Précédent
          </button>
          <button type="button" disabled={dernier} onClick={() => tenterNav(i + 1)} style={s.boutonSuivant(dernier)}>
            Suivant →
          </button>
        </div>
      </div>

      {etape.id === 'calendrier' && <PlanningCalendrier annee={annee} onChangeAnnee={setAnnee} onStatut={statutCalendrier} onRegisterSave={registerSave} />}
      {etape.id === 'objectifs' && <PlanningObjectifs annee={annee} onChangeAnnee={setAnnee} onStatut={statutObjectifs} onRegisterSave={registerSave} />}
      {etape.id === 'weekends' && <PlanningWeekends annee={annee} onChangeAnnee={setAnnee} onStatut={statutWeekends} onRegisterSave={registerSave} />}
      {etape.id === 'vacances' && <PlanningVacances annee={annee} onChangeAnnee={setAnnee} onStatut={statutVacances} onRegisterSave={registerSave} />}
      {etape.id === 'rea' && <PlanningRea annee={annee} onChangeAnnee={setAnnee} onStatut={statutRea} onRegisterSave={registerSave} />}
      {etape.id === 'noel' && <PlanningNoel annee={annee} onChangeAnnee={setAnnee} onStatut={statutNoel} onRegisterSave={registerSave} />}
      {etape.id === 'semaine' && <PlanningSemaines annee={annee} onChangeAnnee={setAnnee} onStatut={statutSemaine} onRegisterSave={registerSave} />}

      {pendingIdx !== null && (
        <div style={s.overlay} role="dialog" aria-modal="true">
          <div style={s.modal}>
            <div style={s.modalTitre}>Modifications non enregistrées</div>
            <div style={s.modalTexte}>
              Vous avez des modifications non enregistrées sur l'étape « {etape.titre} ».
              Que voulez-vous faire avant de passer à « {ETAPES[pendingIdx].titre} » ?
            </div>
            <div style={s.modalActions}>
              <button type="button" onClick={() => setPendingIdx(null)} style={s.btnNeutre}>Annuler</button>
              <button type="button" onClick={() => { const c = pendingIdx; setPendingIdx(null); setI(c) }} style={s.btnDanger}>
                Quitter sans enregistrer
              </button>
              <button type="button" onClick={enregistrerEtContinuer} style={s.btnPrimaire}>
                Enregistrer et continuer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
