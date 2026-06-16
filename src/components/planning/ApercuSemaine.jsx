// ============================================================
// ApercuSemaine — prévisualisation FIDÈLE de l'export Excel « En semaine », pour une semaine.
// Rendue à partir de la MÊME logique que le .xlsx (src/utils/grilleSemaine.js) : ce qui s'affiche
// ici part tel quel dans le fichier (texte, couleurs, gardes, vacanciers, réa, remplaçants, fériés).
//
// Grille : jours en lignes (lundi→dimanche), 8 associés en colonnes (ordre fixe), + colonne G/A
// + colonne(s) remplaçant. Un bandeau récapitule la garde du week-end avant et après la semaine.
// ============================================================
import { useMemo } from 'react'
import { ASSOCIES } from '../../data/associes'
import { joursFeriesFR, formatJJMM } from '../../utils/calendrier'
import {
  COULEURS_GRILLE, ctxJour, celluleAssocieJour, celluleRemplacantJour, celluleGroupeJour, celluleDateJour,
} from '../../utils/grilleSemaine'

const JOURS_LABEL = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']

// Largeurs FIXES (px) : chaque associé a la même largeur de haut en bas et d'un associé à l'autre,
// pour qu'on suive une colonne sans décalage (table-layout: fixed + colgroup).
const W_JOUR = 104
const W_ASSOC = 94
const W_GA = 42
const W_REMPL = 122

const fondCss = (fond) => (fond ? '#' + COULEURS_GRILLE[fond] : 'transparent')

const s = {
  wrap: { marginTop: 4 },
  bandeau: {
    fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8,
    display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
  },
  bandeauVal: { color: 'var(--color-text)' },
  table: { borderCollapse: 'collapse', fontSize: 12.5, tableLayout: 'fixed' },
  thJour: {
    padding: '5px 8px', fontSize: 12, fontWeight: 700, color: 'var(--color-text)',
    textAlign: 'left', border: '0.5px solid var(--color-border)', background: '#' + COULEURS_GRILLE.header,
    whiteSpace: 'nowrap',
  },
  th: {
    padding: '5px 6px', fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.8)',
    textAlign: 'center', border: '0.5px solid var(--color-border)', background: '#' + COULEURS_GRILLE.header,
    whiteSpace: 'nowrap',
  },
  tdJour: {
    padding: '5px 8px', fontSize: 12, fontWeight: 600, color: 'var(--color-text)',
    border: '0.5px solid var(--color-border)', whiteSpace: 'nowrap',
  },
  td: {
    padding: '4px 5px', textAlign: 'center', color: 'rgba(0,0,0,0.85)',
    border: '0.5px solid var(--color-border)', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.2,
  },
  ferieNom: { fontSize: 11, fontWeight: 700, color: '#1b5e20', display: 'block' },
  legende: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' },
  pastille: (fond) => ({
    display: 'inline-block', width: 11, height: 11, borderRadius: 2, background: fondCss(fond),
    border: '0.5px solid rgba(0,0,0,0.2)', verticalAlign: 'middle', marginRight: 4,
  }),
}

export default function ApercuSemaine({
  annee, sem, calendrier, affectationsSemaine, weekendAff = {}, reaAff = {},
  congesParSemaine = {}, recupParSemaine = {}, compteurs = null, remplacantsSemaine = {}, compact = false,
}) {
  const feries = useMemo(() => {
    const m = {}
    for (const f of joursFeriesFR(annee)) m[f.iso] = f.nom
    return m
  }, [annee])
  const vacancesScolaires = useMemo(() => new Set(calendrier?.vacancesScolaires ?? []), [calendrier])

  if (!sem || !calendrier) return null

  const remplSem = remplacantsSemaine?.[sem.num] ?? []
  const nbRempl = remplSem.length
  const enteteRempl = Array.from({ length: nbRempl }, (_, k) => (nbRempl > 1 ? `Remplaçant ${k + 1}` : 'Remplaçant'))

  const iniWEapres = weekendAff?.[sem.num] ?? null
  const iniWEavant = weekendAff?.[sem.num - 1] ?? null

  // Une ligne par jour (lundi→dimanche), calculée par la logique partagée.
  const lignes = Array.from({ length: 7 }, (_, offset) => {
    const ctx = ctxJour({
      data: calendrier, sem, offset, feries, vacancesScolaires,
      weekendAff, reaAff, congesParSemaine, affectationsSemaine, recupParSemaine, compteurs,
    })
    return {
      ctx,
      date: celluleDateJour(ctx),
      associes: ASSOCIES.map(a => celluleAssocieJour(a, ctx)),
      groupe: celluleGroupeJour(ctx),
      rempl: Array.from({ length: nbRempl }, (_, k) => celluleRemplacantJour(remplSem[k], ctx)),
      ferieNom: ctx.estFerie ? feries[ctx.iso] : null,
    }
  })

  const cellStyle = (modele) => ({
    ...s.td,
    background: fondCss(modele.fond),
    fontWeight: modele.gras ? 700 : 400,
  })

  const largeurTable = W_JOUR + ASSOCIES.length * W_ASSOC + W_GA + nbRempl * W_REMPL

  return (
    <div style={compact ? { marginTop: 0 } : s.wrap}>
      {!compact && (
        <div style={s.bandeau}>
          <span>🛏️ Garde week-end —</span>
          <span>avant (S{sem.num - 1}) : <span style={s.bandeauVal}>{iniWEavant ?? '—'}</span></span>
          <span>après (S{sem.num}) : <span style={s.bandeauVal}>{iniWEapres ?? '—'}</span></span>
        </div>
      )}
      <table style={{ ...s.table, width: '100%', minWidth: largeurTable }}>
        <colgroup>
          <col style={{ width: W_JOUR }} />
          {ASSOCIES.map((a, i) => <col key={i} style={{ width: W_ASSOC }} />)}
          <col style={{ width: W_GA }} />
          {enteteRempl.map((_, k) => <col key={k} style={{ width: W_REMPL }} />)}
        </colgroup>
        <thead>
          <tr>
            <th style={s.thJour}>Jour</th>
            {ASSOCIES.map(a => <th key={a} style={s.th}>{a}</th>)}
            <th style={s.th}>G/A</th>
            {enteteRempl.map((lbl, k) => <th key={k} style={s.th}>{lbl}</th>)}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, offset) => (
            <tr key={offset}>
              <td style={{ ...s.tdJour, background: fondCss(l.date.fond) }}>
                {JOURS_LABEL[offset]} {formatJJMM(l.ctx.date)}
                {l.ferieNom && <span style={s.ferieNom}>🔴 {l.ferieNom}</span>}
              </td>
              {l.associes.map((c, k) => (
                <td key={k} style={cellStyle(c)}>{c.texte}</td>
              ))}
              <td style={cellStyle(l.groupe)}>{l.groupe.texte}</td>
              {l.rempl.map((c, k) => (
                <td key={k} style={cellStyle(c)}>{c.texte}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!compact && (
        <div style={s.legende}>
          <span><span style={s.pastille('garde')} />Garde</span>
          <span><span style={s.pastille('astreinte')} />Astreinte</span>
          <span><span style={s.pastille('conge')} />Vacances / repos</span>
          <span><span style={s.pastille('ferie')} />Férié / récup JF</span>
          <span><span style={s.pastille('weekend')} />Week-end</span>
        </div>
      )}
    </div>
  )
}
