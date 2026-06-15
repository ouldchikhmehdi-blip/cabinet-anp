import { useMemo } from 'react'
import { listerSemaines, listerWeekends, parseISO, formatDateLongueFR } from '../../utils/calendrier'

const LIBELLE_WE = {
  'dispo': 'Disponible',
  'indispo': 'Pas disponible',
  'garde-ok': 'Garde OK',
  'astreinte-ok': 'Astreinte OK',
}

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
 */
export default function RecapDesiderata({ initiales, d, annee }) {
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

  const prefVac = d.preferenceVacancesScolaires === 'paques'
    ? 'Pâques'
    : d.preferenceVacancesScolaires === 'fevrier'
      ? 'Février'
      : null

  const toussaint = d.toussaintSouhaitee === true
    ? 'Souhaitée'
    : d.toussaintSouhaitee === false
      ? 'Non souhaitée'
      : null

  const weekendsRenseignes = Object.entries(d.weekends)

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

      <Ligne titre="Jours off souhaités" vide={d.joursOffSouhaites.length === 0}>
        {d.joursOffSouhaites.map(x => formatDateLongueFR(parseISO(x))).join(' · ')}
      </Ligne>

      <Ligne titre="Jours où ne pas poser le repos" vide={d.joursReposInterdits.length === 0}>
        {d.joursReposInterdits.map(x => formatDateLongueFR(parseISO(x))).join(' · ')}
      </Ligne>

      <Ligne titre="Préférence vacances scolaires" vide={!prefVac}>
        {prefVac}
      </Ligne>

      <Ligne titre="Toussaint" vide={!toussaint}>
        {toussaint}
      </Ligne>

      <Ligne titre="Week-ends" vide={weekendsRenseignes.length === 0}>
        {weekendsRenseignes
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([num, statut]) => `${labelWeekend[num] ?? `S${num}`} : ${LIBELLE_WE[statut] ?? statut}`)
          .join(' · ')}
      </Ligne>

      <Ligne titre="Demande de colonne (semaine type)" vide={!d.demandeColonneSemaineType.trim()}>
        {d.demandeColonneSemaineType}
      </Ligne>

      <Ligne titre="Commentaire" vide={!d.commentaire.trim()}>
        {d.commentaire}
      </Ligne>
    </div>
  )
}
