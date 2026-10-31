// ============================================================
// ChargesSalariales — un seul onglet pour tout ce que coûte le personnel :
// suivi mensuel de tout ce qui part (salaires, rempla, cotisations), salariés CDI,
// remplaçants MAR, remplaçants IADE, et leur comparaison dans le temps.
// Chaque sous-onglet est une page à part, avec son propre filtre de période.
// ============================================================
import { useState } from 'react'
import SalariesCDI from './SalariesCDI'
import RemplacantsMAR from './RemplacantsMAR'
import RemplacantsIADE from './RemplacantsIADE'
import ComparaisonCharges from './ComparaisonCharges'
import SuiviMensuelCharges from './SuiviMensuelCharges'

const ONGLETS = [
  { id: 'suivi', label: 'Suivi mensuel', icone: '📅', Page: SuiviMensuelCharges },
  { id: 'salaries-cdi', label: 'Salariés CDI', icone: '👤', Page: SalariesCDI },
  { id: 'remplacants-mar', label: 'Rempla MAR', icone: '⚕', Page: RemplacantsMAR },
  { id: 'remplacants-iade', label: 'Rempla IADE', icone: '↺', Page: RemplacantsIADE },
  { id: 'comparaison', label: 'Comparaison', icone: '⇆', Page: ComparaisonCharges },
]

// Même langage visuel que les onglets de « Congés, HS et rempla ».
const styleOnglet = (actif) => ({
  display: 'inline-flex', alignItems: 'center', gap: 7,
  padding: '8px 16px', fontSize: 13, fontWeight: actif ? 600 : 400,
  borderRadius: 'var(--radius-md)',
  border: actif ? '0.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
  background: actif ? 'var(--color-primary-light)' : 'var(--color-bg)',
  color: actif ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
  cursor: 'pointer',
})

// `initial` : sous-onglet ouvert d'entrée (anciens liens vers une des trois pages).
export default function ChargesSalariales({ initial = 'suivi' }) {
  const [vue, setVue] = useState(ONGLETS.some(o => o.id === initial) ? initial : 'suivi')
  const { Page } = ONGLETS.find(o => o.id === vue)

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Charges salariales</h1>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {ONGLETS.map(o => (
          <button key={o.id} type="button" aria-pressed={vue === o.id} style={styleOnglet(vue === o.id)} onClick={() => setVue(o.id)}>
            <span aria-hidden="true">{o.icone}</span>
            {o.label}
          </button>
        ))}
      </div>
      <Page />
    </div>
  )
}
