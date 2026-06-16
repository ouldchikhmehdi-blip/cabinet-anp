import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'
import { semainesDansPlage, weekendsDansPlage, bornesPlage, VACANCES_SCOLAIRES_2026 } from '../utils/calendrier'
import { desiderataVide, ANNEE_DEFAUT, SOUS_SEMAINES, normaliser } from '../utils/desiderata'
import { chargerMesDesiderata, sauverMesDesiderata, listerRecueils } from '../utils/desiderataApi'
import { charger as chargerLocal, sauver as sauverLocal } from '../utils/stockage'
import { definirGardeNavigation } from '../utils/gardeNavigation'
import { chargerCalendrier } from '../utils/calendrierApi'
import { chargerTrames } from '../utils/tramesApi'
import { colonnesSelectionnables } from '../utils/trames'
import SelecteurRecueil from '../components/planning/SelecteurRecueil'
import SelecteurSemaines from '../components/planning/SelecteurSemaines'
import SelecteurDates from '../components/planning/SelecteurDates'
import WeekendsIndispo from '../components/planning/WeekendsIndispo'
import SectionRepliable from '../components/planning/SectionRepliable'
import RecapDesiderata from '../components/planning/RecapDesiderata'
import TrameGrille from '../components/planning/TrameGrille'
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
  const [brouillonActif, setBrouillonActif] = useState(false) // brouillon local non transmis
  const baselineRef = useRef(null)                              // signature JSON des données chargées/transmises
  const [semainesScolaires, setSemainesScolaires] = useState([]) // vacances scolaires (Base calendrier)
  const [tramesData, setTramesData] = useState(null) // catalogue de trames de l'année (pour la principale)
  const [nouvSouhaitSem, setNouvSouhaitSem] = useState('')
  const [nouvSouhaitCol, setNouvSouhaitCol] = useState('')

  const recueil = useMemo(() => recueils.find(r => r.id === recueilId) ?? null, [recueils, recueilId])
  const ferme = recueil?.statut === 'ferme'
  const estEte = recueil?.type === 'ete'

  // Trame principale de l'année (affichée à l'associé pour choisir une colonne par semaine).
  const tramePrincipale = useMemo(
    () => (tramesData ? tramesData.trames.find(t => t.id === tramesData.principaleId) ?? null : null),
    [tramesData]
  )
  const colonnesDispo = useMemo(() => colonnesSelectionnables(tramePrincipale), [tramePrincipale])

  // Charge les semaines de vacances scolaires depuis la Base calendrier de l'année
  // (pour les bloquer dans les grilles : elles se gèrent dans la section Préférence).
  useEffect(() => {
    let annule = false
    chargerCalendrier(annee)
      .then(c => { if (!annule) setSemainesScolaires(c.vacancesScolaires ?? []) })
      .catch(() => { if (!annule) setSemainesScolaires([]) })
    return () => { annule = true }
  }, [annee])

  // Charge le catalogue de trames de l'année (pour récupérer la trame principale, lisible par tous).
  useEffect(() => {
    let annule = false
    chargerTrames(annee)
      .then(t => { if (!annule) setTramesData(t) })
      .catch(() => { if (!annule) setTramesData(null) })
    return () => { annule = true }
  }, [annee])

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
        setSoumis(r.soumis); setMajLe(r.updatedAt)
        baselineRef.current = JSON.stringify(r.data) // référence = données en base
        const rec = recueils.find(x => x.id === recueilId)
        const cle = `desiderata_brouillon_${session.user.id}_${recueilId}`
        // Brouillon local non transmis : on le restaure s'il diffère de la base et que le recueil est ouvert.
        const brouillon = chargerLocal(cle, null)
        const dataBrouillon = brouillon ? normaliser(brouillon) : null
        const restaurable = dataBrouillon && rec?.statut !== 'ferme' && JSON.stringify(dataBrouillon) !== baselineRef.current
        if (restaurable) {
          setData(dataBrouillon); setEdition(true); setBrouillonActif(true)
          setFlash('Brouillon récupéré (non transmis).')
          setTimeout(() => setFlash(null), 4000)
        } else {
          if (dataBrouillon) sauverLocal(cle, null) // brouillon devenu inutile
          setData(r.data); setBrouillonActif(false)
          // Verrouillé si déjà transmis ; édition si jamais soumis et recueil ouvert.
          setEdition(!r.soumis && rec?.statut !== 'ferme')
        }
      } catch {
        if (!annule) setErreur('Impossible de charger vos desiderata.')
      } finally {
        if (!annule) setChargement(false)
      }
    }
    charger()
    return () => { annule = true }
  }, [recueilId, session, recueils])

  // Brouillon auto (local) : écrit dès que `data` diffère des données chargées, en édition seulement.
  useEffect(() => {
    if (!edition || !recueilId || !session) return
    if (baselineRef.current == null || JSON.stringify(data) === baselineRef.current) return
    sauverLocal(`desiderata_brouillon_${session.user.id}_${recueilId}`, data)
    setBrouillonActif(true)
  }, [data, edition, recueilId, session])

  // Avertissement natif si on ferme/rafraîchit l'onglet avec un brouillon non transmis.
  useEffect(() => {
    if (!brouillonActif) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [brouillonActif])

  // Garde de navigation interne (sidebar, déconnexion) : confirme si brouillon non transmis.
  useEffect(() => {
    definirGardeNavigation(() => !brouillonActif || window.confirm(
      'Vos desiderata ne sont pas transmis au faiseur (votre brouillon est gardé sur cet appareil). Quitter cette page quand même ?'
    ))
    return () => definirGardeNavigation(null)
  }, [brouillonActif])

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

  // Souhaits de colonne (trame principale) : { <numSemaine>: <index colonne> }.
  function ajouterSouhaitColonne() {
    if (nouvSouhaitSem === '' || nouvSouhaitCol === '') return
    const sem = Number(nouvSouhaitSem)
    const col = Number(nouvSouhaitCol)
    setData(prev => ({ ...prev, colonnesSouhaitees: { ...(prev.colonnesSouhaitees ?? {}), [sem]: col } }))
    setNouvSouhaitSem(''); setNouvSouhaitCol('')
  }

  function retirerSouhaitColonne(sem) {
    setData(prev => {
      const reste = { ...(prev.colonnesSouhaitees ?? {}) }
      delete reste[sem]
      return { ...prev, colonnesSouhaitees: reste }
    })
  }

  async function enregistrer() {
    setErreur(null)
    try {
      await sauverMesDesiderata(session.user.id, recueilId, data, true)
      // Transmis : on efface le brouillon local et on remet la référence à jour.
      sauverLocal(`desiderata_brouillon_${session.user.id}_${recueilId}`, null)
      baselineRef.current = JSON.stringify(data)
      setBrouillonActif(false)
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
    noteFerie: {
      fontSize: 12, color: 'var(--color-text-secondary)',
      background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber)',
      borderRadius: 'var(--radius-md)', padding: '8px 10px', marginBottom: 14,
    },
    radioLigne: { display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' },
    radio: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text)', cursor: 'pointer' },
    textarea: {
      width: '100%', minHeight: 64, padding: '9px 12px', fontSize: 13,
      border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', resize: 'vertical',
    },
    select: {
      padding: '8px 12px', fontSize: 13, border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
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

  // Une période scolaire n'est proposée que si ses semaines tombent dans le recueil courant.
  const dansPeriode = (sem) => !!recueil && sem.some(w => w >= recueil.semaine_debut && w <= recueil.semaine_fin)
  const voirFevrier = dansPeriode(vacScol.fevrier.semaines)
  const voirPaques = dansPeriode(vacScol.paques.semaines)
  const voirToussaint = dansPeriode(vacScol.toussaint.semaines)
  const voirPrefScol = voirFevrier || voirPaques
  const voirCarteScol = voirPrefScol || voirToussaint
  const optionsPrefScol = [
    ...(voirFevrier ? [{ val: 'fevrier', lib: vacScol.fevrier.label }] : []),
    ...(voirPaques ? [{ val: 'paques', lib: vacScol.paques.label }] : []),
    { val: null, lib: 'Sans préférence' },
  ]
  const titrePrefScol = (voirFevrier && voirPaques)
    ? 'Préférence vacances scolaires : Pâques ou Février'
    : `Préférence vacances scolaires : ${voirPaques ? vacScol.paques.label : vacScol.fevrier.label}`

  // Résumés affichés quand les encarts repliables sont fermés.
  const resumeSemaines = (nums) => (nums?.length ? [...nums].sort((a, b) => a - b).map(n => `S${n}`).join(' · ') : '—')

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
            <RecapDesiderata initiales={initiales} d={data} annee={annee} estEte={estEte} />
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
          {estEte && (
            <div style={s.banniere('var(--color-text-secondary)', 'var(--color-bg)')}>
              <strong>Recueil d'été.</strong> Les congés d'été se répartissent par <strong>choix de colonnes</strong>
              {' '}(maquette fournie chaque année). Les week-ends et les jours off ne se saisissent pas ici.
            </div>
          )}

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
            <SectionRepliable titre="Vacances souhaitées" resume={resumeSemaines(data.vacancesSouhaitees)}>
              <div style={s.aide}>
                Cochez les semaines où vous souhaitez être en congé.
                {semainesScolaires.length > 0 && ' Les semaines de vacances scolaires (en bleu) se gèrent dans « Préférence vacances scolaires » plus bas.'}
              </div>
              <SelecteurSemaines
                semaines={semaines}
                selection={data.vacancesSouhaitees}
                onChange={v => maj('vacancesSouhaitees', v)}
                desactivees={data.vacancesRefusees}
                semainesScolaires={semainesScolaires}
              />
            </SectionRepliable>

            {/* Vacances refusées */}
            <SectionRepliable titre="Semaines où je ne veux surtout PAS de vacances" resume={resumeSemaines(data.vacancesRefusees)}>
              <div style={s.aide}>Contrainte négative. Les semaines déjà souhaitées (et les vacances scolaires) ne sont pas sélectionnables ici.</div>
              <SelecteurSemaines
                semaines={semaines}
                selection={data.vacancesRefusees}
                onChange={v => maj('vacancesRefusees', v)}
                accent="danger"
                desactivees={data.vacancesSouhaitees}
                semainesScolaires={semainesScolaires}
              />
            </SectionRepliable>

            {/* Week-ends indisponibles (sans objet l'été) */}
            {!estEte && (
              <SectionRepliable titre="Week-ends indisponibles" resume={resumeSemaines(data.weekendsIndispo)}>
                <div style={s.aide}>Cochez les week-ends où vous n'êtes pas disponible.</div>
                <div style={s.noteFerie}>
                  🌉 Vos week-ends indisponibles <strong>accolés à un jour férié</strong> (férié un
                  vendredi ou un lundi) sont <strong>surveillés</strong> : ils forment des « ponts »
                  et sont automatiquement <strong>repérés et signalés au faiseur de planning</strong>.
                </div>
                <WeekendsIndispo
                  weekends={weekends}
                  selection={data.weekendsIndispo}
                  onChange={v => maj('weekendsIndispo', v)}
                />
              </SectionRepliable>
            )}

            {/* Jours off souhaités (sans objet l'été) */}
            {!estEte && (
              <SectionRepliable
                titre="Jours off souhaités"
                resume={data.joursOffSouhaites.length ? `${data.joursOffSouhaites.length} jour${data.joursOffSouhaites.length > 1 ? 's' : ''}` : '—'}
              >
                <div style={s.aide}>Ajoutez les journées précises où vous souhaitez ne pas travailler.</div>
                <div style={s.noteFerie}>
                  🌉 Vos demandes de jours off <strong>autour d'un jour férié</strong> (la veille, le
                  jour même ou le lendemain) sont <strong>surveillées</strong> : elles forment des
                  « ponts » et sont automatiquement <strong>repérées et signalées au faiseur de planning</strong>.
                </div>
                <SelecteurDates
                  dates={data.joursOffSouhaites}
                  onChange={v => maj('joursOffSouhaites', v)}
                  annee={annee}
                  bornes={bornes}
                />
              </SectionRepliable>
            )}

            {/* Préférence vacances scolaires + Toussaint — seulement les périodes du recueil */}
            {voirCarteScol && (
            <div style={s.carte}>
              {voirPrefScol && (
                <>
                  <div style={s.titre}>{titrePrefScol}</div>
                  <div style={s.aide}>
                    {voirFevrier && voirPaques ? "On ne peut pas avoir les deux — choisissez l'une ou l'autre." : 'Indiquez votre préférence pour cette période.'}
                    {vacScol.aConfirmer && ' (dates indicatives, à confirmer)'}
                  </div>
                  <div style={s.radioLigne}>
                    {optionsPrefScol.map(opt => (
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
                </>
              )}

              {voirToussaint && (
                <>
                  <div style={{ ...s.titre, marginTop: voirPrefScol ? 18 : 0 }}>Toussaint</div>
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
                </>
              )}
            </div>
            )}

            {/* Fêtes de fin d'année — réparties à la main (sans objet l'été) */}
            {!estEte && (
              <div style={s.carte}>
                <div style={s.titre}>Fêtes de fin d'année (Noël / Nouvel An)</div>
                <div style={s.aide}>
                  Les 15 jours de fin d'année sont répartis <strong>à la main</strong> par le faiseur de planning,
                  dès la mise en place du planning de début d'année. Rien n'est automatisé ici : indiquez en
                  texte libre vos préférences selon les possibilités qu'il proposera — par exemple la 1ʳᵉ ou la
                  2ᵉ semaine, ou si vous préférez travailler le 24/25 décembre ou le 31/1ᵉʳ janvier.
                </div>
                <textarea
                  style={s.textarea}
                  value={data.noel}
                  onChange={e => maj('noel', e.target.value)}
                  placeholder="Ex. : plutôt la 2ᵉ semaine ; je préfère travailler le 24-25 et être off le 31-1er…"
                />
              </div>
            )}

            {/* Trame principale — souhaits de colonne par semaine (sans objet l'été) */}
            {!estEte && tramePrincipale && (
              <div style={s.carte}>
                <div style={s.titre}>Trame principale — souhaits de colonne</div>
                <div style={s.aide}>
                  Voici la semaine type principale. Seules les colonnes <strong>au choix</strong> sont
                  affichées : Réa, Vacances, Remplaçant et les colonnes avant/après week-end sont gérées
                  automatiquement. Pour les semaines qui comptent pour vous, indiquez la colonne souhaitée (facultatif).
                </div>
                <div style={{ overflowX: 'auto', marginBottom: 14 }}>
                  <TrameGrille
                    colonnes={tramePrincipale.colonnes}
                    colonnesVisibles={colonnesDispo}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select value={nouvSouhaitSem} onChange={e => setNouvSouhaitSem(e.target.value)} style={s.select}>
                    <option value="">Semaine…</option>
                    {semaines.map(sem => <option key={sem.num} value={sem.num}>{sem.label}</option>)}
                  </select>
                  <select value={nouvSouhaitCol} onChange={e => setNouvSouhaitCol(e.target.value)} style={s.select}>
                    <option value="">Colonne…</option>
                    {colonnesDispo.map(i => <option key={i} value={i}>C{i + 1}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={ajouterSouhaitColonne}
                    disabled={nouvSouhaitSem === '' || nouvSouhaitCol === ''}
                    style={{ ...s.bouton, padding: '8px 14px', fontSize: 13, opacity: (nouvSouhaitSem === '' || nouvSouhaitCol === '') ? 0.5 : 1 }}
                  >
                    + Ajouter
                  </button>
                </div>
                {Object.keys(data.colonnesSouhaitees ?? {}).length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(data.colonnesSouhaitees)
                      .sort((a, b) => Number(a[0]) - Number(b[0]))
                      .map(([sem, col]) => (
                        <div key={sem} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <span>{semaines.find(x => x.num === Number(sem))?.label ?? `S${sem}`} → <strong>C{Number(col) + 1}</strong></span>
                          <button
                            type="button"
                            onClick={() => retirerSouhaitColonne(sem)}
                            style={{ border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                            title="Retirer ce souhait"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

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
            {!flash && brouillonActif && (
              <span style={{ fontSize: 13, color: 'var(--color-amber)' }}>
                ✎ Brouillon gardé automatiquement — cliquez <strong>Enregistrer</strong> pour transmettre au faiseur.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
