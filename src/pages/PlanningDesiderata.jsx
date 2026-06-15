import { useState, useEffect, useMemo } from 'react'
import { charger, sauver } from '../utils/stockage'
import {
  chargerAnnee, sauverAnnee, CLE_MOI, CLE_ANNEE, ANNEE_DEFAUT,
} from '../utils/desiderata'
import { ASSOCIES } from '../data/associes'
import { listerSemaines, listerWeekends, VACANCES_SCOLAIRES_2026 } from '../utils/calendrier'
import IdentiteAnnee from '../components/planning/IdentiteAnnee'
import SelecteurSemaines from '../components/planning/SelecteurSemaines'
import SelecteurDates from '../components/planning/SelecteurDates'
import ToggleWeekends from '../components/planning/ToggleWeekends'

export default function PlanningDesiderata() {
  const [moi, setMoi] = useState(() => {
    const m = charger(CLE_MOI, ASSOCIES[0])
    return ASSOCIES.includes(m) ? m : ASSOCIES[0]
  })
  const [annee, setAnnee] = useState(() => charger(CLE_ANNEE, ANNEE_DEFAUT))
  const [data, setData] = useState(() => chargerAnnee(annee))
  const [flash, setFlash] = useState(null)

  // Persistance immédiate (aucun brouillon perdu). On sauve sous l'année portée par data.
  useEffect(() => { sauverAnnee(data.annee, data) }, [data])
  useEffect(() => { sauver(CLE_MOI, moi) }, [moi])
  useEffect(() => { sauver(CLE_ANNEE, annee) }, [annee])

  const semaines = useMemo(() => listerSemaines(annee), [annee])
  const weekends = useMemo(() => listerWeekends(annee), [annee])

  const d = data.associes[moi]

  function changerAnnee(a) {
    setAnnee(a)
    setData(chargerAnnee(a)) // recharge proprement, évite toute course de sauvegarde
    setFlash(null)
  }

  function maj(champ, valeur) {
    setData(prev => ({
      ...prev,
      associes: { ...prev.associes, [moi]: { ...prev.associes[moi], [champ]: valeur } },
    }))
  }

  function enregistrer() {
    setData(prev => ({
      ...prev,
      associes: {
        ...prev.associes,
        [moi]: { ...prev.associes[moi], soumis: true, majLe: new Date().toISOString() },
      },
    }))
    setFlash('Desiderata enregistrés.')
    setTimeout(() => setFlash(null), 3000)
  }

  // ── Styles ──
  const s = {
    carte: {
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      marginBottom: 16,
    },
    titre: { fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 },
    aide: { fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 14 },
    radioLigne: { display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' },
    radio: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text)', cursor: 'pointer' },
    textarea: {
      width: '100%',
      minHeight: 64,
      padding: '9px 12px',
      fontSize: 13,
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      outline: 'none',
      resize: 'vertical',
    },
    barreBas: {
      position: 'sticky',
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '12px 0',
      background: 'var(--color-bg)',
    },
    boutonEnreg: {
      padding: '10px 20px',
      background: 'var(--color-primary)',
      color: '#fff',
      border: 'none',
      borderRadius: 'var(--radius-md)',
      fontSize: 14,
      fontWeight: 500,
    },
  }

  const desactive = d.rienASignaler
  const grise = desactive ? { opacity: 0.45, pointerEvents: 'none', filter: 'grayscale(0.4)' } : {}

  const vacScol = VACANCES_SCOLAIRES_2026

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Mes desiderata</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        Tous les champs sont facultatifs. Vos saisies sont enregistrées automatiquement.
      </p>

      <IdentiteAnnee moi={moi} onChangeMoi={setMoi} annee={annee} onChangeAnnee={changerAnnee} />

      {/* Rien à signaler */}
      <div style={s.carte}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={d.rienASignaler}
            onChange={e => maj('rienASignaler', e.target.checked)}
            style={{ accentColor: 'var(--color-success)', width: 16, height: 16 }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
            Rien à signaler cette année
          </span>
        </label>
        <div style={{ ...s.aide, marginBottom: 0, marginTop: 6 }}>
          Cochez si vous n'avez aucune demande particulière. Votre statut passera au vert.
        </div>
      </div>

      <div style={grise}>
        {/* Vacances souhaitées */}
        <div style={s.carte}>
          <div style={s.titre}>Vacances souhaitées</div>
          <div style={s.aide}>Cochez les semaines où vous souhaitez être en congé.</div>
          <SelecteurSemaines
            semaines={semaines}
            selection={d.vacancesSouhaitees}
            onChange={v => maj('vacancesSouhaitees', v)}
            surligner={d.vacancesRefusees}
          />
        </div>

        {/* Vacances refusées */}
        <div style={s.carte}>
          <div style={s.titre}>Semaines où je ne veux surtout PAS de vacances</div>
          <div style={s.aide}>Contrainte négative. Les semaines déjà souhaitées sont signalées en orange.</div>
          <SelecteurSemaines
            semaines={semaines}
            selection={d.vacancesRefusees}
            onChange={v => maj('vacancesRefusees', v)}
            accent="danger"
            surligner={d.vacancesSouhaitees}
          />
        </div>

        {/* Jours off souhaités */}
        <div style={s.carte}>
          <div style={s.titre}>Jours off souhaités</div>
          <div style={s.aide}>Ajoutez les journées précises où vous souhaitez ne pas travailler.</div>
          <SelecteurDates
            dates={d.joursOffSouhaites}
            onChange={v => maj('joursOffSouhaites', v)}
            annee={annee}
          />
        </div>

        {/* Jours repos interdits */}
        <div style={s.carte}>
          <div style={s.titre}>Jours où je ne veux pas poser mon repos</div>
          <div style={s.aide}>Journées où vous préférez ne pas avoir votre repos de lendemain de garde/astreinte.</div>
          <SelecteurDates
            dates={d.joursReposInterdits}
            onChange={v => maj('joursReposInterdits', v)}
            annee={annee}
            accent="danger"
          />
        </div>

        {/* Préférence vacances scolaires */}
        <div style={s.carte}>
          <div style={s.titre}>Préférence vacances scolaires : Pâques ou Février</div>
          <div style={s.aide}>
            On ne peut pas avoir les deux — choisissez l'une ou l'autre.
            {vacScol.aConfirmer && ' (dates indicatives, à confirmer)'}
          </div>
          <div style={s.radioLigne}>
            {[
              { val: 'fevrier', lib: vacScol.fevrier.label },
              { val: 'paques', lib: vacScol.paques.label },
              { val: null, lib: 'Sans préférence' },
            ].map(opt => (
              <label key={String(opt.val)} style={s.radio}>
                <input
                  type="radio"
                  name="pref-vac"
                  checked={d.preferenceVacancesScolaires === opt.val}
                  onChange={() => maj('preferenceVacancesScolaires', opt.val)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                {opt.lib}
              </label>
            ))}
          </div>

          <div style={{ ...s.titre, marginTop: 18 }}>Toussaint</div>
          <div style={s.aide}>Conditionnel selon les remplaçants trouvés.</div>
          <div style={s.radioLigne}>
            {[
              { val: true, lib: 'Souhaitée' },
              { val: false, lib: 'Non souhaitée' },
              { val: null, lib: 'Non renseigné' },
            ].map(opt => (
              <label key={String(opt.val)} style={s.radio}>
                <input
                  type="radio"
                  name="toussaint"
                  checked={d.toussaintSouhaitee === opt.val}
                  onChange={() => maj('toussaintSouhaitee', opt.val)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                {opt.lib}
              </label>
            ))}
          </div>
        </div>

        {/* Week-ends */}
        <div style={s.carte}>
          <div style={s.titre}>Disponibilité par week-end</div>
          <div style={s.aide}>Indiquez vos disponibilités (garde / astreinte) pour les week-ends qui vous concernent. Laissez « — » sinon.</div>
          <ToggleWeekends
            weekends={weekends}
            valeurs={d.weekends}
            onChange={v => maj('weekends', v)}
          />
        </div>

        {/* Demande de colonne */}
        <div style={s.carte}>
          <div style={s.titre}>Demande de colonne (semaine type)</div>
          <div style={s.aide}>Optionnel — ex. un poste-type précis que vous souhaitez sur certaines semaines.</div>
          <textarea
            style={s.textarea}
            value={d.demandeColonneSemaineType}
            onChange={e => maj('demandeColonneSemaineType', e.target.value)}
            placeholder="Ex. : colonne Réa la semaine de…"
          />
        </div>

        {/* Commentaire libre */}
        <div style={s.carte}>
          <div style={s.titre}>Commentaire libre</div>
          <textarea
            style={s.textarea}
            value={d.commentaire}
            onChange={e => maj('commentaire', e.target.value)}
            placeholder="Toute autre précision utile au faiseur de planning…"
          />
        </div>
      </div>

      {/* Barre d'enregistrement */}
      <div style={s.barreBas}>
        <button type="button" onClick={enregistrer} style={s.boutonEnreg}>
          Enregistrer
        </button>
        {flash && <span style={{ fontSize: 13, color: 'var(--color-success)' }}>{flash}</span>}
        {d.majLe && !flash && (
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Dernier enregistrement : {new Date(d.majLe).toLocaleString('fr-FR')}
          </span>
        )}
      </div>
    </div>
  )
}
