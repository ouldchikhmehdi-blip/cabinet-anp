import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * ResetPassword — affiché quand l'utilisateur revient d'un lien « mot de passe oublié »
 * (AuthContext.recovery === true, voir App.jsx). Intercepté AVANT le routage AAL/2FA.
 *
 * Flux :
 *   1. Session de récupération (AAL1) déjà créée par supabase-js au retour du lien.
 *   2. Supabase EXIGE une session AAL2 pour changer le mot de passe quand la 2FA est activée
 *      → on demande d'abord le code TOTP (mfa.challenge + mfa.verify) pour élever en AAL2.
 *      (Sécurité : un lien de récupération volé ne suffit pas, il faut aussi le 2ᵉ facteur.)
 *   3. Nouveau mot de passe → supabase.auth.updateUser({ password }).
 *   4. Succès → signOut ; AuthContext lève `recovery` et App.jsx réaffiche Login.
 *      L'associé se reconnecte avec son nouveau mot de passe + son code 2FA habituel.
 *
 * La demande de réinitialisation (saisie de l'e-mail + envoi du lien) se fait dans Login.jsx (étape 'oubli').
 */
export default function ResetPassword() {
  const [mode,       setMode]       = useState(null)  // null (préparation) | 'totp' | 'nouveau' | 'fait'
  const [factor,     setFactor]     = useState(null)  // { id, challengeId }
  const [code,       setCode]       = useState('')
  const [mdp,        setMdp]        = useState('')
  const [mdpConfirm, setMdpConfirm] = useState('')
  const [erreur,     setErreur]     = useState(null)
  const [charge,     setCharge]     = useState(false)

  // ── Préparation : faut-il élever en AAL2 (code 2FA) avant de changer le mot de passe ? ──
  useEffect(() => {
    let annule = false
    async function preparer() {
      try {
        const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (aalData?.currentLevel === 'aal2') {
          if (!annule) setMode('nouveau') // déjà AAL2 → directement le nouveau mot de passe
          return
        }
        // Sinon : trouver le facteur TOTP vérifié et lancer un challenge
        const { data: factors } = await supabase.auth.mfa.listFactors()
        const totp = factors?.totp?.find(f => f.status === 'verified')
        if (!totp) {
          if (!annule) setMode('nouveau') // aucun facteur (cas improbable) → on tentera directement
          return
        }
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
        if (chErr) throw chErr
        if (!annule) { setFactor({ id: totp.id, challengeId: ch.id }); setMode('totp') }
      } catch {
        if (!annule) setMode('nouveau') // au pire, updateUser renverra l'erreur explicite
      }
    }
    preparer()
    return () => { annule = true }
  }, [])

  // ── Étape 2FA : valider le code TOTP pour passer en AAL2 ──
  async function verifierTotp(e) {
    e.preventDefault()
    setErreur(null)
    setCharge(true)
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId:    factor.id,
        challengeId: factor.challengeId,
        code:        code.trim(),
      })
      if (error) throw error
      setMode('nouveau') // session désormais AAL2 → updateUser autorisé
    } catch {
      setErreur('Code incorrect ou expiré. Réessayez.')
      setCode('')
    } finally {
      setCharge(false)
    }
  }

  // ── Étape nouveau mot de passe ──
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
      setMode('fait')
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

  const titre = mode === 'fait'
    ? 'Mot de passe modifié'
    : mode === 'totp'
      ? 'Vérification 2FA'
      : 'Définir un nouveau mot de passe'
  const sousTitre = mode === 'fait'
    ? 'Reconnectez-vous avec votre nouveau mot de passe, puis validez votre code 2FA.'
    : mode === 'totp'
      ? 'Pour réinitialiser votre mot de passe, confirmez d\'abord votre identité avec le code à 6 chiffres de votre application d\'authentification.'
      : 'Choisissez un nouveau mot de passe pour votre compte.'

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 12 }}>SARM</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text)' }}>{titre}</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>{sousTitre}</div>
        </div>

        {erreur && <div style={s.erreur}>{erreur}</div>}

        {mode === null && (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'center' }}>Vérification du lien…</div>
        )}

        {mode === 'totp' && (
          <form onSubmit={verifierTotp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          </form>
        )}

        {mode === 'nouveau' && (
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

        {mode === 'fait' && (
          <>
            <div style={s.success}>Votre mot de passe a bien été modifié.</div>
            <button type="button" onClick={versConnexion} disabled={charge} style={s.bouton}>
              {charge ? '…' : 'Continuer vers la connexion'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
