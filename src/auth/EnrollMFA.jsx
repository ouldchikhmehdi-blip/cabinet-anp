import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * EnrollMFA — enrôlement obligatoire du TOTP.
 *
 * Affiché quand la session est AAL1 et qu'aucun facteur TOTP n'est enrôlé.
 * Étapes :
 *   1. enroll() → obtenir QR code + secret
 *   2. Utilisateur scanne dans son app authenticator
 *   3. challenge() + verify(code) → session monte en AAL2
 *      → App.jsx rend le dashboard
 */
export default function EnrollMFA() {
  const [factorId,     setFactorId]    = useState(null)
  const [challengeId,  setChallengeId] = useState(null)
  const [qrCode,       setQrCode]      = useState(null)
  const [secret,       setSecret]      = useState(null)
  const [code,         setCode]        = useState('')
  const [erreur,       setErreur]      = useState(null)
  const [charge,       setCharge]      = useState(false)
  const [montrerSecret, setMontrerSecret] = useState(false)

  // Lance l'enrôlement dès le montage
  useEffect(() => {
    async function enroler() {
      setCharge(true)
      try {
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          issuer: 'SARM',  // nom affiché dans l'application authenticator
        })
        if (error) throw error
        setFactorId(data.id)
        setQrCode(data.totp.qr_code)
        setSecret(data.totp.secret)

        // Démarre le challenge immédiatement
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: data.id })
        if (chErr) throw chErr
        setChallengeId(ch.id)
      } catch (err) {
        setErreur('Impossible d\'initialiser le 2FA. Réessayez dans quelques instants.')
        console.error(err)
      } finally {
        setCharge(false)
      }
    }
    enroler()
  }, [])

  async function verifier(e) {
    e.preventDefault()
    setErreur(null)
    setCharge(true)
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: code.trim(),
      })
      if (error) throw error
      // La session passe en AAL2 → onAuthStateChange dans AuthContext
      // → App.jsx affiche le dashboard
    } catch {
      setErreur('Code incorrect. Vérifiez votre application et réessayez.')
      setCode('')
      // Relancer un challenge pour le prochain essai
      supabase.auth.mfa.challenge({ factorId }).then(({ data: ch }) => {
        if (ch) setChallengeId(ch.id)
      })
    } finally {
      setCharge(false)
    }
  }

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
      width: 400,
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    },
    step: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
    },
    stepNum: {
      flexShrink: 0,
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: 'var(--color-primary-light)',
      color: 'var(--color-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      fontWeight: 600,
    },
    label: { fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 },
    input: {
      width: '100%',
      padding: '9px 12px',
      fontSize: 24,
      letterSpacing: 8,
      textAlign: 'center',
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
    secret: {
      fontSize: 11,
      fontFamily: 'monospace',
      background: 'var(--color-bg)',
      padding: '6px 10px',
      borderRadius: 6,
      wordBreak: 'break-all',
      color: 'var(--color-text-secondary)',
    },
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 12 }}>SARM</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text)' }}>
            Configuration de la double authentification
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            La 2FA est obligatoire. Configurez-la maintenant avec votre application authenticator.
          </div>
        </div>

        {erreur && <div style={s.erreur}>{erreur}</div>}

        {charge && !qrCode ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, textAlign: 'center' }}>
            Génération du QR code…
          </div>
        ) : qrCode ? (
          <>
            {/* Étape 1 — scanner */}
            <div style={s.step}>
              <div style={s.stepNum}>1</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
                  Scannez ce QR code dans Google Authenticator, Authy ou une app compatible TOTP
                </div>
                <div style={{ textAlign: 'center' }}>
                  <img
                    src={qrCode}
                    alt="QR code 2FA SARM"
                    style={{ width: 180, height: 180, border: '4px solid white', borderRadius: 8 }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setMontrerSecret(v => !v)}
                  style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8 }}
                >
                  {montrerSecret ? 'Masquer' : 'Afficher'} la clé manuelle (si le scan ne fonctionne pas)
                </button>
                {montrerSecret && <div style={s.secret}>{secret}</div>}
              </div>
            </div>

            {/* Étape 2 — code de vérification */}
            <div style={s.step}>
              <div style={s.stepNum}>2</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
                  Entrez le code à 6 chiffres affiché dans l'application
                </div>
                <form onSubmit={verifier} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoFocus
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    style={s.input}
                    placeholder="000000"
                  />
                  <button type="submit" disabled={charge || code.length < 6} style={s.bouton}>
                    {charge ? 'Vérification…' : 'Activer la 2FA et accéder au dashboard'}
                  </button>
                </form>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
