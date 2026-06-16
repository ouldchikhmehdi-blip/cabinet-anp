// ============================================================
// PanneauPonts — alerte « ponts / jours fériés » (PLANNING.md).
// Un jour férié = garde/astreinte uniquement (le bloc ne tourne pas) : un jour off
// — ou une indispo week-end — accolé à un férié forme un « pont » à signaler tôt au
// faiseur (risque de déséquilibre).
//
// Props :
//   pontsParAssocie        : { ini: Pont[] }        (jours off — cf. utils/ponts.js)
//   pontsWeekendParAssocie : { ini: PontWE[] }       (indispos week-end accolées à un férié)
//   ecartesSet             : Set('INI|YYYY-MM-DD' | 'INI|WE|<semaine>') des éléments écartés
//   onToggle               : (cle) => void — si ABSENT ⇒ lecture seule (cases désactivées)
//
// Bascule cochée = pont REFUSÉ → ce jour off / cette indispo est ignoré par l'attribution
// des week-ends. Décochée (défaut) = pont CONSERVÉ → respecté. Alerte douce, non bloquante.
// ============================================================
import { ASSOCIES } from '../../data/associes'
import { formatDateLongueFR } from '../../utils/calendrier'
import { cleEcart, cleEcartWeekend, parseISO } from '../../utils/ponts'

export default function PanneauPonts({ pontsParAssocie = {}, pontsWeekendParAssocie = {}, ecartesSet = new Set(), onToggle }) {
  const interactif = typeof onToggle === 'function'
  const inis = ASSOCIES.filter(ini => (pontsParAssocie[ini] ?? []).length > 0 || (pontsWeekendParAssocie[ini] ?? []).length > 0)
  const total = inis.reduce((n, ini) => n + (pontsParAssocie[ini]?.length ?? 0) + (pontsWeekendParAssocie[ini]?.length ?? 0), 0)

  const s = {
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-amber)',
      borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 16,
    },
    titre: { fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 },
    note: { fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 14 },
    bloc: { marginBottom: 14 },
    ini: { fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 },
    pont: { marginLeft: 4, marginBottom: 10, paddingLeft: 10, borderLeft: '2px solid var(--color-amber)' },
    plage: { fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 },
    feries: { fontSize: 12, color: 'var(--color-amber)', fontWeight: 500 },
    optLigne: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0', cursor: interactif ? 'pointer' : 'default' },
    ecarte: { color: 'var(--color-text-tertiary)', textDecoration: 'line-through' },
    tagEcarte: { fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' },
  }

  if (total === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--color-success)', marginBottom: 16 }}>
        Aucun pont détecté ✓
      </div>
    )
  }

  // Bascule générique (jour off ou week-end) : libellé + case, état depuis ecartesSet.
  const bascule = (cle, libelle) => {
    const ecarte = ecartesSet.has(cle)
    return (
      <label key={cle} style={s.optLigne}>
        <input
          type="checkbox"
          checked={ecarte}
          disabled={!interactif}
          onChange={() => onToggle?.(cle)}
          style={{ accentColor: 'var(--color-amber)' }}
        />
        <span style={ecarte ? s.ecarte : { color: 'var(--color-text)' }}>{libelle}</span>
        {ecarte && <span style={s.tagEcarte}>— écarté</span>}
      </label>
    )
  }

  return (
    <div style={s.carte}>
      <div style={s.titre}>🌉 Ponts / jours fériés ({total})</div>
      <div style={s.note}>
        Un jour férié = garde/astreinte uniquement, le bloc opératoire ne tourne pas.
        {interactif
          ? ' Décocher = pont conservé (respecté). Cocher = pont refusé : ce jour off / cette indisponibilité est ignoré par l’attribution automatique des week-ends.'
          : ' Les éléments cochés (écartés) sont ignorés par l’attribution des week-ends ; à gérer dans le Suivi des desiderata.'}
      </div>

      {inis.map(ini => (
        <div key={ini} style={s.bloc}>
          <div style={s.ini}>{ini}</div>

          {/* Ponts « jours off » */}
          {(pontsParAssocie[ini] ?? []).map(pont => (
            <div key={pont.id} style={s.pont}>
              <div style={s.plage}>
                {formatDateLongueFR(parseISO(pont.debut))} → {formatDateLongueFR(parseISO(pont.fin))}
              </div>
              <div style={s.feries}>Férié : {pont.feries.map(f => f.nom).join(', ')}</div>
              {pont.joursOff.map(iso => bascule(cleEcart(ini, iso), formatDateLongueFR(parseISO(iso))))}
            </div>
          ))}

          {/* Ponts « week-end » (indispo accolée à un férié vendredi/lundi) */}
          {(pontsWeekendParAssocie[ini] ?? []).map(pw => (
            <div key={`we-${pw.semaine}`} style={s.pont}>
              <div style={s.feries}>
                Week-end accolé au férié : {pw.feries.map(f => `${f.nom} (${f.jour})`).join(', ')}
              </div>
              {bascule(
                cleEcartWeekend(ini, pw.semaine),
                `Week-end S${pw.semaine} — ${formatDateLongueFR(parseISO(pw.debut))} → ${formatDateLongueFR(parseISO(pw.fin))} (indisponible)`
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
