import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * AcceptInvitation — affiché quand l'URL contient ?invite=<token>
 *
 * Flux :
 *   1. Valide le token côté serveur (GET /api/accept?token=)
 *      pour afficher l'e-mail cible et vérifier que le lien est encore valide.
 *   2. L'invité saisit un mot de passe.
 *   3. POST /api/accept → le serverless crée le compte et consomme l'invitation.
 *   4. signInWithPassword → AuthContext met à jour la session.
 *   5. App.jsx redirige vers EnrollMFA (session AAL1 sans facteur TOTP).
 *
 * Le token est transmis UNE SEULE fois au serveur — jamais stocké côté client.
 */
export default function AcceptInvitation({ token, onTokenInvalide }) {
  const [emailCible, setEmailCible] = useState(null)
  const [mdp,        setMdp]        = useState('')
  const [mdpConfirm, setMdpConfirm] = useState('')
  const [erreur,     setErreur]     = useState(null)
  const [charge,     setCharge]     = useState(true) // validation initiale
  const [fait,       setFait]       = useState(false)

  // ── Créer son compte via Google plutôt qu'avec un mot de passe ─────
  // Le token d'invitation n'est PAS consommé ici : c'est le trigger
  // handle_new_user qui, à la création du compte, retrouve l'invitation de cette
  // adresse, applique son rôle et la marque utilisée (supabase/connexion_google.sql).
  async function connexionGoogle() {
    setErreur(null)
    const base = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: base },
    })
    if (error) setErreur('Connexion Google indisponible. Choisissez un mot de passe ci-dessous.')
  }

  // ── 1. Valider le token dès le montage ─────────────────────────────
  useEffect(() => {
    async function valider() {
      try {
        const res = await fetch(`/api/accept?token=${encodeURIComponent(token)}`)
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({}))
          throw new Error(error || 'Lien invalide ou expiré.')
        }
        const { email } = await res.json()
        setEmailCible(email)
      } catch (err) {
        setErreur(err.message || 'Ce lien d\'invitation est invalide ou expiré.')
        onTokenInvalide?.()
      } finally {
        setCharge(false)
      }
    }
    valider()
    // Revalidation uniquement au changement de token ; onTokenInvalide n'est qu'un callback de notification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // ── 2. Créer le compte ──────────────────────────────────────────────
  async function creerCompte(e) {
    e.preventDefault()
    setErreur(null)

    if (mdp.length < 8) {
      setErreur('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (mdp !== mdpConfirm) {
      setErreur('Les mots de passe ne correspondent pas.')
      return
    }

    setCharge(true)
    try {
      // Création du compte via le serverless (service_role)
      const res = await fetch('/api/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: mdp }),
      })

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}))
        throw new Error(error || 'Impossible de créer le compte.')
      }

      // Connexion immédiate avec les identifiants choisis
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: emailCible,
        password: mdp,
      })
      if (signInErr) throw signInErr

      setFait(true)
      // AuthContext détecte la session → App.jsx affichera EnrollMFA
    } catch (err) {
      setErreur(err.message || 'Une erreur est survenue. Réessayez.')
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
      width: 380,
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    },
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
    success: {
      fontSize: 13,
      color: 'var(--color-success)',
      background: 'var(--color-success-light)',
      borderRadius: 'var(--radius-md)',
      padding: '8px 12px',
    },
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 12 }}>SARM</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text)' }}>
            Créer votre compte
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Vous avez reçu une invitation pour accéder au dashboard financier SARM.
          </div>
        </div>

        {charge && !emailCible && (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, textAlign: 'center' }}>
            Validation de l'invitation…
          </div>
        )}

        {erreur && <div style={s.erreur}>{erreur}</div>}

        {fait && (
          <div style={s.success}>
            Compte créé avec succès ! Configuration de la double authentification en cours…
          </div>
        )}

        {emailCible && !fait && emailCible.toLowerCase().endsWith('@gmail.com') && (
          <>
            {/* Adresse Gmail : inutile de choisir un mot de passe — Google authentifie,
                et l'invitation (déjà posée pour cette adresse) autorise le compte
                à sa création, côté base. Cf. supabase/connexion_google.sql. */}
            <button
              type="button"
              onClick={connexionGoogle}
              style={{
                width: '100%', padding: '10px',
                background: 'var(--color-surface)', color: 'var(--color-text)',
                border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                fontSize: 14, fontWeight: 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continuer avec Google
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
              ou choisissez un mot de passe
              <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            </div>
          </>
        )}

        {emailCible && !fait && (
          <form onSubmit={creerCompte} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={s.label}>Adresse e-mail (invitation)</label>
              <input type="email" value={emailCible} disabled style={{ ...s.input, opacity: 0.6 }} />
            </div>
            <div>
              <label style={s.label}>Choisissez un mot de passe</label>
              <input
                type="password"
                required
                minLength={8}
                autoFocus
                value={mdp}
                onChange={e => setMdp(e.target.value)}
                style={s.input}
                placeholder="Au moins 8 caractères"
              />
            </div>
            <div>
              <label style={s.label}>Confirmez le mot de passe</label>
              <input
                type="password"
                required
                value={mdpConfirm}
                onChange={e => setMdpConfirm(e.target.value)}
                style={s.input}
              />
            </div>
            <button type="submit" disabled={charge} style={s.bouton}>
              {charge ? 'Création…' : 'Créer mon compte'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
