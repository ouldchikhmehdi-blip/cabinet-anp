// ============================================================
// SemaineCreneaux — une semaine d'un coup d'œil : qui est absent chaque jour, et
// combien de salles en moins au bloc B.
//
// C'est la lecture de la gestion — « lundi il me manque deux salles le matin,
// jeudi une l'après-midi » — là où la liste, elle, sert à corriger ligne par
// ligne. Cinq colonnes, du lundi au vendredi ; on navigue de semaine en semaine.
// ============================================================
import { bilanSemaine, segmentsBilanB, resume, decalerJours, lundiDe } from '../../utils/iadeCreneaux'
import { formatJourCourt } from '../../utils/iadeConges'
import { periodeLongue } from '../../utils/iadeRempla'

// Le rouge des congés du planning : une salle en moins se lit comme une absence.
const ROUGE = '#E24A3B'
const BRUN = '#9A5B12'

export default function SemaineCreneaux({ creneaux, lundi, onChoisirLundi }) {
  const { jours, demiJourneesB } = bilanSemaine(creneaux, lundi)
  const vendredi = decalerJours(lundi, 4)
  const aujourdHui = lundiDe(new Date().toISOString().slice(0, 10))

  const boutonNav = {
    padding: '4px 10px', fontSize: 12, borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)', background: 'var(--color-bg)',
    color: 'var(--color-text)', cursor: 'pointer',
  }
  const colonne = {
    flex: '1 1 0', minWidth: 150, display: 'flex', flexDirection: 'column', gap: 8,
    border: '0.5px solid var(--color-border)', borderRadius: 8, padding: '10px 12px',
    background: 'var(--color-bg)',
  }
  const enTete = { fontSize: 12, fontWeight: 600, color: 'var(--color-text)', textTransform: 'capitalize' }
  const bloc = { fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const rien = { fontSize: 12, color: 'var(--color-text-tertiary)' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" style={boutonNav} onClick={() => onChoisirLundi(decalerJours(lundi, -7))} aria-label="Semaine précédente">‹</button>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
          Semaine {periodeLongue(lundi, vendredi)}
        </div>
        <button type="button" style={boutonNav} onClick={() => onChoisirLundi(decalerJours(lundi, 7))} aria-label="Semaine suivante">›</button>
        {lundi !== aujourdHui && (
          <button type="button" style={{ ...boutonNav, color: 'var(--color-text-secondary)' }}
                  onClick={() => onChoisirLundi(aujourdHui)}>
            Cette semaine
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: demiJourneesB > 0 ? ROUGE : 'var(--color-text-tertiary)', fontWeight: demiJourneesB > 0 ? 600 : 400 }}>
          {demiJourneesB > 0
            ? `Bloc B : −${demiJourneesB} demi-journée${demiJourneesB > 1 ? 's' : ''} de salle cette semaine`
            : 'Bloc B : toutes les salles tournent cette semaine'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        {jours.map(({ iso, bilanB, blocA }) => {
          const segments = segmentsBilanB(bilanB)
          return (
            <div key={iso} style={colonne}>
              <div style={enTete}>{formatJourCourt(iso)}</div>

              <div>
                <div style={bloc}>Bloc B</div>
                {segments.length === 0
                  ? <div style={rien}>toutes les salles</div>
                  : segments.map(s => (
                    <div key={s} style={{ color: ROUGE, fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{s}</div>
                  ))}
                {bilanB.lignes.map(c => (
                  <div key={c.id ?? `${c.moment}-${c.absent}`} style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                    {resume(c)}
                  </div>
                ))}
              </div>

              <div>
                <div style={bloc}>Bloc A</div>
                {blocA.length === 0
                  ? <div style={rien}>personne d'absent</div>
                  : blocA.map(c => (
                    <div key={c.id ?? `${c.moment}-${c.absent}`} style={{
                      fontSize: 12, fontWeight: 600, lineHeight: 1.4,
                      color: c.moment === 'journee' ? ROUGE : BRUN,
                    }}>
                      {resume(c)}
                    </div>
                  ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
