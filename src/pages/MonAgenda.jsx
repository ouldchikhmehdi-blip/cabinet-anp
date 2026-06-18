// ============================================================
// MonAgenda — page associé : synchroniser SA colonne du planning validé vers son agenda perso
// (iPhone/Apple, Android/Google, Outlook) via un abonnement iCal, et tout supprimer pour revenir en arrière.
// Le flux est servi par /api/agenda?token=… ; il ne contient QUE les tiers VALIDÉS de cet associé.
// ============================================================
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { obtenirAbonnement, definirActif, definirExclus } from '../utils/agendaApi'
import { listerEvenementsTiers } from '../utils/agendaEvenementsApi'
import { listerRecueils } from '../utils/desiderataApi'
import { listerArchives } from '../utils/archivesApi'

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
        const archivesParAn = {}
        for (const an of annees) {
          try {
            for (const rc of await listerRecueils(an)) parId[rc.id] = rc
          } catch { /* noms indisponibles : on retombe sur un libellé générique */ }
          try { archivesParAn[an] = await listerArchives(an) } catch { archivesParAn[an] = [] }
        }
        // Source de vérité = les ARCHIVES vivantes. Pour chaque tiers (année + plage de semaines),
        // on ne garde que l'archive la PLUS RÉCENTE → son recueil_id. Une archive supprimée disparaît
        // donc d'ici ; sans archive, rien n'est synchronisable. Au plus un agenda par tiers (3 max/an).
        const valides = new Set()
        for (const an of annees) {
          const meilleure = new Map() // "deb|fin" → { recueilId, t }
          for (const a of (archivesParAn[an] ?? [])) {
            if (!a?.recueil_id) continue
            const cle = `${a.semaine_debut}|${a.semaine_fin}`
            const t = new Date(a.created_at).getTime() || 0
            const cur = meilleure.get(cle)
            if (!cur || t >= cur.t) meilleure.set(cle, { recueilId: a.recueil_id, t })
          }
          for (const v of meilleure.values()) valides.add(v.recueilId)
        }
        const liste = aMoi
          .filter(r => valides.has(r.recueil_id))
          .map(r => {
            const rc = parId[r.recueil_id]
            return {
              recueilId: r.recueil_id,
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

  const exclusSet = useMemo(() => new Set(abonnement?.exclus ?? []), [abonnement])

  // Synchronise / désynchronise UN tiers (opt-out via la liste `exclus`).
  async function basculerTier(recueilId, synchroniser) {
    if (!userId) return
    setErreur(null); setBusy(true)
    const nouveau = new Set(exclusSet)
    if (synchroniser) nouveau.delete(recueilId)
    else nouveau.add(recueilId)
    const arr = [...nouveau]
    try {
      await definirExclus(userId, arr)
      setAbonnement(prev => ({ ...prev, exclus: arr }))
    } catch {
      setErreur('Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  // Tout (re)synchroniser : vide la liste d'exclusions et réactive le flux.
  async function toutSynchroniser() {
    if (!userId) return
    setErreur(null); setBusy(true)
    try {
      await definirExclus(userId, [])
      await definirActif(userId, true)
      setAbonnement(prev => ({ ...prev, exclus: [], actif: true }))
    } catch {
      setErreur('Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  // Regroupe les tiers par année (les années s'accumulent → présentation lisible).
  const tiersParAnnee = useMemo(() => {
    const m = new Map()
    for (const t of tiers) { if (!m.has(t.annee)) m.set(t.annee, []); m.get(t.annee).push(t) }
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [tiers])

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
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', background: 'var(--color-bg)', border: '0.5px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
          ⏳ Après l'abonnement (ou toute modification ci-dessous), la mise à jour de votre agenda peut prendre <strong>jusqu'à ~1 heure</strong> : c'est votre application d'agenda qui rafraîchit l'abonnement, ce n'est pas instantané.
        </div>
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

      {/* Choix par planning validé : synchroniser / désynchroniser chacun */}
      <div style={s.carte}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <div style={s.titre}>Plannings à synchroniser</div>
          {tiers.length > 0 && (
            <button type="button" onClick={toutSynchroniser} disabled={busy} style={{ ...s.boutonSec, marginLeft: 'auto', opacity: busy ? 0.6 : 1 }}>Tout synchroniser</button>
          )}
        </div>
        <div style={s.aide}>Choisissez les plannings à inclure dans votre agenda. Un nouveau planning validé est ajouté automatiquement ; vous pouvez le retirer ici à tout moment.</div>
        {tiers.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Aucun tiers validé pour le moment. Votre planning apparaîtra ici dès qu'un tiers sera validé par le faiseur.</div>
        ) : (
          tiersParAnnee.map(([an, liste]) => (
            <div key={an} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{an}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {liste.map(t => {
                  const sync = !exclusSet.has(t.recueilId)
                  return (
                    <div key={t.recueilId} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: `0.5px solid ${sync && actif ? 'var(--color-success)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', padding: '8px 12px', opacity: actif ? 1 : 0.6 }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text)', flex: 1 }}>
                        📅 {t.nom} <span style={{ color: 'var(--color-text-tertiary)' }}>{t.debut != null ? `· S${t.debut}→S${t.fin} ` : ''}· {t.nbEv} évén.</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => basculerTier(t.recueilId, !sync)}
                        disabled={busy}
                        style={{
                          padding: '6px 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 999, cursor: busy ? 'default' : 'pointer',
                          border: `0.5px solid ${sync ? 'var(--color-success)' : 'var(--color-border)'}`,
                          background: sync ? 'var(--color-success-light)' : 'var(--color-bg)',
                          color: sync ? 'var(--color-success)' : 'var(--color-text-secondary)',
                        }}
                      >
                        {sync ? '✓ Synchronisé' : '○ Désynchronisé'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
        {!actif && tiers.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-amber)' }}>Synchronisation globalement désactivée : « Réactiver » plus bas pour appliquer ces choix.</div>
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
