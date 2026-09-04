// ============================================================
// CreneauxGestion — onglet « Créneaux » : les salles qui ne tournent pas.
//
// Dans les deux blocs on note la même chose — QUI est absent, quand — et seul
// l'affichage change :
//   • Bloc A (NC, Viscérale, CPRE…) : le nom de l'opérateur, « — matin » ou
//     « — après-midi » seulement pour une demi-journée.
//   • Bloc B : un opérateur = une salle. Le planning affiche un compte,
//     « −2 salles le matin » — ce qui sert à la gestion pour savoir où elle a du
//     monde en trop.
//
// La saisie suit la façon dont l'information arrive : un opérateur envoie ses
// absences d'un bloc, on clique ses jours au calendrier et on le nomme une seule
// fois. Et comme ça bouge tout le temps (un opérateur se décommande, puis
// revient), tout se corrige et se retire ligne par ligne, rien n'est définitif.
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  chargerCreneaux, ajouterCreneaux, modifierCreneau, supprimerCreneau,
} from '../../utils/iadeCreneauxApi'
import {
  MOMENTS, SECTEURS, momentCourt, libelleSecteur, cleCreneau, indexerParJour,
  operateursConnus, compterDemiJournees, resume,
  verifierCreneau, verifierLot, basculerJour, resumeJours,
  habitudes, momentsDuLot, lotPanache, habitudesOperateur, lundiDe,
} from '../../utils/iadeCreneaux'
import { operateursTrame, semaineType, normNom } from '../../utils/iadeBlocB'
import { formatJour, bornesMois } from '../../utils/iadeConges'
import { MOIS_FR } from '../../utils/calendrier'
import CalendrierCreneaux from './CalendrierCreneaux'
import SemaineCreneaux from './SemaineCreneaux'

const VIDE = { jours: [], secteur: 'A', moment: 'journee', absent: '', note: '' }

// Le moment vient des habitudes de l'opérateur, jour par jour. On peut le
// reprendre en main : le champ « Moment » redevient alors la règle pour tout le lot.
const AUTO = 'auto'

export default function CreneauxGestion({ annee }) {
  const maintenant = new Date()
  const [mois, setMois] = useState(maintenant.getMonth())
  const [creneaux, setCreneaux] = useState([])
  const [saisie, setSaisie] = useState(VIDE)
  const [ancre, setAncre] = useState(null)
  const [editeId, setEditeId] = useState(null)
  const [charge, setCharge] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [succes, setSucces] = useState(null)
  const [portee, setPortee] = useState('mois')
  // 'auto' : chaque jour prend le moment habituel de l'opérateur CE jour-là.
  const [regleMoment, setRegleMoment] = useState(AUTO)
  // La liste ligne par ligne se replie : une fois la saisie faite, c'est la vue
  // par semaine qu'on lit, pas quarante lignes.
  const [listeOuverte, setListeOuverte] = useState(false)
  const [lundi, setLundi] = useState(() => lundiDe(new Date().toISOString().slice(0, 10)))

  const charger = useCallback(async () => {
    setCharge(true)
    try {
      setCreneaux(await chargerCreneaux(annee))
      setErreur(null)
    } catch {
      setErreur('Impossible de charger les créneaux.')
    } finally {
      setCharge(false)
    }
  }, [annee])

  // Chargement initial et à chaque changement d'année (asynchrone).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { charger() }, [charger])

  const { debut, fin } = bornesMois(annee, mois)
  const affiches = useMemo(() => {
    const dans = portee === 'mois'
      ? creneaux.filter(c => c.jour >= debut && c.jour <= fin)
      : creneaux
    return [...dans].sort((a, b) =>
      a.jour.localeCompare(b.jour) ||
      (a.secteur ?? 'A').localeCompare(b.secteur ?? 'A') ||
      cleCreneau(a).localeCompare(cleCreneau(b), 'fr'))
  }, [creneaux, portee, debut, fin])

  // Proposés à la frappe : CEUX DU BLOC CHOISI, et eux seuls. Un opérateur du
  // bloc A n'a rien à faire dans la liste du bloc B — le proposer invite à la
  // faute de frappe qu'on cherche justement à éviter, et une absence rangée dans
  // le mauvais bloc fausse le compte des salles.
  // Au bloc B, les 14 de la trame d'abord : c'est l'orthographe de référence, et
  // elle contient des opérateurs jamais encore absents. Le bloc A n'a pas de
  // trame : seuls ceux déjà saisis y sont proposés.
  const operateurs = useMemo(() => {
    const duBloc = creneaux.filter(c => (c.secteur ?? 'A') === saisie.secteur)
    const source = saisie.secteur === 'B'
      ? [...operateursTrame(), ...operateursConnus(duBloc)]
      : operateursConnus(duBloc)
    // Dédoublonnage sur le nom NORMALISÉ (accents, casse et civilité ignorés) :
    // « esperance » saisi à la volée et « Espérance » de la trame sont la même
    // personne, et la liste n'a pas à proposer les deux. La trame étant en tête,
    // c'est SON orthographe qui l'emporte — c'est la référence.
    const vus = new Map()
    for (const n of source) {
      const cle = normNom(n)
      if (cle && !vus.has(cle)) vus.set(cle, n.trim())
    }
    return [...vus.values()].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [creneaux, saisie.secteur])
  // Ce qu'on a retenu des opérateurs : quand ils opèrent, par jour de la semaine.
  const habs = useMemo(() => habitudes(creneaux), [creneaux])
  // Ce qu'on montre de l'opérateur : sa semaine type SELON LA TRAME si elle le
  // connaît, sinon ce que l'historique de ses absences laisse deviner.
  // La trame décrit le BLOC B : au bloc A, elle n'a rien à dire.
  const semaine = useMemo(
    () => saisie.secteur === 'B' ? semaineType(saisie.absent) : [],
    [saisie.secteur, saisie.absent]
  )
  const habOperateur = useMemo(
    () => semaine.length > 0 ? [] : habitudesOperateur(habs, saisie.absent),
    [semaine, habs, saisie.absent]
  )
  // Le moment retenu pour CHAQUE jour du lot. En 'auto' il est déduit ; sinon
  // c'est celui du champ « Moment », le même partout.
  const momentsLot = useMemo(
    () => regleMoment === AUTO
      ? momentsDuLot(habs, saisie.absent, saisie.jours, saisie.moment, { trame: saisie.secteur === 'B' })
      : new Map(saisie.jours.map(j => [j, { moment: saisie.moment, source: 'choisi', n: 0, total: 0 }])),
    [regleMoment, habs, saisie.absent, saisie.jours, saisie.moment, saisie.secteur]
  )
  const panache = useMemo(() => lotPanache(momentsLot), [momentsLot])
  const deduits = useMemo(
    () => [...momentsLot.values()].filter(m => m.source !== 'choisi').length,
    [momentsLot]
  )
  const parJour = useMemo(() => indexerParJour(affiches), [affiches])
  // Le calendrier montre l'année entière : on peut sélectionner à cheval sur deux mois.
  const fermesParJour = useMemo(() => indexerParJour(creneaux), [creneaux])
  const demiB = compterDemiJournees(affiches.filter(c => c.secteur === 'B'))
  const demiA = compterDemiJournees(affiches.filter(c => c.secteur !== 'B'))

  const blocB = saisie.secteur === 'B'

  function changer(champ, valeur) {
    setSaisie(prev => ({ ...prev, [champ]: valeur }))
    setSucces(null)
  }

  // En correction, un clic déplace le jour du créneau ; en saisie, il l'ajoute
  // ou le retire du lot.
  function clicJour(iso, { plage } = {}) {
    setSucces(null); setErreur(null)
    setSaisie(prev => ({
      ...prev,
      jours: editeId ? [iso] : basculerJour(prev.jours, iso, { plage, ancre }),
    }))
    setAncre(iso)
  }

  function viderSelection() {
    setSaisie(prev => ({ ...prev, jours: [] }))
    setAncre(null); setSucces(null); setErreur(null)
  }

  function corriger(c) {
    setEditeId(c.id)
    setRegleMoment(c.moment)   // une correction se fait au moment près, sans déduction
    setSaisie({
      jours: [c.jour], secteur: c.secteur ?? 'A', moment: c.moment,
      absent: c.absent ?? '', note: c.note ?? '',
    })
    setMois(Number(c.jour.slice(5, 7)) - 1)
    setAncre(c.jour)
    setErreur(null); setSucces(null)
  }

  function annulerEdition() {
    setEditeId(null); setSaisie(VIDE); setAncre(null); setErreur(null)
  }

  // « Bloc A : Dr Martin — matin »
  function decrireSaisie() {
    return `${libelleSecteur(saisie.secteur)} : ${resume({ ...saisie, absent: saisie.absent.trim() })}`
  }

  async function enregistrer() {
    setErreur(null); setSucces(null)

    if (editeId) {
      const jour = saisie.jours[0] ?? ''
      const probleme = verifierCreneau({ ...saisie, jour, id: editeId }, creneaux)
      if (probleme) { setErreur(probleme); return }
      setEnvoi(true)
      try {
        await modifierCreneau(editeId, {
          jour, secteur: saisie.secteur, moment: saisie.moment,
          absent: saisie.absent, note: saisie.note,
        })
        setSucces('Créneau corrigé.')
        setSaisie(VIDE); setEditeId(null); setAncre(null)
        await charger()
      } catch (err) {
        setErreur(messageEchec(err))
      } finally {
        setEnvoi(false)
      }
      return
    }

    const { message, aPoser, refus } = verifierLot(saisie, creneaux, momentsLot)
    if (message) { setErreur(message); return }

    setEnvoi(true)
    try {
      await ajouterCreneaux(aPoser, saisie)
      const ignores = refus.length > 0
        ? ` (${refus.length} jour(s) déjà noté(s), laissé(s) de côté : ${resumeJours(refus.map(r => r.jour))})`
        : ''
      // Le récapitulatif nomme le moment de chaque jour quand le lot en mêle
      // plusieurs : « 3 jours notés » sans dire lesquels sont des matins ne se
      // relit pas, et c'est justement ce qu'on vient de déduire à sa place.
      const detail = panache
        ? aPoser.map(e => `${formatJour(e.jour)} ${momentCourt(e.moment).toLowerCase()}`).join(', ')
        : `${decrireSaisie()} : ${resumeJours(aPoser.map(e => e.jour))}`
      setSucces(`${aPoser.length} jour(s) noté(s) — ${detail}.${ignores}`)
      setSaisie(prev => ({ ...VIDE, secteur: prev.secteur, moment: prev.moment }))
      setAncre(null)
      await charger()
    } catch (err) {
      setErreur(messageEchec(err))
    } finally {
      setEnvoi(false)
    }
  }

  function messageEchec(err) {
    return err?.code === '23505'
      ? 'Cette ligne existe déjà sur ce créneau.'
      : "Enregistrement impossible. Réessayez ; si le problème persiste, vérifiez vos droits."
  }

  async function retirer(c) {
    if (!confirm(`Retirer ce créneau ?\n\n${libelleSecteur(c.secteur)} : ${resume(c)}, le ${formatJour(c.jour)}`)) return
    setErreur(null); setSucces(null)
    try {
      await supprimerCreneau(c.id)
      if (editeId === c.id) annulerEdition()
      setSucces(c.secteur === 'B'
        ? 'Créneau retiré — la salle est de nouveau comptée.'
        : 'Créneau retiré — la salle retourne à son fonctionnement normal.')
      await charger()
    } catch {
      setErreur('Retrait impossible.')
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────
  const carte = {
    background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)', padding: 20,
  }
  const champ = {
    padding: '7px 10px', fontSize: 13, boxSizing: 'border-box',
    border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
  }
  const label = { display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }
  const bouton = (variante) => ({
    fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `0.5px solid var(--color-${variante})`,
    background: variante === 'primary' ? 'var(--color-primary)' : 'transparent',
    color: variante === 'primary' ? '#fff' : `var(--color-${variante})`,
  })
  const segment = (actif) => ({
    flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: `0.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-border)'}`,
    background: actif ? 'var(--color-primary)' : 'var(--color-bg)',
    color: actif ? '#fff' : 'var(--color-text-secondary)',
  })
  const th = { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const td = { padding: '8px 14px', fontSize: 13, color: 'var(--color-text)', verticalAlign: 'middle' }
  const tr = { borderBottom: '0.5px solid var(--color-border)' }
  const titre = { fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12 }
  const pastilleMoment = (moment) => ({
    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
    background: moment === 'journee' ? 'var(--color-danger-light)' : 'var(--color-amber-light)',
    color: moment === 'journee' ? 'var(--color-danger)' : 'var(--color-amber)',
  })
  const pastilleBloc = (secteur) => ({
    fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap',
    background: secteur === 'B' ? 'var(--color-primary-light)' : 'var(--color-bg)',
    color: secteur === 'B' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
    border: '0.5px solid var(--color-border)',
  })

  const choisis = saisie.jours.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {erreur && <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px' }}>{erreur}</div>}
      {succes && <div style={{ fontSize: 13, color: 'var(--color-success)', background: 'var(--color-success-light)', borderRadius: 8, padding: '10px 14px' }}>{succes}</div>}

      {/* ── Saisie ── */}
      <div style={carte}>
        <div style={titre}>{editeId ? 'Corriger le créneau' : 'Noter des créneaux en moins'}</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <CalendrierCreneaux
            annee={annee}
            mois={mois}
            onNaviguer={(pas) => setMois(m => Math.min(11, Math.max(0, m + pas)))}
            selection={saisie.jours}
            dejaFermes={fermesParJour}
            onClicJour={clicJour}
            monoJour={!!editeId}
          />

          <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <span style={label}>Bloc</span>
              <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                {SECTEURS.map(s => (
                  <button key={s.id} type="button" onClick={() => changer('secteur', s.id)}
                          aria-pressed={saisie.secteur === s.id} style={segment(saisie.secteur === s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {SECTEURS.find(s => s.id === saisie.secteur)?.aide}
              </div>
            </div>

            <div style={{
              fontSize: 13, padding: '8px 12px', borderRadius: 8,
              background: choisis > 0 ? 'var(--color-primary-light)' : 'var(--color-bg)',
              color: choisis > 0 ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <span style={{ fontWeight: 600 }}>
                {choisis === 0 ? 'Aucun jour choisi'
                  : choisis === 1 ? '1 jour choisi' : `${choisis} jours choisis`}
              </span>
              {choisis > 0 && <span style={{ fontSize: 12 }}>{resumeJours(saisie.jours)}</span>}
              {choisis > 0 && !editeId && (
                <button type="button" onClick={viderSelection}
                        style={{ ...bouton('border'), marginLeft: 'auto', color: 'var(--color-text-secondary)' }}>
                  Tout effacer
                </button>
              )}
            </div>

            {/* L'opérateur d'abord : c'est lui qui détermine le moment, plus l'inverse. */}
            <label>
              <span style={label}>Opérateur absent</span>
              <input type="text" list="operateurs-connus" value={saisie.absent} maxLength={80}
                     placeholder="Dr Martin"
                     onChange={e => changer('absent', e.target.value)}
                     style={{ ...champ, width: '100%' }} />
            </label>
            <datalist id="operateurs-connus">
              {operateurs.map(o => <option key={o} value={o} />)}
            </datalist>

            {/* Ce qu'on a retenu de lui : quand il opère, jour de semaine par jour
                de semaine. Affiché pour que la déduction se vérifie d'un coup d'œil
                et se corrige si l'habitude a changé. */}
            {/* Sa semaine type. Elle vient de la TRAME du bloc B quand celle-ci le
                connaît — un fait, pas une statistique — et de l'historique de ses
                absences sinon. Affichée pour que la déduction se vérifie d'un coup
                d'œil, et se corrige si la trame a changé. */}
            {!editeId && semaine.length > 0 && (
              <div style={{
                fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)',
                background: 'var(--color-bg)', border: '0.5px solid var(--color-border)',
                borderRadius: 8, padding: '8px 10px',
              }}>
                <strong style={{ color: 'var(--color-text)' }}>{saisie.absent.trim()}</strong> opère
                {' '}{semaine.map((j, i) => (
                  <span key={j.jourSemaine}>
                    {i > 0 && (i === semaine.length - 1 ? ' et ' : ', ')}
                    le {j.label} <strong>{momentCourt(j.moment).toLowerCase()}</strong>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>
                      {' '}({j.salles.join(' + ')}{j.alterne ? ', semaines impaires' : ''})
                    </span>
                  </span>
                ))}.
                {semaine.some(j => j.salles.length > 1) && (
                  <div style={{ marginTop: 4, color: 'var(--color-amber, #b8860b)' }}>
                    Il tient <strong>deux salles</strong> en même temps ce jour-là : son absence en
                    fait sauter deux.
                  </div>
                )}
              </div>
            )}
            {!editeId && semaine.length === 0 && habOperateur.length > 0 && (
              <div style={{
                fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)',
                background: 'var(--color-bg)', border: '0.5px solid var(--color-border)',
                borderRadius: 8, padding: '8px 10px',
              }}>
                <strong style={{ color: 'var(--color-text)' }}>{saisie.absent.trim()}</strong> n'est
                pas dans la trame du bloc B. D'après ses absences passées, il opère
                {' '}{habOperateur.map((h, i) => (
                  <span key={h.jourSemaine}>
                    {i > 0 && (i === habOperateur.length - 1 ? ' et ' : ', ')}
                    le {h.label} <strong>{momentCourt(h.moment).toLowerCase()}</strong>
                    <span style={{ color: 'var(--color-text-tertiary)' }}> ({h.n}/{h.total})</span>
                  </span>
                ))}.
              </div>
            )}

            <label>
              <span style={label}>Quand</span>
              <select value={regleMoment}
                      onChange={e => {
                        setRegleMoment(e.target.value)
                        if (e.target.value !== AUTO) changer('moment', e.target.value)
                      }}
                      style={{ ...champ, width: '100%' }}>
                {!editeId && <option value={AUTO}>D'après ses habitudes, jour par jour</option>}
                {MOMENTS.map(m => <option key={m.id} value={m.id}>{m.label} — pour tous les jours</option>)}
              </select>
            </label>

            {/* Le détail jour par jour. Il n'apparaît QUE s'il apprend quelque chose :
                un lot qui mêle des matins et des après-midi, ou un moment deviné.
                Un opérateur ne fait pas la même demi-journée tous les jours de la
                semaine — un seul moment pour tout le lot en écraserait la moitié. */}
            {!editeId && regleMoment === AUTO && choisis > 0 && (deduits > 0 || panache) && (
              <div style={{
                fontSize: 12, lineHeight: 1.7,
                background: 'var(--color-primary-light)', borderRadius: 8, padding: '8px 10px',
              }}>
                <div style={{ color: 'var(--color-text)', marginBottom: 4 }}>
                  {panache
                    ? 'Ces jours ne portent pas tous le même moment :'
                    : 'Moment retenu pour ces jours :'}
                </div>
                {saisie.jours.map(iso => {
                  const m = momentsLot.get(iso)
                  return (
                    <div key={iso} style={{ color: 'var(--color-text-secondary)' }}>
                      {formatJour(iso)} — <strong style={{ color: 'var(--color-text)' }}>
                        {momentCourt(m.moment).toLowerCase()}
                      </strong>
                      {m.source === 'trame' && <span style={{ color: 'var(--color-text-tertiary)' }}> · trame du bloc B{m.salles?.length > 1 ? ` · ${m.salles.length} salles` : ''}</span>}
                      {m.source === 'jour' && <span style={{ color: 'var(--color-text-tertiary)' }}> · son habitude ce jour-là ({m.n}/{m.total})</span>}
                      {m.source === 'operateur' && <span style={{ color: 'var(--color-amber, #b8860b)' }}> · jamais vu ce jour de la semaine, d'après son habitude générale</span>}
                      {m.source === 'choisi' && <span style={{ color: 'var(--color-text-tertiary)' }}> · rien de connu, valeur du champ</span>}
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={enregistrer} disabled={envoi || choisis === 0}
                      style={{ ...bouton('primary'), padding: '8px 16px', fontSize: 13, opacity: (envoi || choisis === 0) ? 0.6 : 1 }}>
                {editeId ? 'Enregistrer'
                  : choisis > 1 ? `Ajouter les ${choisis} jours` : 'Ajouter'}
              </button>
              {editeId && (
                <button type="button" onClick={annulerEdition} style={{ ...bouton('border'), padding: '8px 14px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  Annuler
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
              {blocB
                ? <>Au bloc B, <strong>un opérateur = une salle</strong> : deux opérateurs absents le même matin, c'est « −2 salles le matin » dans le planning.</>
                : <>Au bloc A, le planning affiche <strong>le nom de l'opérateur</strong> ; « matin » ou « après-midi » n'est précisé que pour une demi-journée.</>}
              {' '}Ce que tu notes ici apparaît dans l'onglet <strong>Planning IADE</strong>, en face du jour.
            </div>
          </div>
        </div>
      </div>

      {/* ── Liste (repliable) ── */}
      <div style={carte}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: listeOuverte ? 12 : 0 }}>
          <button type="button" onClick={() => setListeOuverte(o => !o)}
                  aria-expanded={listeOuverte}
                  style={{ ...titre, marginBottom: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-block', transition: 'transform .15s', transform: listeOuverte ? 'rotate(90deg)' : 'none', fontSize: 12 }}>▶</span>
            Créneaux en moins
          </button>
          <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Voir&nbsp;:
            <select value={portee} onChange={e => setPortee(e.target.value)} style={{ ...champ, marginLeft: 8 }}>
              <option value="mois">{MOIS_FR[mois]} {annee}</option>
              <option value="annee">toute l'année {annee}</option>
            </select>
          </label>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {affiches.length === 0
              ? 'Rien de signalé'
              : `${affiches.length} ligne(s) sur ${parJour.size} jour(s) — bloc B : ${demiB} demi-journée(s) de salle en moins · bloc A : ${demiA}`}
          </span>
          {!listeOuverte && (
            <button type="button" onClick={() => setListeOuverte(true)}
                    style={{ ...bouton('border'), marginLeft: 'auto', color: 'var(--color-text-secondary)' }}>
              Déplier la liste
            </button>
          )}
        </div>

        {!listeOuverte ? null : charge ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Chargement…</div>
        ) : affiches.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Aucune salle signalée sur cette période. Tout tourne normalement.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={tr}>
                  <th style={th}>Jour</th>
                  <th style={th}>Quand</th>
                  <th style={th}>Bloc</th>
                  <th style={th}>Opérateur</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {affiches.map(c => (
                  <tr key={c.id} style={{ ...tr, background: c.id === editeId ? 'var(--color-primary-light)' : undefined }}>
                    <td style={{ ...td, fontWeight: 500, whiteSpace: 'nowrap' }}>{formatJour(c.jour)}</td>
                    <td style={td}><span style={pastilleMoment(c.moment)}>{momentCourt(c.moment)}</span></td>
                    <td style={td}><span style={pastilleBloc(c.secteur)}>{libelleSecteur(c.secteur ?? 'A')}</span></td>
                    <td style={{ ...td, fontWeight: 500 }}>{c.absent}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" style={bouton('primary')} onClick={() => corriger(c)}>Corriger</button>
                        <button type="button" style={bouton('danger')} onClick={() => retirer(c)}>Retirer</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── La semaine d'un coup d'œil ── */}
      <div style={carte}>
        <div style={titre}>La semaine</div>
        {charge
          ? <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Chargement…</div>
          : <SemaineCreneaux creneaux={creneaux} lundi={lundi} onChoisirLundi={setLundi} />}
      </div>
    </div>
  )
}
