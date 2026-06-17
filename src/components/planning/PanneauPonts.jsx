// ============================================================
// PanneauPonts — alerte « ponts / jours fériés » (PLANNING.md).
// Un jour férié = garde/astreinte uniquement (le bloc ne tourne pas) : un jour off
// — ou une indispo week-end — accolé à un férié forme un « pont » à signaler tôt au
// faiseur (risque de déséquilibre).
//
// Affichage repliable : une rangée de badges d'initiales (les 8 associés). Le détail
// d'un associé — ses ponts, ses week-ends indisponibles ET tous ses jours off demandés —
// ne s'affiche qu'au clic sur son badge. Distinction visuelle : bloc ambre « lié à un
// férié (pont) » vs blocs neutres « week-ends indisponibles » / « autres jours off ».
//
// Props :
//   pontsParAssocie         : { ini: Pont[] }       (jours off — cf. utils/ponts.js)
//   pontsWeekendParAssocie  : { ini: PontWE[] }      (indispos week-end accolées à un férié)
//   joursOffParAssocie      : { ini: string[] }      (tous les jours off souhaités, ISO)
//   weekendsIndispoParAssocie : { ini: number[] }    (toutes les indispos week-end, n° sem. ISO)
//   annee                   : number                 (pour libeller les week-ends)
//   ecartesSet              : Set('INI|YYYY-MM-DD' | 'INI|WE|<semaine>') des éléments écartés
//   onToggle                : (cle) => void — si ABSENT ⇒ lecture seule (cases désactivées)
//
// Bascule cochée = REFUSÉ → ce jour off / cette indispo est ignoré par l'attribution
// des week-ends. Décochée (défaut) = CONSERVÉ → respecté. Alerte douce, non bloquante.
// ============================================================
import { useMemo, useState } from 'react'
import { ASSOCIES } from '../../data/associes'
import { formatDateLongueFR, listerWeekends } from '../../utils/calendrier'
import { cleEcart, cleEcartWeekend, parseISO } from '../../utils/ponts'

export default function PanneauPonts({
  pontsParAssocie = {},
  pontsWeekendParAssocie = {},
  joursOffParAssocie = {},
  weekendsIndispoParAssocie = {},
  annee,
  ecartesSet = new Set(),
  onToggle,
}) {
  const interactif = typeof onToggle === 'function'
  const [selection, setSelection] = useState(null) // initiales de l'associé déplié (null = replié)

  // Libellé lisible par numéro de semaine ISO (« WE S22 · 31/05 – 01/06 »).
  const labelWeekend = useMemo(() => {
    const map = {}
    if (annee != null) for (const w of listerWeekends(annee)) map[w.num] = w.label
    return map
  }, [annee])

  // Un associé a-t-il quelque chose à montrer (pont, indispo week-end ou jour off) ?
  const aContenu = (ini) =>
    (pontsParAssocie[ini]?.length ?? 0) > 0 ||
    (weekendsIndispoParAssocie[ini]?.length ?? 0) > 0 ||
    (joursOffParAssocie[ini]?.length ?? 0) > 0

  const concernes = ASSOCIES.filter(aContenu)
  const total = concernes.length

  const s = {
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-amber)',
      borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 16,
    },
    titre: { fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 },
    note: { fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 14 },
    badges: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
    badge: (actif, actif2) => ({
      padding: '5px 11px', fontSize: 13, fontWeight: 600, borderRadius: 999,
      cursor: actif2 ? 'pointer' : 'default',
      border: `0.5px solid ${actif ? 'var(--color-amber)' : 'var(--color-border)'}`,
      background: actif ? 'var(--color-amber)' : 'var(--color-bg)',
      color: actif ? '#fff' : actif2 ? 'var(--color-text)' : 'var(--color-text-tertiary)',
      opacity: actif2 ? 1 : 0.5,
    }),
    detail: { marginTop: 14 },
    sousTitre: { fontSize: 12, fontWeight: 700, color: 'var(--color-amber)', marginBottom: 8 },
    sousTitreNeutre: { fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginTop: 16, marginBottom: 8 },
    ini: { fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 },
    pont: { marginLeft: 4, marginBottom: 10, paddingLeft: 10, borderLeft: '2px solid var(--color-amber)' },
    plage: { fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 },
    feries: { fontSize: 12, color: 'var(--color-amber)', fontWeight: 500 },
    optLigne: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0', cursor: interactif ? 'pointer' : 'default' },
    ecarte: { color: 'var(--color-text-tertiary)', textDecoration: 'line-through' },
    tagEcarte: { fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' },
    vide: { fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 12 },
  }

  if (total === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--color-success)', marginBottom: 16 }}>
        Aucun pont ni indisponibilité ✓
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

  // Détail de l'associé sélectionné.
  const detail = (ini) => {
    const ponts = pontsParAssocie[ini] ?? []
    const pontsWE = pontsWeekendParAssocie[ini] ?? []
    const aPont = ponts.length > 0 || pontsWE.length > 0

    // Jours off ne faisant partie d'aucun pont (hors férié).
    const datesPont = new Set(ponts.flatMap(p => p.joursOff))
    const autresJoursOff = (joursOffParAssocie[ini] ?? []).filter(iso => !datesPont.has(iso))

    // Indispos week-end ordinaires : toutes celles qui ne sont PAS déjà montrées en pont.
    const semainesPont = new Set(pontsWE.map(pw => pw.semaine))
    const weekendsOrdinaires = (weekendsIndispoParAssocie[ini] ?? [])
      .filter(sem => !semainesPont.has(sem))
      .sort((a, b) => a - b)

    const rienDuTout = !aPont && weekendsOrdinaires.length === 0 && autresJoursOff.length === 0

    return (
      <div style={s.detail}>
        <div style={s.ini}>{ini}</div>

        {/* Groupe 1 : lié à un férié (pont) — ambre */}
        {aPont && (
          <>
            <div style={s.sousTitre}>🌉 Lié à un férié (pont)</div>
            {ponts.map(pont => (
              <div key={pont.id} style={s.pont}>
                <div style={s.plage}>
                  {formatDateLongueFR(parseISO(pont.debut))} → {formatDateLongueFR(parseISO(pont.fin))}
                </div>
                <div style={s.feries}>Férié : {pont.feries.map(f => f.nom).join(', ')}</div>
                {pont.joursOff.map(iso => bascule(cleEcart(ini, iso), formatDateLongueFR(parseISO(iso))))}
              </div>
            ))}
            {pontsWE.map(pw => (
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
          </>
        )}

        {/* Groupe 2 : week-ends indisponibles ordinaires — neutre, cochables (écarter) */}
        {weekendsOrdinaires.length > 0 && (
          <>
            <div style={s.sousTitreNeutre}>Week-ends indisponibles</div>
            {weekendsOrdinaires.map(sem => bascule(cleEcartWeekend(ini, sem), labelWeekend[sem] ?? `Week-end S${sem}`))}
          </>
        )}

        {/* Groupe 3 : autres jours off demandés (hors férié) — neutre, cochables (ignorer) */}
        {autresJoursOff.length > 0 && (
          <>
            <div style={s.sousTitreNeutre}>Autres jours off demandés (hors férié)</div>
            {autresJoursOff.map(iso => bascule(cleEcart(ini, iso), formatDateLongueFR(parseISO(iso))))}
          </>
        )}

        {rienDuTout && (
          <div style={s.vide}>Aucun pont, indisponibilité ni jour off pour cet associé.</div>
        )}
      </div>
    )
  }

  return (
    <div style={s.carte}>
      <div style={s.titre}>🌉 Indisponibilités · week-ends · jours fériés · off ({total})</div>
      <div style={s.note}>
        Cliquez sur un associé pour voir ses ponts, ses week-ends indisponibles et ses jours off demandés.
        {interactif
          ? ' Cocher = cet élément (jour off, indisponibilité…) est ignoré par la construction automatique du planning ; décocher = conservé.'
          : ' Les éléments cochés (écartés) sont ignorés par la construction automatique ; à gérer dans Ouverture du planning.'}
      </div>

      <div style={s.badges}>
        {ASSOCIES.map(ini => {
          const dispo = aContenu(ini)
          const actif = selection === ini
          return (
            <button
              key={ini}
              type="button"
              disabled={!dispo}
              onClick={() => setSelection(o => (o === ini ? null : ini))}
              style={s.badge(actif, dispo)}
              title={dispo ? 'Voir ses ponts, week-ends et jours off' : 'Aucun pont ni indisponibilité'}
            >
              {ini}
            </button>
          )
        })}
      </div>

      {selection && detail(selection)}
    </div>
  )
}
