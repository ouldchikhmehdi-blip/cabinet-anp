// ============================================================
// RecapVacancesScolaires — recapitulatif des souhaits de vacances scolaires de
// tous les associes, avec mise en evidence des conflits (>= 3 associes sur la
// meme semaine d'une periode). Affichage seul (lecture seule).
//
// Reutilise par :
//   - PanneauVacances (onglet Vacances), vue « Vacances scolaires » ;
//   - PlanningSuivi (Ouverture du planning), badge « Vacances scolaires ».
//
// Props :
//   desiderataParAssocie : { ini: <data desiderata normalisee> }
//   scolairesSet         : Set(numSemaine ISO)  — semaines de vacances scolaires
// ============================================================
import { useMemo } from 'react'
import { ASSOCIES } from '../../data/associes'
import { labelSousSemaine } from '../../utils/desiderata'
import { prefScolaire, labelToussaint } from '../../utils/vacancesScolaires'

const BLEU = '#2D6CB5' // bleu « scolaire » (coherent avec le tableau des semaines)

export default function RecapVacancesScolaires({ desiderataParAssocie = {}, scolairesSet = new Set() }) {
  // Recap scolaire par associe : { ini: { pref, tous, semaines:[num] } | null }.
  const scolaireParAssocie = useMemo(() => {
    const m = {}
    for (const ini of ASSOCIES) {
      const d = desiderataParAssocie[ini]
      if (!d) { m[ini] = null; continue }
      const pref = prefScolaire(d)
      const tous = labelToussaint(d)
      const semaines = (d.vacancesSouhaitees ?? []).filter(n => scolairesSet.has(n)).sort((a, b) => a - b)
      m[ini] = (pref || tous || semaines.length) ? { pref, tous, semaines } : null
    }
    return m
  }, [desiderataParAssocie, scolairesSet])

  // Détection des conflits : ≥ 3 associés sur la MÊME semaine (s1/s2) d'une période scolaire.
  // « Peu importe » (indifferent) / null ne comptent pas (l'associé peut basculer sur l'autre semaine).
  const { conflits, inisEnConflit } = useMemo(() => {
    const PERIODES = { paques: 'Pâques', fevrier: 'Février', toussaint: 'Toussaint' }
    const compteur = {} // 'periode|sem' → [inis]
    const ajouter = (periode, sem, ini) => {
      if (sem !== 's1' && sem !== 's2') return
      ;(compteur[`${periode}|${sem}`] ??= []).push(ini)
    }
    for (const ini of ASSOCIES) {
      const d = desiderataParAssocie[ini]
      if (!d) continue
      if (d.preferenceVacancesScolaires === 'paques') ajouter('paques', d.prefVacancesSemaine, ini)
      if (d.preferenceVacancesScolaires === 'fevrier') ajouter('fevrier', d.prefVacancesSemaine, ini)
      if (d.toussaintSouhaitee === true) ajouter('toussaint', d.toussaintSemaine, ini)
    }
    const liste = []
    const impliques = new Set()
    for (const [cle, inis] of Object.entries(compteur)) {
      if (inis.length < 3) continue
      const [periode, sem] = cle.split('|')
      liste.push({ periode: PERIODES[periode], semaine: labelSousSemaine(sem), inis })
      for (const i of inis) impliques.add(i)
    }
    return { conflits: liste, inisEnConflit: impliques }
  }, [desiderataParAssocie])

  const s = {
    detail: { marginTop: 14 },
    detailTitre: { fontSize: 13, fontWeight: 700, color: BLEU, marginBottom: 10 },
    ligneAssocie: (conflit) => ({
      display: 'flex', gap: 8, alignItems: 'baseline', padding: '5px 8px',
      borderBottom: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      background: conflit ? 'var(--color-danger-light)' : 'transparent',
    }),
    iniGras: { fontSize: 13, fontWeight: 700, color: 'var(--color-text)', minWidth: 42 },
    detailsScol: { fontSize: 12, color: 'var(--color-text-secondary)' },
    attenue: { fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic' },
    conflitBox: {
      background: 'var(--color-danger-light)', border: '0.5px solid var(--color-danger)',
      borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: 12,
    },
    conflitTitre: { fontSize: 13, fontWeight: 700, color: 'var(--color-danger)', marginBottom: 6 },
    conflitLigne: { fontSize: 12, color: 'var(--color-danger)', marginBottom: 2 },
  }

  return (
    <div style={s.detail}>
      <div style={s.detailTitre}>📚 Vacances scolaires — souhaits des associés</div>

      {conflits.length > 0 && (
        <div style={s.conflitBox}>
          <div style={s.conflitTitre}>⚠ Conflits de vacances scolaires (3 demandes ou plus sur la même semaine)</div>
          {conflits.map((c, i) => (
            <div key={i} style={s.conflitLigne}>
              <strong>{c.periode} · {c.semaine}</strong> — {c.inis.length} demandes : {c.inis.join(', ')}
            </div>
          ))}
        </div>
      )}

      {ASSOCIES.map(ini => {
        const r = scolaireParAssocie[ini]
        const parts = r ? [r.pref, r.tous, r.semaines.length ? r.semaines.map(n => `S${n}`).join(', ') : null].filter(Boolean) : []
        const enConflit = inisEnConflit.has(ini)
        return (
          <div key={ini} style={s.ligneAssocie(enConflit)}>
            <span style={s.iniGras}>{enConflit && '⚠ '}{ini}</span>
            {parts.length
              ? <span style={s.detailsScol}>{parts.join(' · ')}</span>
              : <span style={s.attenue}>rien de précisé</span>}
          </div>
        )
      })}
    </div>
  )
}
