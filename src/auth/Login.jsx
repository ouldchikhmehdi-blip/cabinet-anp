import { useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Login — deux étapes :
 *   1. Email + mot de passe  → signInWithPassword → session AAL1
 *   2. Code TOTP à 6 chiffres → challenge + verify → session AAL2
 *
 * Si la session monte directement en AAL2 (pas de facteur TOTP enrôlé
 * côté Supabase, ce qui ne devrait pas arriver en prod), App.jsx gère
 * la redirection vers EnrollMFA.
 */
export default function Login() {
  const [etape,       setEtape]       = useState('mdp') // 'mdp' | 'totp' | 'oubli'
  const [email,       setEmail]       = useState('')
  const [mdp,         setMdp]         = useState('')
  const [code,        setCode]        = useState('')
  const [factorId,    setFactorId]    = useState(null)
  const [erreur,      setErreur]      = useState(null)
  const [charge,      setCharge]      = useState(false)
  const [oubliEnvoye, setOubliEnvoye] = useState(false) // étape 'oubli' : e-mail de réinitialisation demandé

  // ── Étape 1 : mot de passe ──────────────────────────────────────────
  async function soumettreMdp(e) {
    e.preventDefault()
    setErreur(null)
    setCharge(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: mdp })
      if (error) throw error

      // Cherche le facteur TOTP vérifié
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.find(f => f.status === 'verified')

      if (!totp) {
        // Pas de facteur → App redirigera vers EnrollMFA via le contexte
        return
      }

      // Facteur trouvé → lancer le challenge et passer à l'étape TOTP
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
      if (chErr) throw chErr

      // Stocke l'id du facteur et du challenge pour l'étape 2
      setFactorId({ id: totp.id, challengeId: ch.id })
      setEtape('totp')
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
  }

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
