// ============================================================
// PanneauVacances — recapitulatif visuel des souhaits de conges saisis par
// les associes (onglet Vacances). Affichage replie : une rangee de badges.
//
//  - 8 badges associes : au clic, ses semaines de conge demandees HORS vacances
//    scolaires (les souhaits sans rapport avec les vacances scolaires).
//  - 1 badge « Vacances scolaires » distinct (bleu) : au clic, l'integralite des
//    associes et ce qu'ils ont demande cote vacances scolaires (preference
//    Paques/Fevrier + 1re/2e semaine, Toussaint, semaines scolaires souhaitees).
//
// Props :
//   desiderataParAssocie : { ini: <data desiderata normalisee> }
//   scolairesSet         : Set(numSemaine ISO)  — semaines de vacances scolaires
//   annee                : number               — pour libeller les semaines
// ============================================================
import { useMemo, useState } from 'react'
import { ASSOCIES } from '../../data/associes'
import { listerSemaines } from '../../utils/calendrier'
import { labelSousSemaine } from '../../utils/desiderata'

const BLEU = '#2D6CB5' // bleu « scolaire » (coherent avec le tableau des semaines)
const CLE_SCOLAIRE = '__scolaires__'

// Libelle de la preference vacances scolaires d'un associe, ou null.
function prefScolaire(d) {
  const nom = d.preferenceVacancesScolaires === 'paques' ? 'Pâques'
    : d.preferenceVacancesScolaires === 'fevrier' ? 'Février'
      : null
  if (!nom) return null
  const sous = labelSousSemaine(d.prefVacancesSemaine)
  return sous ? `${nom} (${sous})` : nom
}

// Libelle Toussaint d'un associe, ou null.
function labelToussaint(d) {
  if (d.toussaintSouhaitee === true) {
    const sous = labelSousSemaine(d.toussaintSemaine)
    return sous ? `Toussaint souhaitée (${sous})` : 'Toussaint souhaitée'
  }
  if (d.toussaintSouhaitee === false) return 'Toussaint non souhaitée'
  return null
}

export default function PanneauVacances({ desiderataParAssocie = {}, scolairesSet = new Set(), annee }) {
  const [selection, setSelection] = useState(null) // initiale, CLE_SCOLAIRE, ou null

  const labelSemaine = useMemo(() => {
    const m = {}
    if (annee != null) for (const s of listerSemaines(annee)) m[s.num] = s.label
    return m
  }, [annee])

  // Souhaits hors scolaires par associe : { ini: [numSemaine trie] }.
  const horsScolParAssocie = useMemo(() => {
    const m = {}
    for (const ini of ASSOCIES) {
      const souh = desiderataParAssocie[ini]?.vacancesSouhaitees ?? []
      m[ini] = souh.filter(n => !scolairesSet.has(n)).sort((a, b) => a - b)
    }
    return m
  }, [desiderataParAssocie, scolairesSet])

  // Recap scolaire par associe : { ini: { pref, toussaint, semaines:[labels] } | null }.
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

  const aSouhaitScolaire = ASSOCIES.some(ini => scolaireParAssocie[ini])

  const s = {
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 24,
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
    badgeScol: (actif, dispo) => ({
      padding: '5px 12px', fontSize: 13, fontWeight: 600, borderRadius: 999,
      cursor: dispo ? 'pointer' : 'default',
      border: `0.5px solid ${BLEU}`,
      background: actif ? BLEU : 'transparent',
      color: actif ? '#fff' : BLEU,
      opacity: dispo ? 1 : 0.45,
    }),
    detail: { marginTop: 14 },
    detailTitre: { fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 10 },
    chips: { display: 'flex', gap: 6, flexWrap: 'wrap' },
    chip: {
      fontSize: 12, fontWeight: 500, padding: '4px 9px', borderRadius: 'var(--radius-md)',
      background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)',
      border: '0.5px solid var(--color-primary)',
    },
    vide: { fontSize: 13, color: 'var(--color-text-secondary)' },
    ligneAssocie: { display: 'flex', gap: 8, alignItems: 'baseline', padding: '5px 0', borderBottom: '0.5px solid var(--color-border)' },
    iniGras: { fontSize: 13, fontWeight: 700, color: 'var(--color-text)', minWidth: 42 },
    detailsScol: { fontSize: 12, color: 'var(--color-text-secondary)' },
    attenue: { fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic' },
  }

  const detailAssocie = (ini) => {
    const weeks = horsScolParAssocie[ini] ?? []
    return (
      <div style={s.detail}>
        <div style={s.detailTitre}>{ini} — Congés hors vacances scolaires</div>
        {weeks.length === 0 ? (
          <div style={s.vide}>Aucun congé hors vacances scolaires demandé.</div>
        ) : (
          <div style={s.chips}>
            {weeks.map(n => <span key={n} style={s.chip}>{labelSemaine[n] ?? `S${n}`}</span>)}
          </div>
        )}
      </div>
    )
  }

  const detailScolaire = () => (
    <div style={s.detail}>
      <div style={{ ...s.detailTitre, color: BLEU }}>📚 Vacances scolaires — souhaits des associés</div>
      {ASSOCIES.map(ini => {
        const r = scolaireParAssocie[ini]
        const parts = r ? [r.pref, r.tous, r.semaines.length ? r.semaines.map(n => `S${n}`).join(', ') : null].filter(Boolean) : []
        return (
          <div key={ini} style={s.ligneAssocie}>
            <span style={s.iniGras}>{ini}</span>
            {parts.length
              ? <span style={s.detailsScol}>{parts.join(' · ')}</span>
              : <span style={s.attenue}>rien de précisé</span>}
          </div>
        )
      })}
    </div>
  )

  return (
    <div style={s.carte} className="no-print">
      <div style={s.titre}>🏖️ Souhaits de congés — par associé</div>
      <div style={s.note}>
        Cliquez sur un associé pour voir ses semaines de congé demandées hors vacances scolaires, ou sur
        « Vacances scolaires » pour le récapitulatif scolaire de tous les associés.
      </div>

      <div style={s.badges}>
        {ASSOCIES.map(ini => {
          const dispo = (horsScolParAssocie[ini]?.length ?? 0) > 0
          const actif = selection === ini
          return (
            <button
              key={ini}
              type="button"
              disabled={!dispo}
              onClick={() => setSelection(o => (o === ini ? null : ini))}
              style={s.badge(actif, dispo)}
              title={dispo ? 'Voir ses congés hors vacances scolaires' : 'Aucun congé hors vacances scolaires'}
            >
              {ini}
            </button>
          )
        })}
        <button
          type="button"
          disabled={!aSouhaitScolaire}
          onClick={() => setSelection(o => (o === CLE_SCOLAIRE ? null : CLE_SCOLAIRE))}
          style={s.badgeScol(selection === CLE_SCOLAIRE, aSouhaitScolaire)}
          title={aSouhaitScolaire ? 'Voir les souhaits de vacances scolaires de tous les associés' : 'Aucun souhait de vacances scolaires'}
        >
          📚 Vacances scolaires
        </button>
      </div>

      {selection === CLE_SCOLAIRE ? detailScolaire() : selection ? detailAssocie(selection) : null}
    </div>
  )
}
