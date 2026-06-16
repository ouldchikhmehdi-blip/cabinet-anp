// ============================================================
// TrameGrille — rendu lecture seule d'une trame (semaine type) : jours en lignes × colonnes.
// Réutilisé par l'étape Trames (faiseur) et par les desiderata (associés).
// Une case repos (vide) s'affiche en cyan #00B0F0 (couleur « congé/repos », cf. exportCalendrier).
// roles (optionnel) = { rea, vacances, avantWE, apresWE, remplacants:[{col,nom}] } → repères en-tête.
// ============================================================
import { JOURS, JOURS_LABEL } from '../../utils/trames'

const REPOS_BG = '#00B0F0'

// Repères de colonnes spéciales (libellé court + couleur).
const ROLES_BADGE = [
  { cle: 'rea', court: 'Réa', couleur: '#0E7C66' },
  { cle: 'vacances', court: 'Vacances', couleur: '#2D6CB5' },
  { cle: 'avantWE', court: '→ avant WE', couleur: 'var(--color-primary-dark)' },
  { cle: 'apresWE', court: '↩ après WE', couleur: 'var(--color-primary-dark)' },
]
const COULEUR_REMPLACANT = '#B45309'

const s = {
  table: { borderCollapse: 'collapse', fontSize: 13 },
  thJour: {
    padding: '6px 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
    textAlign: 'left', borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap',
  },
  thCol: {
    padding: '6px 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
    textAlign: 'center', borderBottom: '0.5px solid var(--color-border)',
    borderLeft: '0.5px solid var(--color-border)', minWidth: 96,
  },
  tdJour: {
    padding: '5px 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
    borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap',
  },
  tdCell: {
    padding: '5px 8px', fontSize: 13, textAlign: 'center', color: 'var(--color-text)',
    borderBottom: '0.5px solid var(--color-border)', borderLeft: '0.5px solid var(--color-border)',
  },
  repos: { color: 'rgba(0,0,0,0.5)', fontStyle: 'italic', fontSize: 11.5 },
  badge: { fontSize: 10, fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap' },
}

// colonnesVisibles (optionnel) : indices d'origine à afficher (les numéros C{i+1} sont conservés).
// Absent → toutes les colonnes (étape Trames du faiseur). Fourni → vue allégée (desiderata).
export default function TrameGrille({ colonnes = [], roles = null, colonnesVisibles = null }) {
  const remplA = (i) => roles?.remplacants?.filter(r => r.col === i) ?? []
  const indices = colonnesVisibles ?? colonnes.map((_, i) => i)

  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.thJour}>Jour</th>
          {indices.map(i => (
            <th key={i} style={s.thCol}>
              <div>C{i + 1}</div>
              {roles && ROLES_BADGE.filter(r => roles[r.cle] === i).map(r => (
                <div key={r.cle} style={{ ...s.badge, color: r.couleur }}>{r.court}</div>
              ))}
              {remplA(i).map((r, k) => (
                <div key={`r${k}`} style={{ ...s.badge, color: COULEUR_REMPLACANT }}>{r.nom || 'Remplaçant'}</div>
              ))}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {JOURS.map(j => (
          <tr key={j}>
            <td style={s.tdJour}>{JOURS_LABEL[j]}</td>
            {indices.map(i => {
              const col = colonnes[i] ?? {}
              const repos = !(col[j] ?? '').trim()
              const estRole = roles && (ROLES_BADGE.some(r => roles[r.cle] === i) || remplA(i).length > 0)
              // Priorité de fond : repos (cyan) > colonne de rôle > neutre.
              const background = repos
                ? REPOS_BG
                : (estRole ? 'var(--color-primary-light)' : 'transparent')
              return (
                <td key={i} style={{ ...s.tdCell, background }}>
                  {repos ? <span style={s.repos}>repos</span> : col[j]}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
