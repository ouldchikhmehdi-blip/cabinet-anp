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
import PlanningParService from './pages/PlanningParService'
import PlanningAffiche from './pages/PlanningAffiche'
import IadeMesConges from './pages/IadeMesConges'
import IadeCalendrier from './pages/IadeCalendrier'
import IadeGestion from './pages/IadeGestion'
import IadeApercu from './pages/IadeApercu'
import './index.css'

// Seules pages ouvertes à un compte IADE (cf. IADE.md). Tout le reste — financier,
// planning, comptes — lui est fermé côté écran ET côté base (RLS).
const PAGES_IADE = ['iade-mes-conges', 'iade-calendrier']

export default function App() {
  const { session, profile, aal, nextAal, loading, recovery, siegesPrets, profilCharge } = useAuth()
  // Onglet initial : lu depuis l'URL (?page=...) pour permettre l'ouverture
  // d'un onglet précis dans une nouvelle fenêtre (clic du milieu dans la sidebar).
  const [page, setPage] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('page')
    return p || 'vue-globale'
  })
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
  //   5. Session AAL1 d'un compte IADE → accès direct à ses congés (2FA non exigée)
  //   6. Session AAL1 sans facteur TOTP (nextAal='aal1') → EnrollMFA obligatoire
  //   7. Session AAL1 avec facteur enrôlé (nextAal='aal2') → Login (étape code)
  //   8. Session AAL2 → dashboard (ci-dessous)

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
    // On ne peut trancher qu'en connaissant le profil : un compte IADE est
    // dispensé de 2FA (il n'accède qu'à ses congés, et la base exige l'AAL2
    // pour tout le reste — cf. supabase/securite_aal2.sql).
    if (!profilCharge) {
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

    if (!profile?.is_iade) {
      // Aucun facteur TOTP enrôlé → forcer l'enrôlement
      if (nextAal === 'aal1' || nextAal === null) {
        return <EnrollMFA />
      }
      // Facteur enrôlé mais pas encore challengé cette session → retour au Login (étape code)
      return <Login />
    }
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
        {/* Deux cas mènent ici : accès révoqué par un admin, ou connexion (Google)
            avec une adresse jamais invitée — le compte naît alors désactivé. */}
        <div style={{ fontSize: 15, color: 'var(--color-text)', textAlign: 'center', maxWidth: 380, lineHeight: 1.5 }}>
          Ce compte n'a pas accès au dashboard SARM.<br />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            L'accès est réservé aux personnes invitées. Si vous pensez qu'il s'agit d'une
            erreur, contactez l'administrateur.
          </span>
        </div>
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

  // Liste des associés (initiales) pas encore appliquée à ASSOCIES : attendre avant
  // d'afficher tout écran qui s'en sert (planning, comptes) — cf. AuthContext.siegesPrets.
  if (!siegesPrets) {
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

  // ── Compte IADE : accès limité à ses congés et au calendrier de l'équipe ──
  // Toute autre page (y compris via ?page=…) retombe sur « Mes congés ».
  const estIade = profile?.is_iade === true
  const peutGererIade = profile?.is_gestion_iade === true || profile?.is_faiseur === true || profile?.role === 'admin'

  if (estIade) {
    const pageIade = PAGES_IADE.includes(page) ? page : 'iade-mes-conges'
    return (
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar
          currentPage={pageIade}
          onNavigate={(p) => { if (peutQuitter()) setPage(p) }}
          masque={masque}
          onToggleMasque={toggleMasque}
          sombre={sombre}
          onToggleSombre={toggleSombre}
          isIade
        />
        <main style={{ flex: 1, overflow: 'auto', padding: '24px', background: 'var(--color-bg)' }}>
          {pageIade === 'iade-calendrier' ? <IadeCalendrier /> : <IadeMesConges />}
        </main>
      </div>
    )
  }

  // ── Vue PLEIN ÉCRAN (sans sidebar) — calendrier des desiderata, ouvert en nouvel onglet ──
  // Page contextuelle ouverte depuis « Ouverture du planning » (pas une entrée de navigation).
  if (page === 'planning-affiche') {
    return profile?.is_faiseur ? <PlanningAffiche /> : <VueGlobale />
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
      case 'planning-par-service': return profile?.is_faiseur ? <PlanningParService /> : <VueGlobale />
      case 'iade-gestion':        return peutGererIade ? <IadeGestion /> : <VueGlobale />
      case 'iade-calendrier':     return peutGererIade ? <IadeCalendrier /> : <VueGlobale />
      case 'iade-apercu':         return peutGererIade ? <IadeApercu /> : <VueGlobale />
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
        peutGererIade={peutGererIade}
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
