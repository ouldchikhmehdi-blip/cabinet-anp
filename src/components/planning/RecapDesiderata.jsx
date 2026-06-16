import { useMemo } from 'react'
import { listerSemaines, listerWeekends, parseISO, formatDateLongueFR } from '../../utils/calendrier'
import { labelSousSemaine } from '../../utils/desiderata'

const styles = {
  titre: { fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12 },
  section: { marginBottom: 10 },
  cle: { fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 },
  valeur: { fontSize: 13, color: 'var(--color-text)' },
  vide: { fontSize: 13, color: 'var(--color-text-tertiary)' },
}

function Ligne({ titre, children, vide }) {
  return (
    <div style={styles.section}>
      <div style={styles.cle}>{titre}</div>
      {vide ? <div style={styles.vide}>—</div> : <div style={styles.valeur}>{children}</div>}
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
export default function RecapDesiderata({ initiales, d, annee, estEte = false }) {
  const labelSemaine = useMemo(() => {
    const map = {}
    for (const s of listerSemaines(annee)) map[s.num] = s.label
    return map
  }, [annee])

  const labelWeekend = useMemo(() => {
    const map = {}
    for (const w of listerWeekends(annee)) map[w.num] = w.label
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

      <Ligne titre="Vacances souhaitées" vide={d.vacancesSouhaitees.length === 0}>
        {d.vacancesSouhaitees.map(n => labelSemaine[n] ?? `S${n}`).join(' · ')}
      </Ligne>

      <Ligne titre="Vacances refusées" vide={d.vacancesRefusees.length === 0}>
        {d.vacancesRefusees.map(n => labelSemaine[n] ?? `S${n}`).join(' · ')}
      </Ligne>

      {!estEte && (
        <Ligne titre="Jours off souhaités" vide={d.joursOffSouhaites.length === 0}>
          {d.joursOffSouhaites.map(x => formatDateLongueFR(parseISO(x))).join(' · ')}
        </Ligne>
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
        <Ligne titre="Week-ends indisponibles" vide={d.weekendsIndispo.length === 0}>
          {d.weekendsIndispo.map(n => labelWeekend[n] ?? `S${n}`).join(' · ')}
        </Ligne>
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
