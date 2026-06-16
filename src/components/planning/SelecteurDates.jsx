import { parseISO, formatISO, formatDateLongueFR, moisAnneeFR, joursFeriesFR } from '../../utils/calendrier'

/**
 * SelecteurDates — sélection de dates précises via un calendrier multi-mois.
 *
 * Tous les mois de la plage [min, max] sont affichés empilés ; un clic sur un jour
 * l'ajoute ou le retire immédiatement. Un résumé supprimable suit le calendrier.
 *
 * Les jours de week-end (samedi/dimanche) ne sont PAS sélectionnables comme jours off
 * (conflit avec l'attribution des week-ends). Les jours fériés sont mis en évidence (ambre).
 *
 * Props :
 *   dates     — string[] au format 'YYYY-MM-DD'
 *   onChange  — (nouvellesDates: string[]) => void
 *   annee     — number (borne par défaut si `bornes` absent)
 *   bornes    — { min, max } 'YYYY-MM-DD' (optionnel, ex. bornes de période)
 *   accent    — 'primary' (défaut) | 'danger'
 */
const JOURS_ENTETE = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export default function SelecteurDates({ dates, onChange, annee, bornes = null, accent = 'primary' }) {
  const min = bornes?.min ?? `${annee}-01-01`
  const max = bornes?.max ?? `${annee}-12-31`
  const couleur = accent === 'danger' ? 'var(--color-danger)' : 'var(--color-primary)'
  const couleurFond = accent === 'danger' ? 'var(--color-danger-light)' : 'var(--color-primary-light)'

  const choisies = new Set(dates)

  // Liste des mois { y, m } (m = 1..12) couverts par [min, max].
  const [minY, minM] = min.split('-').map(Number)
  const [maxY, maxM] = max.split('-').map(Number)
  const mois = []
  for (let y = minY, m = minM; y < maxY || (y === maxY && m <= maxM);) {
    mois.push({ y, m })
    m++; if (m > 12) { m = 1; y++ }
  }

  // Jours fériés (nom par date ISO) sur toutes les années couvertes par la plage.
  const feriesParIso = new Map()
  for (let y = minY; y <= maxY; y++) {
    for (const f of joursFeriesFR(y)) feriesParIso.set(f.iso, f.nom)
  }

  function toggle(iso) {
    if (choisies.has(iso)) onChange(dates.filter(x => x !== iso))
    else onChange([...dates, iso].sort())
  }

  function retirer(d) {
    onChange(dates.filter(x => x !== d))
  }

  const s = {
    grilleMois: { display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 },
    mois: { width: 224 },
    titreMois: { fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 },
    grilleJours: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 },
    entete: { fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '2px 0' },
    vide: {},
    jour: (selectionne, horsPlage, weekend, ferie) => ({
      fontSize: 12,
      textAlign: 'center',
      padding: '6px 0',
      borderRadius: 'var(--radius-md)',
      border: `0.5px solid ${selectionne ? couleur : (ferie ? 'var(--color-amber)' : 'transparent')}`,
      background: selectionne ? couleurFond : (ferie ? 'var(--color-amber-light)' : 'transparent'),
      color: horsPlage
        ? 'var(--color-text-tertiary)'
        : (ferie && !selectionne ? 'var(--color-amber)' : (weekend ? 'var(--color-text-tertiary)' : 'var(--color-text)')),
      opacity: horsPlage ? 0.35 : (weekend ? 0.5 : 1),
      cursor: (horsPlage || weekend) ? 'default' : 'pointer',
      fontWeight: selectionne || ferie ? 600 : 400,
      userSelect: 'none',
    }),
    chips: { display: 'flex', gap: 6, flexWrap: 'wrap' },
    chip: {
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', fontSize: 12,
      borderRadius: 999, background: couleurFond, border: `0.5px solid ${couleur}`, color: 'var(--color-text)',
    },
    croix: { background: 'none', border: 'none', color: couleur, fontSize: 14, lineHeight: 1, padding: 0, cursor: 'pointer' },
  }

  return (
    <div>
      <div style={s.grilleMois}>
        {mois.map(({ y, m }) => {
          const premier = new Date(Date.UTC(y, m - 1, 1))
          const decalage = (premier.getUTCDay() + 6) % 7 // lundi = 0
          const nbJours = new Date(Date.UTC(y, m, 0)).getUTCDate()
          return (
            <div key={`${y}-${m}`} style={s.mois}>
              <div style={s.titreMois}>{moisAnneeFR(premier)}</div>
              <div style={s.grilleJours}>
                {JOURS_ENTETE.map((j, i) => <div key={`e${i}`} style={s.entete}>{j}</div>)}
                {Array.from({ length: decalage }, (_, i) => <div key={`v${i}`} style={s.vide} />)}
                {Array.from({ length: nbJours }, (_, i) => {
                  const jour = i + 1
                  const date = new Date(Date.UTC(y, m - 1, jour))
                  const iso = formatISO(date)
                  const horsPlage = iso < min || iso > max
                  const jourSem = date.getUTCDay()
                  const weekend = jourSem === 0 || jourSem === 6
                  const nomFerie = feriesParIso.get(iso) ?? null
                  const selectionne = choisies.has(iso)
                  const title = horsPlage
                    ? 'Hors de la période'
                    : weekend
                      ? 'Week-end — non sélectionnable comme jour off'
                      : nomFerie
                        ? `Férié — ${nomFerie}`
                        : formatDateLongueFR(date)
                  return (
                    <div
                      key={iso}
                      style={s.jour(selectionne, horsPlage, weekend, !!nomFerie)}
                      onClick={(horsPlage || weekend) ? undefined : () => toggle(iso)}
                      title={title}
                    >
                      {jour}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: dates.length ? 12 : 0 }}>
        <span style={{ color: 'var(--color-amber)', fontWeight: 600 }}>■</span> jour férié · les week-ends ne sont pas sélectionnables comme jour off
      </div>

      {dates.length > 0 && (
        <div style={s.chips}>
          {[...dates].sort().map(d => (
            <span key={d} style={s.chip}>
              {formatDateLongueFR(parseISO(d))}
              <button type="button" onClick={() => retirer(d)} style={s.croix} aria-label={`Retirer ${d}`}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
