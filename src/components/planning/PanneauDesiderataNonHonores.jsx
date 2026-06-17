// ============================================================
// PanneauDesiderataNonHonores — recapitulatif, par associe, des desiderata qui
// ne sont PAS dans le planning final :
//   - ecartes par le faiseur (volontairement mis de cote) ;
//   - non honores par le planning (n'ont pas pu etre places).
//
// Affichage replie : une rangee de badges (8 associes), grise si rien a signaler.
// Au clic : deux groupes (Ecartes / Non honores). Outil d'ecran (no-print).
//
// Props :
//   bilan : { ini: { ecartes: Item[], nonHonores: Item[] } }
//           Item = { type: 'off'|'we'|'vac'|'col', iso?, sem? }
//   annee : number (pour libeller les semaines / week-ends)
// ============================================================
import { useMemo, useState } from 'react'
import { ASSOCIES } from '../../data/associes'
import { listerSemaines, listerWeekends, parseISO, formatDateLongueFR } from '../../utils/calendrier'

export default function PanneauDesiderataNonHonores({ bilan = {}, annee }) {
  const [selection, setSelection] = useState(null)

  const labelSemaine = useMemo(() => {
    const m = {}
    if (annee != null) for (const s of listerSemaines(annee)) m[s.num] = s.label
    return m
  }, [annee])
  const labelWeekend = useMemo(() => {
    const m = {}
    if (annee != null) for (const w of listerWeekends(annee)) m[w.num] = w.label
    return m
  }, [annee])

  // Libelle lisible d'un element selon son type.
  const libelle = (it) => {
    if (it.type === 'off') return `Jour off — ${formatDateLongueFR(parseISO(it.iso))}`
    if (it.type === 'we') return `Week-end — ${labelWeekend[it.sem] ?? `S${it.sem}`}`
    if (it.type === 'vac') return `Congé — ${labelSemaine[it.sem] ?? `S${it.sem}`}`
    if (it.type === 'col') return `Souhait de colonne — ${labelSemaine[it.sem] ?? `S${it.sem}`}`
    return ''
  }

  const aContenu = (ini) => {
    const b = bilan[ini]
    return !!b && (b.ecartes.length > 0 || b.nonHonores.length > 0)
  }

  const s = {
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 20,
    },
    titre: { fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 },
    note: { fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 14 },
    badges: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
    badge: (actif, dispo) => ({
      padding: '5px 11px', fontSize: 13, fontWeight: 600, borderRadius: 999,
      cursor: dispo ? 'pointer' : 'default',
      border: `0.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-border)'}`,
      background: actif ? 'var(--color-primary)' : 'var(--color-bg)',
      color: actif ? '#fff' : dispo ? 'var(--color-text)' : 'var(--color-text-tertiary)',
      opacity: dispo ? 1 : 0.5,
    }),
    detail: { marginTop: 14 },
    groupe: { marginBottom: 12 },
    groupeTitre: (couleur) => ({ fontSize: 13, fontWeight: 700, color: couleur, marginBottom: 6 }),
    ligne: (couleur, fond) => ({
      fontSize: 12, color: 'var(--color-text)', padding: '5px 9px', marginBottom: 4,
      borderLeft: `3px solid ${couleur}`, background: fond, borderRadius: 'var(--radius-md)',
    }),
    vide: { fontSize: 13, color: 'var(--color-success)', fontWeight: 600 },
  }

  const detail = (ini) => {
    const b = bilan[ini] ?? { ecartes: [], nonHonores: [] }
    if (b.ecartes.length === 0 && b.nonHonores.length === 0) {
      return <div style={s.detail}><div style={s.vide}>Tous les desiderata de {ini} sont honorés ✓</div></div>
    }
    return (
      <div style={s.detail}>
        {b.ecartes.length > 0 && (
          <div style={s.groupe}>
            <div style={s.groupeTitre('var(--color-amber)')}>Écartés par le faiseur</div>
            {b.ecartes.map((it, i) => (
              <div key={`e-${i}`} style={s.ligne('var(--color-amber)', 'var(--color-amber-light)')}>{libelle(it)}</div>
            ))}
          </div>
        )}
        {b.nonHonores.length > 0 && (
          <div style={s.groupe}>
            <div style={s.groupeTitre('var(--color-danger)')}>Non honorés par le planning</div>
            {b.nonHonores.map((it, i) => (
              <div key={`n-${i}`} style={s.ligne('var(--color-danger)', 'var(--color-danger-light)')}>{libelle(it)}</div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={s.carte} className="no-print">
      <div style={s.titre}>⚠ Desiderata non honorés — par associé</div>
      <div style={s.note}>
        Cliquez sur un associé pour voir ses desiderata <strong>écartés</strong> (mis de côté par le faiseur)
        et ceux <strong>non honorés</strong> par le planning (qui n'ont pas pu être placés). Un associé grisé
        n'a aucun desiderata laissé de côté.
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
              title={dispo ? 'Voir ses desiderata non honorés' : 'Tous ses desiderata sont honorés'}
            >
              {ini}
            </button>
          )
        })}
      </div>

      {selection ? detail(selection) : null}
    </div>
  )
}
