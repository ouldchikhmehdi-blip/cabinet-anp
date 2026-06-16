// ============================================================
// AffectationAssocies — tableau « associé → colonne / rôle / garde(s) » d'une semaine.
// Vue associé-centrée (complémentaire de TrameGrille qui est colonne-centrée et masque réa/vacances).
// Montre EXPLICITEMENT tout le monde : réa, vacanciers, avant/après-WE, colonnes libres, et les non placés.
// Purement de l'affichage : se déduit de l'affectation résolue (affResolue = { col: ini }).
// ============================================================
import { ASSOCIES } from '../../data/associes'
import { datesGardeSemaine } from '../../utils/semaines'

// Couleurs de rôle (alignées sur TrameGrille / PlanningTrames).
const ROLE_REA = '#0E7C66'
const ROLE_VACANCES = '#2D6CB5'
const ROLE_WE = 'var(--color-primary-dark)'
const ROLE_REMPLACANT = '#B45309'

const s = {
  wrap: { marginBottom: 12 },
  titre: { fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 },
  table: { borderCollapse: 'collapse', fontSize: 13, width: '100%', maxWidth: 520 },
  th: {
    padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)',
    textAlign: 'left', borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap',
  },
  tdAssoc: { padding: '4px 10px', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap' },
  tdCol: { padding: '4px 10px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' },
  tdRole: { padding: '4px 10px', whiteSpace: 'nowrap' },
  tdGarde: { padding: '4px 10px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' },
  ligneVide: { color: 'var(--color-text-tertiary)', fontStyle: 'italic' },
  puceGarde: {
    display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600,
    background: '#FFFF00', color: 'rgba(0,0,0,0.7)',
  },
  rempla: { marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 },
  remplaTitre: { fontWeight: 600, color: ROLE_REMPLACANT },
  remplaItem: { color: ROLE_REMPLACANT },
}

const JOUR_LABEL = { 2: 'Mardi', 4: 'Jeudi' }

export default function AffectationAssocies({ trame, affResolue = {}, annee, num, calendrier }) {
  if (!trame) return null

  // Inverse { col: ini } → { ini: col } (premier trouvé). Les colonnes sont des nombres (clés string).
  const colParAssocie = {}
  for (const [col, ini] of Object.entries(affResolue)) {
    if (ASSOCIES.includes(ini) && colParAssocie[ini] == null) colParAssocie[ini] = Number(col)
  }

  // Un associé n'occupe jamais une colonne remplaçant (externe) ; ce rôle est listé à part, en dessous.
  const roleDe = (col) => {
    if (col === trame.rea) return { label: 'Réa', couleur: ROLE_REA }
    if ((trame.vacances ?? []).includes(col)) return { label: 'Vacances', couleur: ROLE_VACANCES }
    if (col === trame.avantWE) return { label: 'Avant WE', couleur: ROLE_WE }
    if (col === trame.apresWE) return { label: 'Après WE', couleur: ROLE_WE }
    return { label: 'Libre', couleur: 'var(--color-text-secondary)' }
  }

  // Colonnes remplaçant (personnes externes) — affichées séparément, jamais comptées comme associés.
  const remplacants = (trame.remplacants ?? [])
    .filter(r => r.col != null)
    .slice()
    .sort((a, b) => a.col - b.col)

  return (
    <div style={s.wrap}>
      <div style={s.titre}>Affectation de la semaine — qui occupe quelle colonne</div>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Associé</th>
            <th style={s.th}>Colonne</th>
            <th style={s.th}>Rôle</th>
            <th style={s.th}>Garde de semaine</th>
          </tr>
        </thead>
        <tbody>
          {ASSOCIES.map(ini => {
            const col = colParAssocie[ini]
            if (col == null) {
              return (
                <tr key={ini}>
                  <td style={s.tdAssoc}>{ini}</td>
                  <td style={{ ...s.tdCol, ...s.ligneVide }} colSpan={3}>non placé</td>
                </tr>
              )
            }
            const role = roleDe(col)
            const jours = datesGardeSemaine(trame, col, annee, num, calendrier)
              .map(d => JOUR_LABEL[d.getDay()]).filter(Boolean)
            return (
              <tr key={ini}>
                <td style={s.tdAssoc}>{ini}</td>
                <td style={s.tdCol}>C{col + 1}</td>
                <td style={{ ...s.tdRole, color: role.couleur, fontWeight: 600 }}>{role.label}</td>
                <td style={s.tdGarde}>
                  {jours.length
                    ? jours.map(j => <span key={j} style={{ ...s.puceGarde, marginRight: 4 }}>{j}</span>)
                    : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {remplacants.length > 0 && (
        <div style={s.rempla}>
          <span style={s.remplaTitre}>Remplaçant{remplacants.length > 1 ? 's' : ''} (externe{remplacants.length > 1 ? 's' : ''}) :</span>
          {remplacants.map((r, k) => (
            <span key={k} style={s.remplaItem}>C{r.col + 1} → {r.nom || `Remplaçant ${k + 1}`}</span>
          ))}
        </div>
      )}
    </div>
  )
}
