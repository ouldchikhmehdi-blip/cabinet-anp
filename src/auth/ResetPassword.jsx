import { useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * ResetPassword — affiché quand l'utilisateur revient d'un lien « mot de passe oublié »
 * (AuthContext.recovery === true, voir App.jsx). Intercepté AVANT le routage AAL/2FA.
 *
 * Flux :
 *   1. Session de récupération (AAL1) déjà créée par supabase-js au retour du lien.
 *   2. L'associé saisit un nouveau mot de passe → supabase.auth.updateUser({ password }).
 *   3. Succès → on déconnecte (signOut) ; AuthContext lève `recovery` et App.jsx réaffiche Login.
 *      L'associé se reconnecte avec son nouveau mot de passe + son code 2FA habituel.
 *
 * La demande de réinitialisation (saisie de l'e-mail + envoi du lien) se fait dans Login.jsx (étape 'oubli').
 */
export default function ResetPassword() {
  const [mdp,        setMdp]        = useState('')
  const [mdpConfirm, setMdpConfirm] = useState('')
  const [erreur,     setErreur]     = useState(null)
  const [charge,     setCharge]     = useState(false)
  const [fait,       setFait]       = useState(false)

  async function enregistrer(e) {
    e.preventDefault()
    setErreur(null)

    if (mdp.length < 12) {
      setErreur('Le mot de passe doit contenir au moins 12 caractères.')
      return
    }
    if (!/[a-z]/.test(mdp) || !/[A-Z]/.test(mdp) || !/[0-9]/.test(mdp) || !/[^a-zA-Z0-9]/.test(mdp)) {
      setErreur('Le mot de passe doit contenir une minuscule, une majuscule, un chiffre et un symbole.')
      return
    }
    if (mdp !== mdpConfirm) {
      setErreur('Les mots de passe ne correspondent pas.')
      return
    }

    setCharge(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: mdp })
      if (error) throw error
      setFait(true)
    } catch (err) {
      setErreur(err?.message || 'Impossible de modifier le mot de passe. Le lien a peut-être expiré — redemandez-en un.')
    } finally {
      setCharge(false)
    }
  }

  // Déconnexion → AuthContext lève `recovery` (branche else d'onAuthStateChange) → App affiche Login.
  async function versConnexion() {
    setCharge(true)
    try { await supabase.auth.signOut() } catch { /* la déconnexion ne doit jamais bloquer */ }
  }

  const s = {
    page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' },
    card: { background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '0.5px solid var(--color-border)', padding: '40px 36px', width: 380, display: 'flex', flexDirection: 'column', gap: 20 },
    label: { fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 },
    input: { width: '100%', padding: '9px 12px', fontSize: 14, border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' },
    bouton: { width: '100%', padding: '10px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500, cursor: charge ? 'wait' : 'pointer', opacity: charge ? 0.7 : 1 },
    erreur: { fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 'var(--radius-md)', padding: '8px 12px' },
    success: { fontSize: 13, color: 'var(--color-success)', background: 'var(--color-success-light)', borderRadius: 'var(--radius-md)', padding: '8px 12px' },
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 12 }}>SARM</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text)' }}>
            {fait ? 'Mot de passe modifié' : 'Définir un nouveau mot de passe'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {fait
              ? 'Reconnectez-vous avec votre nouveau mot de passe, puis validez votre code 2FA.'
              : 'Choisissez un nouveau mot de passe pour votre compte.'}
          </div>
        </div>

        {erreur && <div style={s.erreur}>{erreur}</div>}

        {fait ? (
          <>
            <div style={s.success}>Votre mot de passe a bien été modifié.</div>
            <button type="button" onClick={versConnexion} disabled={charge} style={s.bouton}>
              {charge ? '…' : 'Continuer vers la connexion'}
            </button>
          </>
        ) : (
          <form onSubmit={enregistrer} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={s.label}>Nouveau mot de passe</label>
              <input
                type="password"
                required
                minLength={12}
                autoFocus
                value={mdp}
                onChange={e => setMdp(e.target.value)}
                style={s.input}
                placeholder="12 caractères min."
              />
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                Au moins 12 caractères, avec une minuscule, une majuscule, un chiffre et un symbole.
              </div>
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
              {charge ? 'Enregistrement…' : 'Enregistrer le nouveau mot de passe'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
