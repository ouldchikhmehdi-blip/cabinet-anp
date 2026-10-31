// ============================================================
// Facturation — onglet « Facturé » : ce que les associés ont facturé et ce qui a été
// réglé, mois par mois, d'après les justificatifs d'honoraires de la clinique ; puis
// le facturé par chirurgien (retrouvé par numéro de séjour), navigable comme
// l'onglet Consultations. Données : agrégats poussés par compta/facturation.js.
// ============================================================
import { useState } from 'react'
import FacturationMensuel from './FacturationMensuel'
import FacturationChirurgiens from './FacturationChirurgiens'

const ONGLETS = [
  { id: 'mensuel', label: 'Facturé / réglé', icone: '📅', Page: FacturationMensuel },
  { id: 'chirurgiens', label: 'Par chirurgien', icone: '🩺', Page: FacturationChirurgiens },
]

// Même langage visuel que « Charges salariales ».
const styleOnglet = (actif) => ({
  display: 'inline-flex', alignItems: 'center', gap: 7,
  padding: '8px 16px', fontSize: 13, fontWeight: actif ? 600 : 400,
  borderRadius: 'var(--radius-md)',
  border: actif ? '0.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
  background: actif ? 'var(--color-primary-light)' : 'var(--color-bg)',
  color: actif ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
  cursor: 'pointer',
})

export default function Facturation({ initial = 'mensuel' }) {
  const [vue, setVue] = useState(ONGLETS.some(o => o.id === initial) ? initial : 'mensuel')
  const { Page } = ONGLETS.find(o => o.id === vue)

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Facturé</h1>
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
