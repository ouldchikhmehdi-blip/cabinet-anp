// ============================================================
// CompteurCongesAgent — le bloc « CONGES » du bulletin de paie, tel que l'agent
// le lit. Strictement en LECTURE : ces chiffres viennent de la paie, pas du
// dashboard, et c'est la gestion qui les recopie (onglet « Compteur congés »).
//
// On reproduit le bulletin, y compris ses silences : une ligne non concernée
// reste vide plutôt que d'afficher 0,00, et le solde ne s'imprime pas quand il
// vaut zéro. Inventer un 0 ferait dire au dashboard ce que la paie n'a pas dit.
//
// Le même bloc sert dans « Aperçu compte IADE » : IadeApercu rend IadeMesConges
// avec la prop `apercu`, donc ce composant suit sans câblage supplémentaire.
// ============================================================
import { LIGNES, formatJours, formatSolde, libelleMoisRef } from '../../utils/iadeCompteurConges'

const carte = {
  background: 'var(--color-surface)',
  border: '0.5px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  overflowX: 'auto',
}
const th = {
  padding: '8px 14px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)',
  textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.05em',
}
const thGauche = { ...th, textAlign: 'left' }
const td = { padding: '8px 14px', fontSize: 13, color: 'var(--color-text)', textAlign: 'right' }
const tdLigne = { ...td, textAlign: 'left', fontWeight: 500 }
const tr = { borderBottom: '0.5px solid var(--color-border)' }

export default function CompteurCongesAgent({ compteur = null, lectureSeule = false }) {
  // Pas de ligne en base : surtout pas un tableau de zéros, qui se lirait comme
  // « vous n'avez aucun congé ». On dit ce qui est : rien n'a encore été recopié.
  if (!compteur) {
    return (
      <div style={{ ...carte, padding: '14px 16px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
        {lectureSeule
          ? "Aucun bulletin de paie n'a encore été recopié pour cet agent."
          : "Aucun bulletin de paie n'a encore été recopié pour vous. Ce compteur apparaîtra dès que la gestion l'aura saisi."}
      </div>
    )
  }

  return (
    <>
      <div style={carte}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
          <thead>
            <tr style={tr}>
              <th style={thGauche}>Congés</th>
              <th style={th}>Acquis</th>
              <th style={th}>Pris</th>
              <th style={th}>Solde</th>
            </tr>
          </thead>
          <tbody>
            {LIGNES.map(l => (
              <tr key={l.cle} style={tr}>
                <td style={tdLigne}>{l.label}</td>
                <td style={td}>{formatJours(compteur[l.acquis])}</td>
                <td style={td}>{formatJours(compteur[l.pris])}</td>
                <td style={{ ...td, fontWeight: 700 }}>
                  {formatSolde(compteur[l.acquis], compteur[l.pris])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* D'où viennent ces chiffres : sans le mois, un solde n'est vérifiable
          contre rien — et il n'y a pas d'historique pour le retrouver. */}
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '8px 0 0', lineHeight: 1.5 }}>
        D'après le bulletin de paie de <strong>{libelleMoisRef(compteur.mois_ref)}</strong>.
        Ces chiffres viennent de la paie, en jours — le dashboard les recopie, il ne les calcule pas.
      </p>
    </>
  )
}
