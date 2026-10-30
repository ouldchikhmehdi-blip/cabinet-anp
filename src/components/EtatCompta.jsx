// Bandeau d'état des données comptables, commun aux pages finance.
// Rend null quand tout va bien et qu'il y a des lignes.
export default function EtatCompta({ etat }) {
  const base = { fontSize: 12, padding: '8px 14px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 6 }
  if (etat.statut === 'chargement' || etat.statut === 'vide') {
    return <div style={{ ...base, background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>Chargement des lignes bancaires…</div>
  }
  if (etat.statut === 'erreur') {
    return <div style={{ ...base, background: '#FBE9E9', color: '#A32D2D' }}>Lecture impossible : {etat.erreur}</div>
  }
  if (etat.transactions.length === 0) {
    return <div style={{ ...base, background: '#EEEDFE', color: '#3C3489' }}>ℹ Aucune ligne bancaire importée. Importez un relevé OFX dans « Règles virements ».</div>
  }
  return null
}
