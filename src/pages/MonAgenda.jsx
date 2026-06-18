// ============================================================
// MonAgenda — page associé : synchroniser SA colonne du planning validé vers son agenda perso
// (iPhone/Apple, Android/Google, Outlook) via un abonnement iCal, et tout supprimer pour revenir en arrière.
// Le flux est servi par /api/agenda?token=… ; il ne contient QUE les tiers VALIDÉS de cet associé.
// ============================================================
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { obtenirAbonnement, definirActif } from '../utils/agendaApi'
import { listerEvenementsTiers } from '../utils/agendaEvenementsApi'
import { listerRecueils } from '../utils/desiderataApi'

const PLATEFORMES = [
  { id: 'apple', label: '🍎 iPhone / Mac (Apple)' },
  { id: 'google', label: '🟢 Android / Google' },
  { id: 'outlook', label: '🔷 Outlook' },
]

export default function MonAgenda() {
  const { session, profile } = useAuth()
  const ini = profile?.initiales ?? null
  const userId = session?.user?.id

  const [abonnement, setAbonnement] = useState(null) // { token, actif }
  const [tiers, setTiers] = useState([])             // [{ annee, nom, debut, fin, nbEv }]
  const [plateforme, setPlateforme] = useState('apple')
  const [copie, setCopie] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [busy, setBusy] = useState(false)

  // Abonnement (token) de l'associé.
  useEffect(() => {
    if (!userId || !ini) return
    let annule = false
    obtenirAbonnement(userId)
      .then(a => { if (!annule) setAbonnement(a) })
      .catch(() => { if (!annule) setErreur('Impossible de préparer votre lien de synchronisation.') })
    return () => { annule = true }
  }, [userId, ini])

  // Tiers validés contenant des événements pour cet associé (avec leurs noms).
  useEffect(() => {
    if (!ini) return
    let annule = false
    listerEvenementsTiers()
      .then(async rows => {
        const aMoi = rows.filter(r => Array.isArray(r.data?.[ini]) && r.data[ini].length > 0)
        const annees = [...new Set(aMoi.map(r => r.annee))]
        const parId = {}
        for (const an of annees) {
          try {
            for (const rc of await listerRecueils(an)) parId[rc.id] = rc
          } catch { /* noms indisponibles : on retombe sur un libellé générique */ }
        }
        const liste = aMoi.map(r => {
          const rc = parId[r.recueil_id]
          return {
            annee: r.annee,
            nom: rc?.nom ?? 'Tiers validé',
            debut: rc?.semaine_debut, fin: rc?.semaine_fin,
            nbEv: r.data[ini].length,
          }
        }).sort((a, b) => (a.annee - b.annee) || ((a.debut ?? 0) - (b.debut ?? 0)))
        if (!annule) setTiers(liste)
      })
      .catch(() => { /* liste indicative seulement */ })
    return () => { annule = true }
  }, [ini])

  const base = useMemo(() => (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, ''), [])
  const urlHttps = abonnement?.token ? `${base}/api/agenda?token=${abonnement.token}` : null
  const urlWebcal = urlHttps ? urlHttps.replace(/^https?:\/\//, 'webcal://') : null
  const lienGoogle = urlHttps ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(urlWebcal)}` : null
  const lienOutlook = urlHttps ? `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(urlHttps)}&name=${encodeURIComponent('SARM — Mon planning')}` : null

  async function copier() {
    if (!urlHttps) return
    try { await navigator.clipboard.writeText(urlHttps); setCopie(true); setTimeout(() => setCopie(false), 2500) } catch { /* ignore */ }
  }

  async function basculerActif(actif) {
    if (!userId) return
    setErreur(null); setBusy(true)
    try {
      await definirActif(userId, actif)
      setAbonnement(prev => ({ ...prev, actif }))
    } catch {
      setErreur('Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  const s = {
    carte: { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 20 },
    titre: { fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 },
    aide: { fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.55, marginBottom: 12 },
    bouton: { padding: '9px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' },
    boutonSec: { padding: '7px 12px', fontSize: 12, borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-secondary)', cursor: 'pointer' },
    boutonDanger: { padding: '8px 14px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-danger)', background: 'transparent', color: 'var(--color-danger)', cursor: 'pointer' },
    onglet: (actif) => ({ padding: '7px 12px', fontSize: 12.5, borderRadius: 'var(--radius-md)', cursor: 'pointer', border: `0.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-border)'}`, background: actif ? 'var(--color-primary-light)' : 'var(--color-bg)', color: actif ? 'var(--color-primary)' : 'var(--color-text-secondary)', fontWeight: actif ? 600 : 400 }),
    url: { fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all', background: 'var(--color-bg)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px 10px', color: 'var(--color-text)' },
  }

  if (!ini) {
    return (
      <div style={{ maxWidth: 720 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Mon agenda</h1>
        <div style={{ ...s.carte, color: 'var(--color-text-secondary)', fontSize: 14 }}>
          Cette page est réservée aux associés : aucune colonne de planning ne vous est attribuée pour l'instant.
        </div>
      </div>
    )
  }

  const actif = abonnement?.actif !== false

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Mon agenda <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>· {ini}</span></h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        Synchronisez votre planning validé (gardes, astreintes, réanimation, vacances, récup) vers votre agenda
        personnel. Vous ne vous abonnez <strong>qu'une seule fois</strong> : les tiers validés s'ajoutent et se
        mettent à jour automatiquement.
      </p>

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>{erreur}</div>
      )}

      {/* Synchroniser */}
      <div style={s.carte}>
        <div style={s.titre}>Synchroniser mon agenda</div>
        {!actif && (
          <div style={{ fontSize: 12.5, color: 'var(--color-amber)', marginBottom: 12 }}>
            La synchronisation est actuellement <strong>désactivée</strong> (agenda vidé). Réactivez-la ci-dessous pour réafficher votre planning.
          </div>
        )}
        <div style={s.aide}>Choisissez votre type d'agenda :</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {PLATEFORMES.map(p => (
            <button key={p.id} type="button" onClick={() => setPlateforme(p.id)} style={s.onglet(plateforme === p.id)}>{p.label}</button>
          ))}
        </div>

        {!urlHttps ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Préparation du lien…</div>
        ) : (
          <>
            {plateforme === 'apple' && (
              <div>
                <p style={s.aide}>Sur <strong>iPhone/iPad/Mac</strong> : touchez le bouton ci-dessous, puis confirmez l'ajout du calendrier dans l'app <strong>Calendrier</strong>.</p>
                <a href={urlWebcal} style={s.bouton}>📲 Ajouter à mon agenda Apple</a>
              </div>
            )}
            {plateforme === 'google' && (
              <div>
                <p style={s.aide}>Sur <strong>Android / Google Agenda</strong> : ouvrez le lien ci-dessous (sur ordinateur de préférence), puis confirmez « Ajouter le calendrier ». Sinon, dans Google Agenda → <em>Autres agendas</em> → <em>À partir de l'URL</em>, collez l'adresse plus bas.</p>
                <a href={lienGoogle} target="_blank" rel="noopener noreferrer" style={s.bouton}>➕ Ajouter à Google Agenda</a>
              </div>
            )}
            {plateforme === 'outlook' && (
              <div>
                <p style={s.aide}>Sur <strong>Outlook</strong> : ouvrez le lien ci-dessous, ou dans Outlook → <em>Ajouter un calendrier</em> → <em>S'abonner à partir du web</em>, collez l'adresse plus bas.</p>
                <a href={lienOutlook} target="_blank" rel="noopener noreferrer" style={s.bouton}>➕ S'abonner dans Outlook</a>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Adresse d'abonnement (à coller manuellement si besoin) :</div>
              <div style={s.url}>{urlHttps}</div>
              <button type="button" onClick={copier} style={{ ...s.boutonSec, marginTop: 8 }}>{copie ? 'Copié ✓' : 'Copier l’adresse'}</button>
            </div>
          </>
        )}
      </div>

      {/* Tiers inclus */}
      <div style={s.carte}>
        <div style={s.titre}>Tiers synchronisés</div>
        {tiers.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Aucun tiers validé pour le moment. Votre planning apparaîtra ici dès qu'un tiers sera validé par le faiseur.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tiers.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text)', flex: 1 }}>
                  📅 {t.nom} <span style={{ color: 'var(--color-text-tertiary)' }}>· {t.annee}{t.debut != null ? ` · S${t.debut}→S${t.fin}` : ''}</span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t.nbEv} évén.</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Supprimer */}
      <div style={s.carte}>
        <div style={s.titre}>Revenir en arrière</div>
        <p style={s.aide}>
          « Tout supprimer » vide votre planning de l'agenda abonné (au prochain rafraîchissement, quelques heures).
          Vous pouvez ensuite retirer l'abonnement dans votre app si vous le souhaitez. « Réactiver » réaffiche tout,
          sans avoir à vous réabonner.
        </p>
        {actif ? (
          <button type="button" onClick={() => basculerActif(false)} disabled={busy} style={{ ...s.boutonDanger, opacity: busy ? 0.6 : 1 }}>
            🗑 Tout supprimer de mon agenda
          </button>
        ) : (
          <button type="button" onClick={() => basculerActif(true)} disabled={busy} style={{ ...s.bouton, opacity: busy ? 0.6 : 1 }}>
            🔄 Réactiver la synchronisation
          </button>
        )}
      </div>
    </div>
  )
}
