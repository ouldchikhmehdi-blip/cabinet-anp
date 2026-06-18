import { useState, useEffect } from 'react'
import { setMasqueMontants } from './data/mockData'
import { useAuth } from './auth/AuthContext'
import { supabase } from './lib/supabase'
import { peutQuitter } from './utils/gardeNavigation'
import Login from './auth/Login'
import EnrollMFA from './auth/EnrollMFA'
import AcceptInvitation from './auth/AcceptInvitation'
import ResetPassword from './auth/ResetPassword'
import Sidebar from './components/Sidebar'
import VueGlobale from './pages/VueGlobale'
import ChiffreAffaires from './pages/ChiffreAffaires'
import SalariesCDI from './pages/SalariesCDI'
import RemplacantsIADE from './pages/RemplacantsIADE'
import RemplacantsMAR from './pages/RemplacantsMAR'
import Depenses from './pages/Depenses'
import Consultations from './pages/Consultations'
import Retrocessions from './pages/Retrocessions'
import Tresorerie from './pages/Tresorerie'
import ReglesVirements from './pages/ReglesVirements'
import AdminUsers from './pages/AdminUsers'
import PlanningDesiderata from './pages/PlanningDesiderata'
import MonAgenda from './pages/MonAgenda'
import PlanningSuivi from './pages/PlanningSuivi'
import PlanningConstruction from './pages/PlanningConstruction'
import './index.css'

export default function App() {
  const { session, profile, aal, nextAal, loading, recovery } = useAuth()
  const [page, setPage] = useState('vue-globale')
  const [masque, setMasque] = useState(() => localStorage.getItem('masque') === '1')
  const [sombre, setSombre] = useState(() => localStorage.getItem('theme') === 'sombre')

  // Détecte un token d'invitation dans l'URL
  const inviteToken = new URLSearchParams(window.location.search).get('invite')

  // Synchronise le drapeau monétaire avant le rendu des pages (idempotent, pas de flicker)
  setMasqueMontants(masque)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', sombre ? 'sombre' : 'clair')
    localStorage.setItem('theme', sombre ? 'sombre' : 'clair')
  }, [sombre])

  const toggleMasque = () => {
    setMasque(prev => {
      const next = !prev
      localStorage.setItem('masque', next ? '1' : '0')
      return next
    })
  }

  const toggleSombre = () => setSombre(prev => !prev)

  // ── Gating d'authentification ─────────────────────────────────────────────
  //
  // Priorité des états :
  //   1. Chargement initial → écran neutre
  //   2. Lien d'invitation → AcceptInvitation (avant vérif session)
  //   3. Pas de session → Login
  //   4. Retour d'un lien « mot de passe oublié » → ResetPassword (avant tout routage AAL/2FA)
  //   5. Session AAL1 sans facteur TOTP (nextAal='aal1') → EnrollMFA obligatoire
  //   6. Session AAL1 avec facteur enrôlé (nextAal='aal2') → Login (étape code)
  //   7. Session AAL2 → dashboard (ci-dessous)

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
        color: 'var(--color-text-secondary)',
        fontSize: 14,
      }}>
        Chargement…
      </div>
    )
  }

  // Invitation dans l'URL — afficher même si déjà connecté (lien partagé)
  if (inviteToken && !session) {
    return <AcceptInvitation token={inviteToken} />
  }

  if (!session) {
    return <Login />
  }

  // Retour d'un lien « mot de passe oublié » : afficher l'écran nouveau mot de passe
  // AVANT le routage AAL (sinon la session AAL1 + TOTP enrôlé enverrait sur l'écran code 2FA).
  if (recovery) {
    return <ResetPassword />
  }

  // Session présente mais pas encore AAL2
  if (aal !== 'aal2') {
    // Aucun facteur TOTP enrôlé → forcer l'enrôlement
    if (nextAal === 'aal1' || nextAal === null) {
      return <EnrollMFA />
    }
    // Facteur enrôlé mais pas encore challengé cette session → retour au Login (étape code)
    return <Login />
  }

  // Compte désactivé (vérif supplémentaire côté client)
  if (profile?.status === 'disabled') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
        gap: 16,
      }}>
        <div style={{ fontSize: 15, color: 'var(--color-text)' }}>Votre accès a été révoqué.</div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            padding: '8px 20px',
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
          }}
        >
          Se déconnecter
        </button>
      </div>
    )
  }

  // ── Dashboard (AAL2 confirmé) ─────────────────────────────────────────────
  const renderPage = () => {
    switch(page) {
      case 'vue-globale':      return <VueGlobale />
      case 'chiffre-affaires': return <ChiffreAffaires />
      case 'salaries-cdi':     return <SalariesCDI />
      case 'remplacants-iade': return <RemplacantsIADE />
      case 'remplacants-mar':  return <RemplacantsMAR />
      case 'depenses':         return <Depenses />
      case 'consultations':    return <Consultations />
      case 'retrocessions':    return <Retrocessions />
      case 'tresorerie':       return <Tresorerie />
      case 'regles-virements': return <ReglesVirements />
      case 'planning-desiderata': return <PlanningDesiderata />
      case 'mon-agenda':          return profile?.initiales ? <MonAgenda /> : <VueGlobale />
      case 'planning-calendrier': return profile?.is_faiseur ? <PlanningConstruction /> : <VueGlobale />
      case 'planning-suivi':      return profile?.is_faiseur ? <PlanningSuivi /> : <VueGlobale />
      case 'admin-users':      return profile?.role === 'admin' ? <AdminUsers /> : <VueGlobale />
      default:                 return <VueGlobale />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        currentPage={page}
        onNavigate={(p) => { if (peutQuitter()) setPage(p) }}
        masque={masque}
        onToggleMasque={toggleMasque}
        sombre={sombre}
        onToggleSombre={toggleSombre}
        isAdmin={profile?.role === 'admin'}
        isFaiseur={profile?.is_faiseur === true}
        hasInitiales={!!profile?.initiales}
      />
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px',
        background: 'var(--color-bg)'
      }}>
        {renderPage()}
      </main>
    </div>
  )
}
