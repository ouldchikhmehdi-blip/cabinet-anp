import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { chargerAssociesDepuisBase } from '../utils/associesApi'

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
 *   profilCharge — true une fois la 1ʳᵉ lecture de `profiles` retombée. Le routage
 *              2FA l'attend : les comptes IADE sont dispensés de TOTP (cf. IADE.md),
 *              et c'est le profil qui porte cette information.
 *   siegesPrets — true une fois la liste des associés (initiales) chargée depuis la base.
 *              Sert à n'afficher le contenu authentifié (planning, comptes) qu'APRÈS
 *              avoir appliqué la liste à ASSOCIES : ASSOCIES est muté en place et une
 *              mutation ne re-rend pas React, donc on attend qu'elle soit faite.
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
  const [siegesPrets, setSiegesPrets] = useState(false)
  // true dès que la 1ʳᵉ lecture de profiles est retombée (succès OU échec).
  // Le routage 2FA doit attendre ce drapeau : c'est le profil qui dit si le
  // compte est un compte IADE, donc s'il est dispensé de TOTP.
  const [profilCharge, setProfilCharge] = useState(false)

  // Colonnes du profil. Les drapeaux IADE viennent de supabase/iade_conges.sql :
  // tant que ce fichier n'a pas été exécuté, la requête échoue (colonne inconnue)
  // — on retombe alors sur le jeu de colonnes historique pour ne verrouiller personne.
  const CHAMPS_PROFIL        = 'id, email, role, status, initiales, is_faiseur, nom_complet, is_iade, is_gestion_iade'
  const CHAMPS_PROFIL_LEGACY = 'id, email, role, status, initiales, is_faiseur, nom_complet'

  // Charge le profil depuis la table profiles
  async function fetchProfile(userId) {
    if (!userId) { setProfile(null); setProfilCharge(true); return }
    let { data, error } = await supabase
      .from('profiles')
      .select(CHAMPS_PROFIL)
      .eq('id', userId)
      .single()
    if (error) {
      ({ data } = await supabase
        .from('profiles')
        .select(CHAMPS_PROFIL_LEGACY)
        .eq('id', userId)
        .single())
    }
    setProfile(data ?? null)
    setProfilCharge(true)
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
          setProfilCharge(false)
          setAal(null)
          setNextAal(null)
          setRecovery(false) // déconnexion (ex. après réinitialisation) → fin de l'état récupération
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Charge la liste des associés (initiales) une fois par utilisateur connecté,
  // AVANT que les écrans planning/comptes ne s'affichent (cf. siegesPrets).
  // Clé sur l'id utilisateur : ne se relance pas à chaque refresh de token.
  useEffect(() => {
    const uid = session?.user?.id
    // Reset synchrone du gate à la déconnexion (pas de session) — intentionnel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!uid) { setSiegesPrets(false); return }
    let annule = false
    chargerAssociesDepuisBase().finally(() => { if (!annule) setSiegesPrets(true) })
    return () => { annule = true }
  }, [session?.user?.id])

  const loading = session === undefined

  return (
    <AuthContext.Provider value={{ session, profile, aal, nextAal, loading, recovery, siegesPrets, profilCharge }}>
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
