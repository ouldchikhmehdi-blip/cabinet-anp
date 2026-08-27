// ============================================================
// MonAgenda — page associé : synchroniser SA colonne du planning validé vers son agenda perso
// (iPhone/Apple, Android/Google, Outlook) via un abonnement iCal, et tout supprimer pour revenir en arrière.
// Le flux est servi par /api/agenda?token=… ; il ne contient QUE les tiers VALIDÉS de cet associé.
// ============================================================
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { obtenirAbonnement, definirActif, definirExclus, definirSource } from '../utils/agendaApi'
import { obtenirImportManuel, sauverImportManuel } from '../utils/agendaManuelApi'
import { parserAgendaManuel } from '../utils/agendaManuel'
import { listerEvenementsTiers } from '../utils/agendaEvenementsApi'
import { listerRecueils } from '../utils/desiderataApi'
import { listerArchives } from '../utils/archivesApi'
import { ANNEES, formatDateLongueFR, parseISO } from '../utils/calendrier'
import { urlFlux, liensAbonnement } from '../utils/lienAgenda'

const PLATEFORMES = [
  { id: 'apple', label: '🍎 iPhone / Mac (Apple)' },
  { id: 'google', label: '🟢 Android / Google' },
  { id: 'outlook', label: '🔷 Outlook' },
]

const JOUR_MS = 24 * 60 * 60 * 1000

// Libellé d'un événement journée-entière { d, fin(exclusif) } : jour unique ou plage « d → dernier jour ».
function libelleEvenement(e) {
  const debut = parseISO(e.d)
  const dernier = new Date(parseISO(e.fin).getTime() - JOUR_MS) // fin est exclusif
  const label = formatDateLongueFR(debut)
  if (dernier.getTime() <= debut.getTime()) return label
  return `${label} → ${formatDateLongueFR(dernier)}`
}

export default function MonAgenda() {
  const { session, profile } = useAuth()
  const ini = profile?.initiales ?? null
  const userId = session?.user?.id

  const [abonnement, setAbonnement] = useState(null) // { token, actif, exclus, source }
  const [tiers, setTiers] = useState([])             // [{ annee, nom, debut, fin, nbEv }]
  const [plateforme, setPlateforme] = useState('apple')
  const [copie, setCopie] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [busy, setBusy] = useState(false)

  // Import manuel (source = 'manuel') : collage → analyse locale → enregistrement.
  const [source, setSource] = useState('auto')       // 'auto' | 'manuel'
  const [texteColle, setTexteColle] = useState('')
  const [anneeIndice, setAnneeIndice] = useState(new Date().getFullYear())
  const [apercu, setApercu] = useState(null)         // { events, diag } (analyse locale, avant sauvegarde)
  const [importSauve, setImportSauve] = useState(null) // { data, updated_at } déjà enregistré
  const [sauve, setSauve] = useState(false)

  // Abonnement (token) de l'associé.
  useEffect(() => {
    if (!userId || !ini) return
    let annule = false
    obtenirAbonnement(userId)
      .then(a => { if (!annule) { setAbonnement(a); setSource(a?.source ?? 'auto') } })
      .catch(() => { if (!annule) setErreur('Impossible de préparer votre lien de synchronisation.') })
    return () => { annule = true }
  }, [userId, ini])

  // Import manuel déjà enregistré (chargé quand la source est 'manuel').
  useEffect(() => {
    if (!userId || source !== 'manuel') return
    let annule = false
    obtenirImportManuel(userId)
      .then(d => { if (!annule) setImportSauve(d) })
      .catch(() => { /* liste indicative seulement */ })
    return () => { annule = true }
  }, [userId, source])

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
  const urlHttps = useMemo(() => urlFlux(base, '/api/agenda', abonnement?.token), [base, abonnement?.token])
  const liens = useMemo(() => liensAbonnement(urlHttps, 'SARM — Mon planning'), [urlHttps])

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

  // Bascule la source du flux (auto ↔ manuel).
  async function changerSource(next) {
    if (!userId || next === source) return
    setErreur(null); setBusy(true)
    try {
      await definirSource(userId, next)
      setSource(next)
      setAbonnement(prev => ({ ...prev, source: next }))
    } catch {
      setErreur('Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  // Analyse le collage EN LOCAL (aucune écriture) → aperçu des événements + diagnostics.
  function analyser() {
    setErreur(null); setSauve(false)
    setApercu(parserAgendaManuel(texteColle, { ini, anneeIndice }))
  }

  // Enregistre l'import analysé (remplace tout l'import précédent) et bascule la source sur 'manuel'.
  async function enregistrerImport() {
    if (!userId || !apercu?.events?.length) return
    setErreur(null); setBusy(true); setSauve(false)
    try {
      await sauverImportManuel(userId, apercu.events)
      if (source !== 'manuel') { await definirSource(userId, 'manuel'); setSource('manuel'); setAbonnement(prev => ({ ...prev, source: 'manuel' })) }
      setImportSauve({ data: apercu.events, updated_at: null })
      setSauve(true); setTimeout(() => setSauve(false), 3000)
    } catch {
      setErreur('Enregistrement impossible.')
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

      {/* Source de l'agenda : planning validé (auto) OU import collé (manuel) */}
      <div style={s.carte}>
        <div style={s.titre}>Source de mon agenda</div>
        <div style={s.aide}>
          Choisissez ce qui alimente votre agenda. Une seule source est active à la fois ; l'autre est ignorée.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => changerSource('auto')} disabled={busy} style={s.onglet(source === 'auto')}>
            Planning validé (automatique)
          </button>
          <button type="button" onClick={() => changerSource('manuel')} disabled={busy} style={s.onglet(source === 'manuel')}>
            Je colle ma colonne (manuel)
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 10 }}>
          {source === 'auto'
            ? 'Votre agenda suit le planning validé par le faiseur (dérivé automatiquement).'
            : 'Votre agenda suit le planning que vous collez ci-dessous depuis le fichier Excel du faiseur.'}
        </div>
      </div>

      {/* Import manuel : coller sa colonne → analyser → enregistrer */}
      {source === 'manuel' && (
        <div style={s.carte}>
          <div style={s.titre}>Coller mon planning</div>
          <div style={s.aide}>
            Depuis le fichier Excel du faiseur, sélectionnez la <strong>colonne des dates</strong> (1ʳᵉ colonne) et
            <strong> votre colonne</strong> (ou tout le planning), copiez, puis collez ci-dessous. On repère votre
            colonne grâce à vos initiales (<strong>{ini}</strong>) et on lit votre poste chaque jour.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>Année du planning collé :</label>
            <select value={anneeIndice} onChange={e => setAnneeIndice(Number(e.target.value))} style={{ ...s.boutonSec, padding: '6px 10px' }}>
              {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>(sert à dater les lignes sans année, ex. « 17/03 »)</span>
          </div>

          <textarea
            value={texteColle}
            onChange={e => setTexteColle(e.target.value)}
            placeholder={`Date\t${ini}\nlundi 16 mars 2026\tBloc B\n17/03\tBloc B\n18/03\tGarde\n19/03\tCongé`}
            rows={7}
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12.5, padding: 10, borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={analyser} disabled={!texteColle.trim()} style={{ ...s.boutonSec, opacity: texteColle.trim() ? 1 : 0.5 }}>Analyser</button>
            <button type="button" onClick={enregistrerImport} disabled={busy || !apercu?.events?.length} style={{ ...s.bouton, opacity: (busy || !apercu?.events?.length) ? 0.5 : 1 }}>
              {sauve ? 'Enregistré ✓' : 'Enregistrer'}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
            « Enregistrer » remplace entièrement votre import précédent.
            {importSauve?.data?.length > 0 && (
              <> Import actuel : <strong>{importSauve.data.length}</strong> événement{importSauve.data.length > 1 ? 's' : ''} synchronisé{importSauve.data.length > 1 ? 's' : ''}.</>
            )}
          </div>

          {/* Aperçu de l'analyse locale */}
          {apercu && (
            <div style={{ marginTop: 14 }}>
              {apercu.diag.avert.length > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                  {apercu.diag.avert.join(' ')}
                </div>
              )}
              {apercu.events.length > 0 && (
                <>
                  <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                    Colonne repérée : <strong>{apercu.diag.colonne}</strong> · {apercu.events.length} événement{apercu.events.length > 1 ? 's' : ''} sur {apercu.diag.nbJours} jour{apercu.diag.nbJours > 1 ? 's' : ''}.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
                    {apercu.events.map((e, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '5px 10px', borderRadius: 8, background: 'var(--color-bg)', border: '0.5px solid var(--color-border)' }}>
                        <span style={{ color: 'var(--color-text-tertiary)', flex: 1 }}>{libelleEvenement(e)}</span>
                        <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{e.titre}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {apercu.diag.nonDatees.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-amber)', marginTop: 10 }}>
                  {apercu.diag.nonDatees.length} ligne{apercu.diag.nonDatees.length > 1 ? 's' : ''} ignorée{apercu.diag.nonDatees.length > 1 ? 's' : ''} (date illisible) : {apercu.diag.nonDatees.slice(0, 6).join(', ')}{apercu.diag.nonDatees.length > 6 ? '…' : ''}
                </div>
              )}
              {apercu.diag.nonReconnues.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-amber)', marginTop: 6 }}>
                  {apercu.diag.nonReconnues.length} cellule{apercu.diag.nonReconnues.length > 1 ? 's' : ''} non reconnue{apercu.diag.nonReconnues.length > 1 ? 's' : ''} (aucun poste identifié) : {apercu.diag.nonReconnues.slice(0, 5).map(x => `« ${x.texte} »`).join(', ')}{apercu.diag.nonReconnues.length > 5 ? '…' : ''}
                </div>
              )}
            </div>
          )}
        </div>
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
                <a href={liens.webcal} style={s.bouton}>📲 Ajouter à mon agenda Apple</a>
              </div>
            )}
            {plateforme === 'google' && (
              <div>
                <p style={{ ...s.aide, color: 'var(--color-text)' }}>
                  ⚠️ <strong>À faire sur un ordinateur, pas sur le téléphone.</strong> L'application
                  Google Agenda <strong>ne sait pas</strong> ajouter un agenda par adresse : le
                  bouton n'existe pas, et il ne se passera jamais rien. Une fois ajouté depuis
                  l'ordinateur, l'agenda <strong>descend tout seul</strong> sur le téléphone.
                </p>
                <p style={s.aide}>
                  Sur l'ordinateur, ouvrez le lien et confirmez « Ajouter le calendrier ». Autre
                  chemin, équivalent : Google Agenda → <em>Autres agendas</em> →
                  <em> À partir de l'URL</em>, collez l'adresse plus bas.
                </p>
                <a href={liens.google} target="_blank" rel="noopener noreferrer" style={s.bouton}>➕ Ajouter à Google Agenda (sur ordinateur)</a>
                <p style={{ ...s.aide, marginTop: 12 }}>
                  Deux pièges ensuite, si vous ne le voyez toujours pas :
                  {' '}<strong>le bon compte Google</strong> — si plusieurs sont connectés dans le
                  navigateur, l'agenda est ajouté à celui qui est actif ; et sur le téléphone, il
                  faut parfois <strong>cocher l'agenda</strong> dans Google Agenda →
                  <em> Paramètres</em>, où les agendas ajoutés arrivent masqués.
                </p>
              </div>
            )}
            {plateforme === 'outlook' && (
              <div>
                <p style={s.aide}>
                  Deux Outlook, deux adresses — prenez celle de <strong>votre</strong> compte,
                  l'autre n'ouvre qu'une page de connexion sans suite. Sinon, dans Outlook →
                  <em> Ajouter un calendrier</em> → <em>S'abonner à partir du web</em>, collez
                  l'adresse plus bas.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a href={liens.outlookPerso} target="_blank" rel="noopener noreferrer" style={s.bouton}>➕ Outlook personnel (outlook.com, hotmail)</a>
                  <a href={liens.outlookPro} target="_blank" rel="noopener noreferrer" style={s.bouton}>➕ Outlook professionnel (Microsoft 365)</a>
                </div>
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

      {/* Choix par planning validé : synchroniser / désynchroniser chacun (source AUTO uniquement) */}
      {source === 'auto' && (
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
      )}

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
