// Bandeau d'état des agrégats de facturation (onglet « Facturé »). Rend null quand tout va bien.
export default function EtatFacturation({ etat }) {
  const base = { fontSize: 12, padding: '8px 14px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 6 }
  if (etat.statut === 'chargement' || etat.statut === 'vide') {
    return <div style={{ ...base, background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>Chargement de la facturation…</div>
  }
  if (etat.statut === 'erreur') {
    return <div style={{ ...base, background: '#FBE9E9', color: '#A32D2D' }}>Lecture impossible : {etat.erreur}</div>
  }
  if (etat.mensuel.length === 0 && etat.chirurgiens.length === 0) {
    return <div style={{ ...base, background: '#EEEDFE', color: '#3C3489' }}>ℹ Aucun mois importé. Lancer <code>compta/facturation.js</code> sur le mini PC après dépôt des justificatifs.</div>
  }
  return null
}
