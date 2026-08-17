import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

/**
 * Login — deux étapes :
 *   1. Email + mot de passe (ou « Continuer avec Google ») → session AAL1
 *   2. Code TOTP à 6 chiffres → challenge + verify → session AAL2
 *
 * Google : simple mode de connexion, PAS une inscription. L'autorisation reste
 * portée par l'invitation (cf. supabase/connexion_google.sql) — une adresse non
 * invitée obtient un compte désactivé qui ne lit rien.
 * Les associés gardent leur 2FA : après un retour de Google en AAL1 avec un
 * facteur TOTP enrôlé, cet écran repart directement à l'étape « code ».
 * Les comptes IADE en sont dispensés (App.jsx les laisse passer en AAL1).
 *
 * Si la session monte directement en AAL2 (pas de facteur TOTP enrôlé
 * côté Supabase, ce qui ne devrait pas arriver en prod), App.jsx gère
 * la redirection vers EnrollMFA.
 */
export default function Login() {
  const { session, nextAal } = useAuth()
  const [etape,       setEtape]       = useState('mdp') // 'mdp' | 'totp' | 'oubli'
  const [email,       setEmail]       = useState('')
  const [mdp,         setMdp]         = useState('')
  const [code,        setCode]        = useState('')
  const [factorId,    setFactorId]    = useState(null)
  const [erreur,      setErreur]      = useState(null)
  const [charge,      setCharge]      = useState(false)
  const [oubliEnvoye, setOubliEnvoye] = useState(false) // étape 'oubli' : e-mail de réinitialisation demandé

  // ── Passage à l'étape « code » : ouvre un challenge sur le facteur TOTP vérifié ──
  const lancerChallenge = useCallback(async () => {
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const totp = factors?.totp?.find(f => f.status === 'verified')
    if (!totp) return false
    const { data: ch, error } = await supabase.auth.mfa.challenge({ factorId: totp.id })
    if (error) return false
    setFactorId({ id: totp.id, challengeId: ch.id })
    setEtape('totp')
    return true
  }, [])

  // Retour de Google : la session existe déjà (AAL1) et un facteur TOTP est enrôlé.
  // Sans ceci, l'écran réafficherait le formulaire e-mail/mot de passe alors que la
  // personne est déjà authentifiée — il ne lui manque que son code.
  useEffect(() => {
    if (etape !== 'mdp' || !session || nextAal !== 'aal2') return
    let annule = false
    // Les setState de lancerChallenge n'ont lieu qu'APRÈS l'aller-retour réseau
    // (listFactors + challenge) : pas de rendu en cascade synchrone ici.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    lancerChallenge().then(ok => {
      if (!annule && !ok) setErreur('Impossible de démarrer la vérification 2FA. Réessayez.')
    })
    return () => { annule = true }
  }, [session, nextAal, etape, lancerChallenge])

  // ── Connexion Google (mode de connexion, pas d'inscription) ─────────
  async function seConnecterAvecGoogle() {
    setErreur(null)
    setCharge(true)
    const base = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: base },
    })
    if (error) {
      setErreur('Connexion Google indisponible. Utilisez votre e-mail et mot de passe.')
      setCharge(false)
    }
    // Succès → redirection vers Google : rien à faire, la page est quittée.
  }

  // ── Étape 1 : mot de passe ──────────────────────────────────────────
  async function soumettreMdp(e) {
    e.preventDefault()
    setErreur(null)
    setCharge(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: mdp })
      if (error) throw error
      // La suite dépend de l'état d'auth, pas de cette fonction :
      //   • aucun facteur TOTP → App.jsx affiche EnrollMFA (ou le dashboard si compte IADE) ;
      //   • facteur enrôlé     → l'effet ci-dessus ouvre le challenge et bascule sur « code ».
      // Même chemin que le retour de Google : une seule logique à maintenir.
    } catch {
      // Message générique pour ne pas aider un attaquant
      setErreur('E-mail ou mot de passe incorrect.')
    } finally {
      setCharge(false)
    }
  }

  // ── Étape 2 : code TOTP ─────────────────────────────────────────────
  async function soumettreTotp(e) {
    e.preventDefault()
    setErreur(null)
    setCharge(true)
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId:    factorId.id,
        challengeId: factorId.challengeId,
        code:        code.trim(),
      })
      if (error) throw error
      // AuthContext détecte le passage en AAL2 via onAuthStateChange → App rend le dashboard
    } catch {
      setErreur('Code incorrect ou expiré. Réessayez.')
      setCode('')
    } finally {
      setCharge(false)
    }
  }

  // ── Étape « oubli » : demander un lien de réinitialisation par e-mail ─
  async function soumettreOubli(e) {
    e.preventDefault()
    setErreur(null)
    setCharge(true)
    // Message générique quoi qu'il arrive (anti-énumération : ne jamais révéler si l'e-mail existe).
    const base = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '')
    try {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: base })
    } catch {
      /* on n'expose pas l'erreur (énumération / rate-limit) */
    } finally {
      setOubliEnvoye(true)
      setCharge(false)
    }
  }

  // ── Styles réutilisant les tokens CSS ───────────────────────────────
  const s = {
    page: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
    },
    card: {
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '0.5px solid var(--color-border)',
      padding: '40px 36px',
      width: 360,
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    },
    titre: { fontSize: 20, fontWeight: 600, color: 'var(--color-text)' },
    sousTitre: { fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 },
    label: { fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 },
    input: {
      width: '100%',
      padding: '9px 12px',
      fontSize: 14,
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      outline: 'none',
    },
    bouton: {
      width: '100%',
      padding: '10px',
      background: 'var(--color-primary)',
      color: '#fff',
      border: 'none',
      borderRadius: 'var(--radius-md)',
      fontSize: 14,
      fontWeight: 500,
      cursor: charge ? 'wait' : 'pointer',
      opacity: charge ? 0.7 : 1,
    },
    erreur: {
      fontSize: 13,
      color: 'var(--color-danger)',
      background: 'var(--color-danger-light)',
      borderRadius: 'var(--radius-md)',
      padding: '8px 12px',
    },
    boutonGoogle: {
      width: '100%',
      padding: '10px',
      background: 'var(--color-surface)',
      color: 'var(--color-text)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      fontSize: 14,
      fontWeight: 500,
      cursor: charge ? 'wait' : 'pointer',
      opacity: charge ? 0.7 : 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    separateur: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 11,
      color: 'var(--color-text-tertiary)',
    },
    trait: { flex: 1, height: 1, background: 'var(--color-border)' },
  }

  // Logo Google officiel (inline : aucune ressource externe à charger).
  const logoGoogle = (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  )

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 12 }}>SARM</div>
          <div style={s.titre}>
            {etape === 'mdp' ? 'Connexion' : etape === 'oubli' ? 'Mot de passe oublié' : 'Vérification 2FA'}
          </div>
          <div style={s.sousTitre}>
            {etape === 'mdp'
              ? 'Accès réservé — connexion sur invitation seulement'
              : etape === 'oubli'
                ? 'Saisissez votre adresse e-mail : nous vous enverrons un lien pour choisir un nouveau mot de passe'
                : 'Entrez le code à 6 chiffres de votre application d\'authentification'}
          </div>
        </div>

        {erreur && <div style={s.erreur}>{erreur}</div>}

        {etape === 'mdp' ? (
          <>
          {/* Adresse Gmail → un clic. Le compte doit avoir été invité au préalable :
              Google authentifie, c'est l'invitation qui autorise. */}
          <button type="button" onClick={seConnecterAvecGoogle} disabled={charge} style={s.boutonGoogle}>
            {logoGoogle} Continuer avec Google
          </button>
          <div style={s.separateur}>
            <span style={s.trait} /> ou <span style={s.trait} />
          </div>
          <form onSubmit={soumettreMdp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={s.label}>Adresse e-mail</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={s.input}
                placeholder="vous@exemple.fr"
              />
            </div>
            <div>
              <label style={s.label}>Mot de passe</label>
              <input
                type="password"
                required
                value={mdp}
                onChange={e => setMdp(e.target.value)}
                style={s.input}
              />
            </div>
            <button type="submit" disabled={charge} style={s.bouton}>
              {charge ? 'Connexion…' : 'Continuer'}
            </button>
            <button
              type="button"
              onClick={() => { setEtape('oubli'); setErreur(null); setOubliEnvoye(false) }}
              style={{ background: 'none', border: 'none', padding: 0, marginTop: 2, fontSize: 12, color: 'var(--color-text-secondary)', textDecoration: 'underline', cursor: 'pointer', alignSelf: 'center' }}
            >
              Mot de passe oublié ?
            </button>
          </form>
          </>
        ) : etape === 'oubli' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {oubliEnvoye ? (
              <div style={{ fontSize: 13, color: 'var(--color-success)', background: 'var(--color-success-light)', borderRadius: 'var(--radius-md)', padding: '10px 12px', lineHeight: 1.5 }}>
                Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé.
                Pensez à vérifier vos courriers indésirables (spam).
              </div>
            ) : (
              <form onSubmit={soumettreOubli} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={s.label}>Adresse e-mail</label>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={s.input}
                    placeholder="vous@exemple.fr"
                  />
                </div>
                <button type="submit" disabled={charge} style={s.bouton}>
                  {charge ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}
                </button>
              </form>
            )}
            <button
              type="button"
              onClick={() => { setEtape('mdp'); setErreur(null); setOubliEnvoye(false) }}
              style={{ ...s.bouton, background: 'transparent', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border)' }}
            >
              ← Retour à la connexion
            </button>
          </div>
        ) : (
          <form onSubmit={soumettreTotp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={s.label}>Code d'authentification</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                style={{ ...s.input, fontSize: 24, letterSpacing: 8, textAlign: 'center' }}
                placeholder="000000"
              />
            </div>
            <button type="submit" disabled={charge} style={s.bouton}>
              {charge ? 'Vérification…' : 'Vérifier'}
            </button>
            <button
              type="button"
              onClick={() => { setEtape('mdp'); setCode(''); setErreur(null) }}
              style={{ ...s.bouton, background: 'transparent', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border)' }}
            >
              ← Retour
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
