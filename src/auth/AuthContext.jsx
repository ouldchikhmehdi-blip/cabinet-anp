import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * AuthContext — état global d'authentification.
 *
 * Valeurs exposées via useAuth() :
 *   session  — objet Session Supabase (ou null)
 *   profile  — ligne profiles { id, email, role, status } (ou null)
 *   aal      — niveau d'assurance courant : 'aal1' | 'aal2' | null
 *   nextAal  — niveau requis selon les facteurs enrôlés
 *   loading  — true tant que l'état initial n'est pas connu
 *   recovery — true quand l'utilisateur revient d'un lien « mot de passe oublié »
 *              (doit afficher l'écran « nouveau mot de passe » avant tout routage AAL/2FA)
 */

// Détection synchrone du retour d'un lien de récupération (hash #type=recovery), AVANT le premier rendu :
// gagne la course contre onAuthStateChange (qui ne s'abonne qu'après le montage).
function hashIndiqueRecovery() {
  return typeof window !== 'undefined' && window.location.hash.includes('type=recovery')
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,  setSession]  = useState(undefined) // undefined = pas encore chargé
  const [profile,  setProfile]  = useState(null)
  const [aal,      setAal]      = useState(null)
  const [nextAal,  setNextAal]  = useState(null)
  const [recovery, setRecovery] = useState(hashIndiqueRecovery)

  // Charge le profil depuis la table profiles
  async function fetchProfile(userId) {
    if (!userId) { setProfile(null); return }
    const { data } = await supabase
      .from('profiles')
      .select('id, email, role, status, initiales, is_faiseur')
      .eq('id', userId)
      .single()
    setProfile(data ?? null)
  }

  // Recalcule le niveau AAL de la session courante
  async function refreshAal() {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    setAal(data?.currentLevel  ?? null)
    setNextAal(data?.nextLevel ?? null)
  }

  useEffect(() => {
    // Lecture de la session existante au montage
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s ?? null)
      if (s) {
        fetchProfile(s.user.id)
        refreshAal()
      }
    })

    // Abonnement aux changements d'état auth (login, logout, refresh, récupération de mot de passe)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        if (event === 'PASSWORD_RECOVERY') setRecovery(true)
        setSession(s ?? null)
        if (s) {
          fetchProfile(s.user.id)
          refreshAal()
        } else {
          setProfile(null)
          setAal(null)
          setNextAal(null)
          setRecovery(false) // déconnexion (ex. après réinitialisation) → fin de l'état récupération
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const loading = session === undefined

  return (
    <AuthContext.Provider value={{ session, profile, aal, nextAal, loading, recovery }}>
      {children}
    </AuthContext.Provider>
  )
}

// Hook d'accès co-localisé avec le Provider (pattern Context courant).
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth() doit être utilisé dans un AuthProvider')
  return ctx
}
