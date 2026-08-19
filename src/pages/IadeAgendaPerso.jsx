// ============================================================
// IadeAgendaPerso — « Sync agenda » (self-service IADE).
// L'IADE colle tout le tableau d'un mois, clique sur SON nom (lu dans l'en-tête, jamais
// en dur), et s'ABONNE à un flux iCal vivant (Apple / Google / Outlook) — son agenda se
// met à jour tout seul. Les mois se CUMULENT (recoller un mois le met à jour). Un jour de
// congé devient une journée « Congé » sans poste (le poste affiché est pour le remplaçant).
// ============================================================
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { lignesDepuisTexte, listerIades, extraireEvenementsIade } from '../utils/planningColle'
import {
  chargerAbonnementIade, activerSyncIade, desactiverSyncIade, reactiverSyncIade, viderSyncIade,
} from '../utils/iadeAgendaApi'

const PLATEFORMES = [
  { id: 'apple', label: '🍎 iPhone / Mac (Apple)' },
  { id: 'google', label: '🟢 Android / Google' },
  { id: 'outlook', label: '🔷 Outlook' },
]

export default function IadeAgendaPerso() {
  const { session, profile } = useAuth()
  const userId = profile?.id || session?.user?.id || null

  const [texte, setTexte] = useState('')
  const [noms, setNoms] = useState(null)
  const [choix, setChoix] = useState(null)        // { nom, moisLabel } dernier nom traité
  const [abonnement, setAbonnement] = useState(null) // { token, actif }
  const [plateforme, setPlateforme] = useState('apple')
  const [busy, setBusy] = useState(false)
  const [copie, setCopie] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [info, setInfo] = useState(null)

  // Abonnement existant (token / actif) même avant de coller.
  useEffect(() => {
    if (!userId) return
    let annule = false
    chargerAbonnementIade(userId)
      .then(row => { if (!annule && row) setAbonnement({ token: row.token, actif: row.actif }) })
      .catch(() => {})
    return () => { annule = true }
  }, [userId])

  const base = useMemo(() => (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, ''), [])
  const urlHttps = abonnement?.token ? `${base}/api/agenda-iade?token=${abonnement.token}` : null
  const urlWebcal = urlHttps ? urlHttps.replace(/^https?:\/\//, 'webcal://') : null
  const lienGoogle = urlWebcal ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(urlWebcal)}` : null
  const lienOutlook = urlHttps ? `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(urlHttps)}&name=${encodeURIComponent('SARM — Mon planning IADE')}` : null
  const actif = abonnement?.actif !== false

  function analyser() {
    setErreur(null); setInfo(null); setNoms(null); setChoix(null)
    try {
      const liste = listerIades(lignesDepuisTexte(texte))
      if (!liste.length) throw new Error("Aucun nom d'IADE trouvé dans l'en-tête collé.")
      setNoms(liste)
    } catch (e) {
      setErreur(e.message || 'Impossible de lire le mois collé.')
    }
  }

  async function choisirNom(nom) {
    setErreur(null); setInfo(null); setBusy(true)
    try {
      const rows = lignesDepuisTexte(texte)
      const { evenements, moisPrefixe, moisLabel } = extraireEvenementsIade(rows, nom)
      const row = await activerSyncIade(userId, moisPrefixe, evenements)
      setAbonnement({ token: row.token, actif: row.actif })
      setChoix({ nom, moisLabel })
      setInfo(`${nom} — ${moisLabel} synchronisé (${evenements.length} événement(s)). Ton agenda se met à jour tout seul ; recolle un autre mois pour l'ajouter.`)
    } catch (e) {
      setErreur(e.message || 'Synchronisation impossible.')
    } finally {
      setBusy(false)
    }
  }

  async function basculer(vActif) {
    setBusy(true); setErreur(null); setInfo(null)
    try {
      if (vActif) await reactiverSyncIade(userId)
      else await desactiverSyncIade(userId)
      setAbonnement(prev => ({ ...prev, actif: vActif }))
    } catch (e) {
      setErreur(e.message || 'Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  async function viderTout() {
    setBusy(true); setErreur(null); setInfo(null)
    try {
      await viderSyncIade(userId)
      setAbonnement(prev => ({ ...prev, actif: false }))
      setInfo('Agenda vidé. Tu peux recoller un mois pour le réactiver.')
    } catch (e) {
      setErreur(e.message || 'Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  function copier() {
    if (!urlHttps) return
    navigator.clipboard?.writeText(urlHttps).then(() => {
      setCopie(true)
      setTimeout(() => setCopie(false), 1500)
    }).catch(() => {})
  }

  const s = {
    carte: { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 },
    titre: { fontSize: 15, fontWeight: 600, color: 'var(--color-text)' },
    aide: { fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.55 },
    bouton: { padding: '9px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' },
    boutonSec: { padding: '7px 12px', fontSize: 12, borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-secondary)', cursor: 'pointer' },
    boutonDanger: { padding: '8px 14px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-danger, #c0392b)', background: 'transparent', color: 'var(--color-danger, #c0392b)', cursor: 'pointer' },
    onglet: (a) => ({ padding: '7px 12px', fontSize: 12.5, borderRadius: 'var(--radius-md)', cursor: 'pointer', border: `0.5px solid ${a ? 'var(--color-primary)' : 'var(--color-border)'}`, background: a ? 'var(--color-primary-light)' : 'var(--color-bg)', color: a ? 'var(--color-primary)' : 'var(--color-text-secondary)', fontWeight: a ? 600 : 400 }),
    url: { fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all', background: 'var(--color-bg)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px 10px', color: 'var(--color-text)' },
    zone: { width: '100%', minHeight: 170, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, padding: 12, border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', resize: 'vertical', boxSizing: 'border-box' },
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Sync agenda</h1>
        <p style={{ ...s.aide, marginTop: 6 }}>
          Copie tout le tableau d'un mois depuis le fichier visuel du planning, colle-le ci-dessous,
          puis clique sur <strong>ton nom</strong>. Tu t'abonnes <strong>une seule fois</strong> : ton
          agenda se met à jour tout seul, et les mois se <strong>cumulent</strong> (recolle un mois pour
          l'ajouter ou le corriger). Un jour de congé apparaît « Congé » sans poste.
        </p>
      </div>

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger, #c0392b)', background: 'var(--color-danger-light, rgba(192,57,43,0.08))', borderRadius: 8, padding: '10px 14px' }}>{erreur}</div>
      )}
      {info && (
        <div style={{ fontSize: 13, color: 'var(--color-text)', background: 'var(--color-primary-light)', borderRadius: 8, padding: '10px 14px' }}>{info}</div>
      )}

      {/* 1. Coller + choisir son nom */}
      <div style={s.carte}>
        <div style={s.titre}>1. Colle ton mois et choisis ton nom</div>
        <textarea
          value={texte}
          onChange={e => { setTexte(e.target.value); setNoms(null) }}
          placeholder="Colle ici le mois entier (Ctrl+V)…"
          spellCheck={false}
          style={s.zone}
        />
        <div>
          <button onClick={analyser} disabled={!texte.trim() || busy} style={{ ...s.bouton, opacity: texte.trim() && !busy ? 1 : 0.5 }}>
            Analyser le mois
          </button>
        </div>
        {noms && (
          <div>
            <div style={{ ...s.aide, marginBottom: 8 }}>Clique sur ton nom pour synchroniser ce mois :</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {noms.map(nom => (
                <button key={nom} onClick={() => choisirNom(nom)} disabled={busy}
                  style={{ ...s.onglet(choix?.nom === nom), padding: '10px 16px', fontSize: 14 }}>
                  {nom}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Abonnement (visible dès qu'un token existe) */}
      {urlHttps && (
        <div style={s.carte}>
          <div style={s.titre}>2. Synchroniser mon agenda{choix ? ` · ${choix.nom}` : ''}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', background: 'var(--color-bg)', border: '0.5px solid var(--color-border)', borderRadius: 8, padding: '8px 10px' }}>
            ⏳ Après l'abonnement (ou toute modification), la mise à jour de ton agenda peut prendre <strong>jusqu'à ~1 heure</strong> : c'est ton application d'agenda qui rafraîchit l'abonnement, ce n'est pas instantané.
          </div>
          {!actif && (
            <div style={{ fontSize: 12.5, color: 'var(--color-amber, #b8860b)' }}>
              La synchronisation est actuellement <strong>désactivée</strong> (agenda vidé). Recolle un mois ou réactive-la ci-dessous.
            </div>
          )}

          <div style={s.aide}>Choisis ton type d'agenda :</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PLATEFORMES.map(p => (
              <button key={p.id} type="button" onClick={() => setPlateforme(p.id)} style={s.onglet(plateforme === p.id)}>{p.label}</button>
            ))}
          </div>

          {plateforme === 'apple' && (
            <div>
              <p style={s.aide}>Sur <strong>iPhone/iPad/Mac</strong> : touche le bouton, puis confirme l'ajout dans l'app <strong>Calendrier</strong>.</p>
              <a href={urlWebcal} style={s.bouton}>📲 Ajouter à mon agenda Apple</a>
            </div>
          )}
          {plateforme === 'google' && (
            <div>
              <p style={s.aide}>Sur <strong>Android / Google Agenda</strong> : ouvre le lien (sur ordinateur de préférence), puis confirme « Ajouter le calendrier ». Sinon, Google Agenda → <em>Autres agendas</em> → <em>À partir de l'URL</em>, colle l'adresse.</p>
              <a href={lienGoogle} target="_blank" rel="noopener noreferrer" style={s.bouton}>➕ Ajouter à Google Agenda</a>
            </div>
          )}
          {plateforme === 'outlook' && (
            <div>
              <p style={s.aide}>Sur <strong>Outlook</strong> : ouvre le lien, ou Outlook → <em>Ajouter un calendrier</em> → <em>S'abonner à partir du web</em>, colle l'adresse.</p>
              <a href={lienOutlook} target="_blank" rel="noopener noreferrer" style={s.bouton}>➕ S'abonner dans Outlook</a>
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Adresse d'abonnement (à coller manuellement si besoin) :</div>
            <div style={s.url}>{urlHttps}</div>
            <button type="button" onClick={copier} style={{ ...s.boutonSec, marginTop: 8 }}>{copie ? 'Copié ✓' : "Copier l'adresse"}</button>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '0.5px solid var(--color-border)', paddingTop: 12 }}>
            {actif ? (
              <button type="button" onClick={viderTout} disabled={busy} style={{ ...s.boutonDanger, opacity: busy ? 0.6 : 1 }}>
                🗑 Vider mon agenda
              </button>
            ) : (
              <button type="button" onClick={() => basculer(true)} disabled={busy} style={{ ...s.bouton, opacity: busy ? 0.6 : 1 }}>
                🔄 Réactiver la synchronisation
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
