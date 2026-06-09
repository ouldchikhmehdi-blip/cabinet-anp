import { useState, useEffect } from 'react'
import { setMasqueMontants } from './data/mockData'
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
import './index.css'

export default function App() {
  const [page, setPage] = useState('vue-globale')
  const [masque, setMasque] = useState(() => localStorage.getItem('masque') === '1')
  const [sombre, setSombre] = useState(() => localStorage.getItem('theme') === 'sombre')

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

  const renderPage = () => {
    switch(page) {
      case 'vue-globale': return <VueGlobale />
      case 'chiffre-affaires': return <ChiffreAffaires />
      case 'salaries-cdi': return <SalariesCDI />
      case 'remplacants-iade': return <RemplacantsIADE />
      case 'remplacants-mar': return <RemplacantsMAR />
      case 'depenses': return <Depenses />
      case 'consultations': return <Consultations />
      case 'retrocessions': return <Retrocessions />
      case 'tresorerie': return <Tresorerie />
      case 'regles-virements': return <ReglesVirements />
      default: return <VueGlobale />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        currentPage={page}
        onNavigate={setPage}
        masque={masque}
        onToggleMasque={toggleMasque}
        sombre={sombre}
        onToggleSombre={toggleSombre}
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