import { useMemo } from 'react'
import { listerSemaines, listerWeekends, parseISO, formatDateLongueFR, moisAnneeFR } from '../../utils/calendrier'
import { labelSousSemaine } from '../../utils/desiderata'
import { cleEcart, cleEcartWeekend } from '../../utils/ponts'

const styles = {
  titre: { fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12 },
  section: { marginBottom: 10 },
  cle: { fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 },
  valeur: { fontSize: 13, color: 'var(--color-text)' },
  vide: { fontSize: 13, color: 'var(--color-text-tertiary)' },
  moisLigne: { fontSize: 13, color: 'var(--color-text)', marginBottom: 2 },
  moisNom: { fontWeight: 600 },
  // Encart « ponts » mis en valeur — bordure + fond ambre, conservés à l'impression.
  pontsBloc: {
    marginBottom: 12, padding: '8px 10px',
    background: 'var(--color-amber-light)', borderLeft: '3px solid var(--color-amber)',
    borderRadius: 'var(--radius-md)',
    WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
  },
  pontsTitre: { fontSize: 12, fontWeight: 600, color: 'var(--color-amber)', marginBottom: 4 },
  pontItem: { fontSize: 12, color: 'var(--color-text)', marginBottom: 2 },
}

function Ligne({ titre, children, vide }) {
  return (
    <div style={styles.section}>
      <div style={styles.cle}>{titre}</div>
      {vide ? <div style={styles.vide}>—</div> : <div style={styles.valeur}>{children}</div>}
    </div>
  )
}

// Section regroupant des éléments par mois : une sous-ligne « Mars 2026 : … » par
// mois, triée chronologiquement ; les mois sans élément ne s'affichent pas.
// items : [{ label: string, date: Date }] (date = repère pour le tri/regroupement).
function SectionMois({ titre, items }) {
  const valides = items.filter(it => it.date instanceof Date && !Number.isNaN(it.date.getTime()))
  if (valides.length === 0) return <Ligne titre={titre} vide />

  const groupes = [] // [{ cle, mois, labels:[] }] dans l'ordre chronologique
  for (const it of [...valides].sort((a, b) => a.date - b.date)) {
    const cle = `${it.date.getUTCFullYear()}-${it.date.getUTCMonth()}`
    let g = groupes.find(x => x.cle === cle)
    if (!g) { g = { cle, mois: moisAnneeFR(it.date), labels: [] }; groupes.push(g) }
    g.labels.push(it.label)
  }

  return (
    <div style={styles.section}>
      <div style={styles.cle}>{titre}</div>
      {groupes.map(g => (
        <div key={g.cle} style={styles.moisLigne}>
          <span style={styles.moisNom}>{g.mois} :</span> {g.labels.join(' · ')}
        </div>
      ))}
    </div>
  )
}

/**
 * RecapDesiderata — restitution lisible des desiderata d'un associé.
 * Composant pur : utilisé dans le panneau du suivi ET dans la vue imprimable.
 *
 * Props :
 *   initiales — string
 *   d         — objet desiderata
 *   annee     — number (pour libeller semaines / week-ends)
 *   estEte    — bool : recueil d'été (masque jours off et week-ends, sans objet l'été)
 */
export default function RecapDesiderata({ initiales, d, annee, estEte = false, ponts = [], pontsWeekend = [], ecartesSet = new Set() }) {
  // num → { label, date } : la date (lundi / samedi) sert au regroupement par mois.
  const semaineInfo = useMemo(() => {
    const map = {}
    for (const s of listerSemaines(annee)) map[s.num] = { label: s.label, date: s.lundi }
    return map
  }, [annee])
  const labelSemaine = useMemo(() => {
    const map = {}
    for (const num in semaineInfo) map[num] = semaineInfo[num].label
    return map
  }, [semaineInfo])

  const weekendInfo = useMemo(() => {
    const map = {}
    for (const w of listerWeekends(annee)) map[w.num] = { label: w.label, date: w.samedi }
    return map
  }, [annee])

  const nomVac = d.preferenceVacancesScolaires === 'paques'
    ? 'Pâques'
    : d.preferenceVacancesScolaires === 'fevrier'
      ? 'Février'
      : null
  const sousVac = labelSousSemaine(d.prefVacancesSemaine)
  const prefVac = nomVac ? `${nomVac}${sousVac ? ` (${sousVac})` : ''}` : null

  const sousTouss = labelSousSemaine(d.toussaintSemaine)
  const toussaint = d.toussaintSouhaitee === true
    ? `Souhaitée${sousTouss ? ` (${sousTouss})` : ''}`
    : d.toussaintSouhaitee === false
      ? 'Non souhaitée'
      : null

  return (
    <div className="recap-associe">
      <div style={styles.titre}>{initiales}</div>

      {d.rienASignaler && (
        <div style={{ ...styles.valeur, fontWeight: 600, color: 'var(--color-success)', marginBottom: 10 }}>
          Rien à signaler
        </div>
      )}

      {!estEte && (ponts.length > 0 || pontsWeekend.length > 0) && (
        <div className="recap-ponts" style={styles.pontsBloc}>
          <div style={styles.pontsTitre}>🌉 Ponts / jours fériés</div>
          {ponts.map(p => (
            <div key={p.id} style={styles.pontItem}>
              Férié {p.feries.map(f => f.nom).join(', ')} —{' '}
              {p.joursOff
                .map(iso => formatDateLongueFR(parseISO(iso)) + (ecartesSet.has(cleEcart(initiales, iso)) ? ' (écarté)' : ''))
                .join(', ')}
            </div>
          ))}
          {pontsWeekend.map(pw => (
            <div key={`we-${pw.semaine}`} style={styles.pontItem}>
              Week-end S{pw.semaine} accolé au férié {pw.feries.map(f => `${f.nom} (${f.jour})`).join(', ')}
              {ecartesSet.has(cleEcartWeekend(initiales, pw.semaine)) ? ' (écarté)' : ''}
            </div>
          ))}
        </div>
      )}

      <SectionMois
        titre="Vacances souhaitées"
        items={d.vacancesSouhaitees.map(n => ({ label: semaineInfo[n]?.label ?? `S${n}`, date: semaineInfo[n]?.date }))}
      />

      <SectionMois
        titre="Vacances refusées"
        items={d.vacancesRefusees.map(n => ({ label: semaineInfo[n]?.label ?? `S${n}`, date: semaineInfo[n]?.date }))}
      />

      {!estEte && (
        <SectionMois
          titre="Jours off souhaités"
          items={d.joursOffSouhaites.map(x => { const dt = parseISO(x); return { label: formatDateLongueFR(dt), date: dt } })}
        />
      )}

      <Ligne titre="Préférence vacances scolaires" vide={!prefVac}>
        {prefVac}
      </Ligne>

      <Ligne titre="Toussaint" vide={!toussaint}>
        {toussaint}
      </Ligne>

      {!estEte && (
        <Ligne titre="Fêtes de fin d'année" vide={!(d.noel ?? '').trim()}>
          {d.noel}
        </Ligne>
      )}

      {!estEte && (
        <SectionMois
          titre="Week-ends indisponibles"
          items={d.weekendsIndispo.map(n => ({ label: weekendInfo[n]?.label ?? `S${n}`, date: weekendInfo[n]?.date }))}
        />
      )}

      {!estEte && (
        <Ligne titre="Souhaits de colonne (trame principale)" vide={Object.keys(d.colonnesSouhaitees ?? {}).length === 0}>
          {Object.entries(d.colonnesSouhaitees ?? {})
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([sem, col]) => `${labelSemaine[Number(sem)] ?? `S${sem}`} → C${Number(col) + 1}`)
            .join(' · ')}
        </Ligne>
      )}

      <Ligne titre="Commentaire" vide={!d.commentaire.trim()}>
        {d.commentaire}
      </Ligne>
    </div>
  )
}
