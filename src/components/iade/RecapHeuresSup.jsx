// ============================================================
// RecapHeuresSup — ce que l'agent voit de ses heures supplémentaires :
// un cumul mois par mois, et le mois affiché sous forme de calendrier.
//
// Les 12 mois sont toujours listés, même vides : un mois absent du tableau se
// confondrait avec un mois oublié.
//
// Les heures REFUSÉES sont comptées en nombre de déclarations, jamais en heures :
// elles ne sont pas dues, les additionner donnerait un total trompeur.
//
// Composant à part et sans mémoïsation manuelle, comme SyntheseMensuelle : un bloc
// de cette taille inline dans la page désoptimise tout le reste.
// ============================================================
import { moisAnneeFR } from '../../utils/calendrier'
import { grilleMois, INITIALES_JOURS, STATUTS, libelleStatut, formatJour } from '../../utils/iadeConges'
import { recapMensuel, totalHeures, formatHeures } from '../../utils/iadeHeuresSup'

export default function RecapHeuresSup({ lignes = [], annee, mois, onNaviguer }) {
  const recap = recapMensuel(lignes, annee)
  const validees = lignes.filter(l => l.statut === 'validee'
    && l.jour >= `${annee}-01-01` && l.jour <= `${annee}-12-31`)

  // Jour → déclaration à afficher dans la grille (la validée l'emporte).
  const parJour = new Map()
  for (const l of lignes) {
    const existante = parJour.get(l.jour)
    if (!existante || l.statut === 'validee') parJour.set(l.jour, l)
  }

  const carte = {
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
  }
  const th = { padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const td = { padding: '7px 12px', fontSize: 13, color: 'var(--color-text)' }
  const tr = { borderBottom: '0.5px solid var(--color-border)' }
  const boutonNav = {
    padding: '4px 10px', fontSize: 12, borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)', background: 'var(--color-bg)',
    color: 'var(--color-text-secondary)', cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* ── Cumul mois par mois ── */}
      <div style={{ ...carte, flex: '1 1 320px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 300 }}>
          <thead>
            <tr style={tr}>
              <th style={th}>Mois {annee}</th>
              <th style={th}>Validées</th>
              <th style={th}>En attente</th>
              <th style={th}>Refusées</th>
            </tr>
          </thead>
          <tbody>
            {recap.map(m => {
              const vide = m.heuresValidees === 0 && m.heuresEnAttente === 0 && m.nbRefusees === 0
              return (
                <tr key={m.mois} style={{ ...tr, opacity: vide ? 0.45 : 1 }}>
                  <td style={td}>{m.libelle}</td>
                  <td style={{ ...td, fontWeight: m.heuresValidees ? 600 : 400, color: m.heuresValidees ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
                    {m.heuresValidees ? formatHeures(m.heuresValidees) : '—'}
                  </td>
                  <td style={{ ...td, color: m.heuresEnAttente ? 'var(--color-amber)' : 'var(--color-text-tertiary)' }}>
                    {m.heuresEnAttente ? formatHeures(m.heuresEnAttente) : '—'}
                  </td>
                  <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>
                    {m.nbRefusees ? `${m.nbRefusees} décl.` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...td, fontWeight: 600 }}>Total {annee}</td>
              <td style={{ ...td, fontWeight: 700, color: 'var(--color-success)' }}>
                {formatHeures(totalHeures(validees))}
              </td>
              <td colSpan={2} style={{ ...td, color: 'var(--color-text-tertiary)', fontSize: 11 }}>
                heures validées, dues
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Le mois en calendrier ── */}
      <div style={{ ...carte, flex: '1 1 300px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderBottom: '0.5px solid var(--color-border)',
        }}>
          <button type="button" style={boutonNav} onClick={() => onNaviguer?.(-1)}>‹</button>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600, textAlign: 'center' }}>
            {moisAnneeFR(new Date(Date.UTC(annee, mois, 1)))}
          </div>
          <button type="button" style={boutonNav} onClick={() => onNaviguer?.(1)}>›</button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {INITIALES_JOURS.map((initiale, i) => (
                <th key={i} style={{
                  padding: '6px 0', fontSize: 10, fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                }}>
                  {initiale}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grilleMois(annee, mois).map((semaine, i) => (
              <tr key={i}>
                {semaine.map((jour, j) => {
                  if (!jour) return <td key={j} style={{ height: 40 }} />
                  const l  = parJour.get(jour.iso)
                  const st = l ? STATUTS[l.statut] : null
                  return (
                    <td
                      key={j}
                      title={l ? `${l.heures} h · ${libelleStatut(l.statut).toLowerCase()} · ${formatJour(l.jour)}` : undefined}
                      style={{
                        height: 40, textAlign: 'center', verticalAlign: 'middle',
                        border: '0.5px solid var(--color-border)',
                        background: l ? st?.fond : jour.weekend || jour.ferie ? 'var(--color-bg)' : 'transparent',
                      }}
                    >
                      <div style={{ fontSize: 11, color: l ? st?.couleur : 'var(--color-text-tertiary)' }}>
                        {jour.numero}
                      </div>
                      {l && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: st?.couleur }}>
                          +{l.heures}h
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{
          padding: '8px 14px', borderTop: '0.5px solid var(--color-border)',
          fontSize: 11, color: 'var(--color-text-tertiary)',
        }}>
          Ambre : en attente · Vert : validé · Rouge : refusé.
        </div>
      </div>
    </div>
  )
}
