import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { semainesDansPlage, weekendsDansPlage, bornesPlage, VACANCES_SCOLAIRES_2026 } from '../utils/calendrier'
import { desiderataVide, ANNEE_DEFAUT, SOUS_SEMAINES } from '../utils/desiderata'
import { chargerMesDesiderata, sauverMesDesiderata, listerRecueils } from '../utils/desiderataApi'
import SelecteurRecueil from '../components/planning/SelecteurRecueil'
import SelecteurSemaines from '../components/planning/SelecteurSemaines'
import SelecteurDates from '../components/planning/SelecteurDates'
import WeekendsIndispo from '../components/planning/WeekendsIndispo'
import RecapDesiderata from '../components/planning/RecapDesiderata'
import InfoPlanning from '../components/planning/InfoPlanning'

// Sélecteur de sous-semaine de vacances (1ʳᵉ / 2ᵉ / peu importe).
function SousSemaine({ nom, valeur, onChange }) {
  const st = {
    bloc: { marginTop: 10, paddingLeft: 14, borderLeft: '2px solid var(--color-primary-light)' },
    aide: { fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8 },
    ligne: { display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' },
    radio: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text)', cursor: 'pointer' },
  }
  return (
    <div style={st.bloc}>
      <div style={st.aide}>Quelle semaine ?</div>
      <div style={st.ligne}>
        {SOUS_SEMAINES.map(opt => (
          <label key={opt.val} style={st.radio}>
            <input
              type="radio"
              name={nom}
              checked={valeur === opt.val}
              onChange={() => onChange(opt.val)}
              style={{ accentColor: 'var(--color-primary)' }}
            />
            {opt.lib}
          </label>
        ))}
      </div>
    </div>
  )
}

export default function PlanningDesiderata() {
  const { session, profile } = useAuth()
  const initiales = profile?.initiales ?? null

  const [annee, setAnnee] = useState(ANNEE_DEFAUT)
  const [recueils, setRecueils] = useState([])
  const [recueilId, setRecueilId] = useState(null)
  const [data, setData] = useState(desiderataVide())
  const [soumis, setSoumis] = useState(false)
  const [majLe, setMajLe] = useState(null)
  const [edition, setEdition] = useState(false)
  const [chargement, setChargement] = useState(false)
  const [flash, setFlash] = useState(null)
  const [erreur, setErreur] = useState(null)

  const recueil = useMemo(() => recueils.find(r => r.id === recueilId) ?? null, [recueils, recueilId])
  const ferme = recueil?.statut === 'ferme'

  // Charge les recueils de l'année (ouverts ET fermés ; les fermés sont en lecture seule)
  useEffect(() => {
    let annule = false
    listerRecueils(annee)
      .then(rs => {
        if (annule) return
        setRecueils(rs)
        setRecueilId(prev => (rs.some(r => r.id === prev) ? prev : (rs[0]?.id ?? null)))
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger les recueils.') })
    return () => { annule = true }
  }, [annee])

  // Charge les desiderata pour le recueil sélectionné
  useEffect(() => {
    if (!recueilId || !session) return
    let annule = false
    async function charger() {
      setChargement(true)
      try {
        const r = await chargerMesDesiderata(session.user.id, recueilId)
        if (annule) return
        setData(r.data); setSoumis(r.soumis); setMajLe(r.updatedAt)
        // Verrouillé si déjà transmis ; édition si jamais soumis et recueil ouvert.
        const rec = recueils.find(x => x.id === recueilId)
        setEdition(!r.soumis && rec?.statut !== 'ferme')
      } catch {
        if (!annule) setErreur('Impossible de charger vos desiderata.')
      } finally {
        if (!annule) setChargement(false)
      }
    }
    charger()
    return () => { annule = true }
  }, [recueilId, session, recueils])

  const semaines = useMemo(
    () => (recueil ? semainesDansPlage(annee, recueil.semaine_debut, recueil.semaine_fin) : []),
    [annee, recueil]
  )
  const weekends = useMemo(
    () => (recueil ? weekendsDansPlage(annee, recueil.semaine_debut, recueil.semaine_fin) : []),
    [annee, recueil]
  )
  const bornes = useMemo(
    () => (recueil ? bornesPlage(annee, recueil.semaine_debut, recueil.semaine_fin) : null),
    [annee, recueil]
  )

  function maj(champ, valeur) {
    setData(prev => ({ ...prev, [champ]: valeur }))
  }

  async function enregistrer() {
    setErreur(null)
    try {
      await sauverMesDesiderata(session.user.id, recueilId, data, true)
      setSoumis(true)
      setMajLe(new Date().toISOString())
      setEdition(false)
      setFlash('Desiderata enregistrés.')
      setTimeout(() => setFlash(null), 3000)
    } catch {
      setErreur('Échec de l\'enregistrement. Réessayez.')
    }
  }

  // ── Styles ──
  const s = {
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '18px 20px', marginBottom: 16,
    },
    titre: { fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 },
    aide: { fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 14 },
    radioLigne: { display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' },
    radio: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text)', cursor: 'pointer' },
    textarea: {
      width: '100%', minHeight: 64, padding: '9px 12px', fontSize: 13,
      border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', resize: 'vertical',
    },
    barreBas: {
      position: 'sticky', bottom: 0, display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 0', background: 'var(--color-bg)',
    },
    bouton: {
      padding: '10px 20px', background: 'var(--color-primary)', color: '#fff', border: 'none',
      borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500,
    },
    info: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '24px', fontSize: 14, color: 'var(--color-text-secondary)',
    },
    banniere: (couleur, fond) => ({
      fontSize: 13, color: couleur, background: fond,
      borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 16,
    }),
  }

  // ── Cas particuliers ──
  if (!profile) {
    return <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Chargement…</div>
  }
  if (!initiales) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Mes desiderata</h1>
        <div style={s.info}>
          Votre compte n'est pas encore relié à un associé. Contactez le faiseur de planning
          pour qu'il vous attribue vos initiales.
        </div>
      </div>
    )
  }

  const desactive = data.rienASignaler
  const grise = desactive ? { opacity: 0.45, pointerEvents: 'none', filter: 'grayscale(0.4)' } : {}
  const vacScol = VACANCES_SCOLAIRES_2026
  const prefVac = data.preferenceVacancesScolaires

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Mes desiderata</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        Tous les champs sont facultatifs. Vos desiderata sont privés : seul le faiseur de planning peut les consulter.
      </p>

      <InfoPlanning />

      <SelecteurRecueil
        initiales={initiales}
        annee={annee}
        onChangeAnnee={setAnnee}
        recueilId={recueilId}
        onChangeRecueil={setRecueilId}
        recueils={recueils}
      />

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          {erreur}
        </div>
      )}

      {!recueilId ? (
        <div style={s.info}>
          Aucun recueil de desiderata pour {annee}. Le faiseur de planning ouvrira
          une période quand il sera prêt à recueillir vos souhaits.
        </div>
      ) : chargement ? (
        <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Chargement…</div>
      ) : !edition ? (
        // ── Vue verrouillée (lecture seule) ──
        <>
          {ferme ? (
            <div style={s.banniere('var(--color-text-secondary)', 'var(--color-bg)')}>
              Ce recueil est <strong>fermé</strong> par le faiseur de planning — modification impossible.
            </div>
          ) : soumis ? (
            <div style={s.banniere('var(--color-success)', 'var(--color-success-light)')}>
              Desiderata transmis{majLe ? ` le ${new Date(majLe).toLocaleString('fr-FR')}` : ''}.
            </div>
          ) : null}

          <div style={{ ...s.carte }}>
            <RecapDesiderata initiales={initiales} d={data} annee={annee} />
          </div>

          {!ferme && (
            <div style={s.barreBas}>
              <button type="button" onClick={() => setEdition(true)} style={s.bouton}>Modifier</button>
              {flash && <span style={{ fontSize: 13, color: 'var(--color-success)' }}>{flash}</span>}
            </div>
          )}
        </>
      ) : (
        // ── Mode édition ──
        <>
          {/* Rien à signaler */}
          <div style={s.carte}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.rienASignaler}
                onChange={e => maj('rienASignaler', e.target.checked)}
                style={{ accentColor: 'var(--color-success)', width: 16, height: 16 }}
              />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
                Rien à signaler pour ce recueil
              </span>
            </label>
            <div style={{ ...s.aide, marginBottom: 0, marginTop: 6 }}>
              Cochez si vous n'avez aucune demande. Votre statut passera au vert.
            </div>
          </div>

          <div style={grise}>
            {/* Vacances souhaitées */}
            <div style={s.carte}>
              <div style={s.titre}>Vacances souhaitées</div>
              <div style={s.aide}>Cochez les semaines où vous souhaitez être en congé.</div>
              <SelecteurSemaines
                semaines={semaines}
                selection={data.vacancesSouhaitees}
                onChange={v => maj('vacancesSouhaitees', v)}
                desactivees={data.vacancesRefusees}
              />
            </div>

            {/* Vacances refusées */}
            <div style={s.carte}>
              <div style={s.titre}>Semaines où je ne veux surtout PAS de vacances</div>
              <div style={s.aide}>Contrainte négative. Les semaines déjà souhaitées ne sont pas sélectionnables ici.</div>
              <SelecteurSemaines
                semaines={semaines}
                selection={data.vacancesRefusees}
                onChange={v => maj('vacancesRefusees', v)}
                accent="danger"
                desactivees={data.vacancesSouhaitees}
              />
            </div>

            {/* Jours off souhaités */}
            <div style={s.carte}>
              <div style={s.titre}>Jours off souhaités</div>
              <div style={s.aide}>Ajoutez les journées précises où vous souhaitez ne pas travailler.</div>
              <SelecteurDates
                dates={data.joursOffSouhaites}
                onChange={v => maj('joursOffSouhaites', v)}
                annee={annee}
                bornes={bornes}
              />
            </div>

            {/* Préférence vacances scolaires + Toussaint */}
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
                      checked={prefVac === opt.val}
                      onChange={() => {
                        maj('preferenceVacancesScolaires', opt.val)
                        if (opt.val === null) maj('prefVacancesSemaine', null)
                      }}
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    {opt.lib}
                  </label>
                ))}
              </div>
              {(prefVac === 'fevrier' || prefVac === 'paques') && (
                <SousSemaine
                  nom="pref-vac-semaine"
                  valeur={data.prefVacancesSemaine}
                  onChange={v => maj('prefVacancesSemaine', v)}
                />
              )}

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
                      checked={data.toussaintSouhaitee === opt.val}
                      onChange={() => {
                        maj('toussaintSouhaitee', opt.val)
                        if (opt.val !== true) maj('toussaintSemaine', null)
                      }}
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    {opt.lib}
                  </label>
                ))}
              </div>
              {data.toussaintSouhaitee === true && (
                <SousSemaine
                  nom="toussaint-semaine"
                  valeur={data.toussaintSemaine}
                  onChange={v => maj('toussaintSemaine', v)}
                />
              )}
            </div>

            {/* Week-ends indisponibles */}
            <div style={s.carte}>
              <div style={s.titre}>Week-ends indisponibles</div>
              <div style={s.aide}>Cochez les week-ends où vous n'êtes pas disponible.</div>
              <WeekendsIndispo
                weekends={weekends}
                selection={data.weekendsIndispo}
                onChange={v => maj('weekendsIndispo', v)}
              />
            </div>

            {/* Demande de colonne */}
            <div style={s.carte}>
              <div style={s.titre}>Demande de colonne (semaine type)</div>
              <div style={s.aide}>Optionnel — ex. un poste-type précis que vous souhaitez sur certaines semaines.</div>
              <textarea
                style={s.textarea}
                value={data.demandeColonneSemaineType}
                onChange={e => maj('demandeColonneSemaineType', e.target.value)}
                placeholder="Ex. : colonne Réa la semaine de…"
              />
            </div>

            {/* Commentaire libre */}
            <div style={s.carte}>
              <div style={s.titre}>Commentaire libre</div>
              <textarea
                style={s.textarea}
                value={data.commentaire}
                onChange={e => maj('commentaire', e.target.value)}
                placeholder="Toute autre précision utile au faiseur de planning…"
              />
            </div>
          </div>

          {/* Barre d'enregistrement */}
          <div style={s.barreBas}>
            <button type="button" onClick={enregistrer} style={s.bouton}>Enregistrer</button>
            {flash && <span style={{ fontSize: 13, color: 'var(--color-success)' }}>{flash}</span>}
          </div>
        </>
      )}
    </div>
  )
}
