// ============================================================
// BoutonVerrou — petit cadenas pour figer (« forcer ») une case d'affectation.
// Verrouillé (🔒) : choix manuel du faiseur, préservé par « Proposer automatiquement ».
// Libre (🔓, atténué) : case automatique, recalculable. Réutilisé par Week-ends / Vacances / Réa.
// ============================================================
export default function BoutonVerrou({ verrouille, onToggle, title }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title ?? (verrouille
        ? 'Forcé (verrouillé) — non modifié par « Proposer ». Cliquer pour remettre en automatique.'
        : 'Cliquer pour verrouiller (forcer) cette case.')}
      style={{
        border: 'none', background: 'transparent', cursor: 'pointer',
        fontSize: 13, lineHeight: 1, padding: '0 2px',
        opacity: verrouille ? 1 : 0.35,
      }}
      aria-label={verrouille ? 'Déverrouiller' : 'Verrouiller'}
    >
      {verrouille ? '🔒' : '🔓'}
    </button>
  )
}
