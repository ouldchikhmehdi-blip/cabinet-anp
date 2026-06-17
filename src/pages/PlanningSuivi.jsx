import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ASSOCIES } from '../data/associes'
import { ANNEES, listerSemaines, blocEteVacancesScolaires } from '../utils/calendrier'
import { desiderataVide, normaliser, estRempli, ANNEE_DEFAUT } from '../utils/desiderata'
import {
  chargerTousDesiderata, chargerProfilsAvecInitiales,
  listerRecueils, creerRecueil, definirStatutRecueil, supprimerRecueil, idRecueilPlusRecent,
} from '../utils/desiderataApi'
import { chargerCalendrier, sauverCalendrier, recupererVacancesScolairesZoneC } from '../utils/calendrierApi'
import { listerArchives, urlArchive, supprimerArchive } from '../utils/archivesApi'
import { detecterPontsTous, detecterPontsWeekendTous } from '../utils/ponts'
import RecapDesiderata from '../components/planning/RecapDesiderata'
import PanneauPonts from '../components/planning/PanneauPonts'
import RecapVacancesScolaires from '../components/planning/RecapVacancesScolaires'
import { aDesSouhaitsScolaires } from '../utils/vacancesScolaires'
import PlanningTrames from './PlanningTrames'
import TrameEteGrille from '../components/planning/TrameEteGrille'
import ChoixColonnesEte from '../components/planning/ChoixColonnesEte'
import SyntheseColonnesEte from '../components/planning/SyntheseColonnesEte'
import { parserGrilleEte } from '../utils/trameEte'
import { chargerTrameEte, sauverTrameEte, supprimerTrameEte } from '../utils/trameEteApi'
import CompteursReference from '../components/planning/CompteursReference'
import { chargerCompteursRef, sauverCompteursRef, supprimerCompteursRef } from '../utils/compteursRefApi'

export default function PlanningSuivi() {
  const { session, profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [annee, setAnnee] = useState(ANNEE_DEFAUT)
  const [recueils, setRecueils] = useState([])
  const [recueilId, setRecueilId] = useState(null)
  const [profils, setProfils] = useState([])
  const [desideratas, setDesideratas] = useState([])
  const [ouvert, setOuvert] = useState(null)
  const [tramesOuvert, setTramesOuvert] = useState(false)
  const [tramesEteOuvert, setTramesEteOuvert] = useState(false)
  const [trameEte, setTrameEte] = useState(null)       // grille d'été publiée pour le recueil d'été
  const [apercuEte, setApercuEte] = useState(null)      // grille d'été collée, avant publication
  const [texteEte, setTexteEte] = useState('')          // contenu de la zone de collage
  const [msgEte, setMsgEte] = useState(null)
  const [compteursRef, setCompteursRef] = useState(null) // compteurs de référence (cumul) de l'année
  const [enregistrementRef, setEnregistrementRef] = useState(false)
  const [vueScolaire, setVueScolaire] = useState(false) // panneau récap vacances scolaires (badge)
  const [calendrier, setCalendrier] = useState(null) // base calendrier (pour les ponts écartés)
  const [archives, setArchives] = useState([])       // plannings validés (fichiers Excel) de l'année
  const [erreur, setErreur] = useState(null)

  // Formulaire de création de recueil
  const [nom, setNom] = useState('')
  // Override manuel des semaines (null = utiliser la suggestion automatique).
  const [semDebut, setSemDebut] = useState(null)
  const [semFin, setSemFin] = useState(null)

  // Récupération des vacances scolaires (écrit dans la base calendrier de l'année)
  const [recupVac, setRecupVac] = useState(false)
  const [msgVac, setMsgVac] = useState(null)

  const semainesAnnee = useMemo(() => listerSemaines(annee), [annee])

  // Profils (indépendant de l'année)
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    chargerProfilsAvecInitiales()
      .then(p => { if (!annule) setProfils(p) })
      .catch(() => { if (!annule) setErreur('Impossible de charger les comptes.') })
    return () => { annule = true }
  }, [estFaiseur])

  // Recueils de l'année
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    listerRecueils(annee)
      .then(rs => {
        if (annule) return
        setRecueils(rs)
        setRecueilId(prev => (rs.some(r => r.id === prev) ? prev : idRecueilPlusRecent(rs)))
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger les recueils.') })
    return () => { annule = true }
  }, [annee, estFaiseur])

  // Base calendrier de l'année (pour les jours off de pont écartés par le faiseur)
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    chargerCalendrier(annee)
      .then(c => { if (!annule) setCalendrier(c) })
      .catch(() => { /* silencieux : l'encart ponts restera simplement non interactif */ })
    return () => { annule = true }
  }, [annee, estFaiseur])

  // Desiderata du recueil sélectionné (le board n'est affiché que si un recueil existe)
  useEffect(() => {
    if (!estFaiseur || !recueilId) return
    let annule = false
    chargerTousDesiderata(recueilId)
      .then(d => { if (!annule) setDesideratas(d) })
      .catch(() => { if (!annule) setErreur('Impossible de charger les desiderata.') })
    return () => { annule = true }
  }, [recueilId, estFaiseur])

  // Plannings archivés de l'année (fichiers Excel validés définitivement).
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    listerArchives(annee)
      .then(a => { if (!annule) setArchives(a) })
      .catch(() => { /* table d'archives peut-être pas encore créée : section simplement vide */ })
    return () => { annule = true }
  }, [annee, estFaiseur])

  // Compteurs de référence (cumul à ce stade) de l'année — socle pour construire la suite.
  // chargerCompteursRef(undefined) renvoie null → pas de setState synchrone (tout passe par la promesse).
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    chargerCompteursRef(annee)
      .then(c => { if (!annule) setCompteursRef(c) })
      .catch(() => { if (!annule) setCompteursRef(null) }) // table peut-être pas encore créée
    return () => { annule = true }
  }, [annee, estFaiseur])

  async function enregistrerCompteursRef(data) {
    setErreur(null); setEnregistrementRef(true)
    try {
      await sauverCompteursRef(annee, data, session.user.id)
      const c = await chargerCompteursRef(annee)
      setCompteursRef(c)
    } catch {
      setErreur('Enregistrement des compteurs impossible (réservé au faiseur).')
    } finally {
      setEnregistrementRef(false)
    }
  }

  async function supprimerCompteursRefH() {
    if (!confirm('Supprimer les compteurs de référence enregistrés pour cette année ?')) return
    setErreur(null)
    try {
      await supprimerCompteursRef(annee)
      setCompteursRef(null)
    } catch {
      setErreur('Suppression impossible (réservée au faiseur).')
    }
  }

  async function telechargerArchive(a) {
    setErreur(null)
    try {
      const url = await urlArchive(a.chemin)
      if (url) window.open(url, '_blank', 'noopener')
    } catch {
      setErreur('Téléchargement de l’archive impossible.')
    }
  }

  async function supprimerArchiveLigne(a) {
    if (!confirm(`Supprimer définitivement l’archive « ${a.nom} » ?`)) return
    setErreur(null)
    try {
      await supprimerArchive(a)
      setArchives(prev => prev.filter(x => x.id !== a.id))
    } catch {
      setErreur('Suppression de l’archive impossible.')
    }
  }

  async function rechargerRecueils(selId) {
    const rs = await listerRecueils(annee)
    setRecueils(rs)
    if (selId !== undefined) setRecueilId(selId)
    else setRecueilId(prev => (rs.some(r => r.id === prev) ? prev : idRecueilPlusRecent(rs)))
  }

  async function recupererVacances() {
    setMsgVac(null); setErreur(null); setRecupVac(true)
    try {
      const cal = await chargerCalendrier(annee)
      const weeks = await recupererVacancesScolairesZoneC(annee)
      const maj = { ...cal, vacancesScolaires: weeks }
      await sauverCalendrier(annee, maj, session.user.id)
      setCalendrier(maj)
      setMsgVac(`Vacances scolaires ${annee} récupérées et enregistrées dans la base calendrier.`)
      setTimeout(() => setMsgVac(null), 4000)
    } catch {
      setErreur('Impossible de récupérer les vacances scolaires (API indisponible).')
    } finally {
      setRecupVac(false)
    }
  }

  async function creer() {
    setErreur(null)
    try {
      if (!nom.trim()) { setErreur('Donnez un nom au recueil.'); return }
      if (finVal < debutVal) { setErreur('La semaine de fin doit être ≥ semaine de début.'); return }
      const cree = await creerRecueil({ annee, nom: nom.trim(), semaineDebut: debutVal, semaineFin: finVal, type: 'normal', userId: session.user.id })
      setNom('')
      setSemDebut(null) // revient à la suggestion (partie suivante) après rechargement des recueils
      setSemFin(null)
      // Bascule sur le recueil qui vient d'être créé : la page repart à zéro pour la nouvelle période
      // (statuts en attente, panneau ponts vide, impression vide) jusqu'à ce que les associés saisissent.
      await rechargerRecueils(cree?.id)
    } catch {
      setErreur('Création impossible (réservée au faiseur).')
    }
  }

  async function basculer(r) {
    setErreur(null)
    try {
      await definirStatutRecueil(r.id, r.statut === 'ouvert' ? 'ferme' : 'ouvert')
      await rechargerRecueils(r.id)
    } catch {
      setErreur('Action impossible.')
    }
  }

  async function supprimer(r) {
    if (!confirm(`Supprimer le recueil « ${r.nom} » et tous les desiderata associés ?`)) return
    setErreur(null)
    try {
      await supprimerRecueil(r.id)
      await rechargerRecueils()
    } catch {
      setErreur('Suppression impossible.')
    }
  }

  const recueil = useMemo(() => recueils.find(r => r.id === recueilId) ?? null, [recueils, recueilId])

  const profilParInitiales = useMemo(() => {
    const m = {}
    for (const p of profils) m[p.initiales] = p
    return m
  }, [profils])

  const desiderataParUser = useMemo(() => {
    const m = {}
    for (const d of desideratas) m[d.user_id] = d
    return m
  }, [desideratas])

  const lignes = useMemo(() => ASSOCIES.map(ini => {
    const prof = profilParInitiales[ini]
    const dd = prof ? desiderataParUser[prof.id] : null
    const data = dd ? normaliser(dd.data) : desiderataVide()
    return {
      ini,
      relie: !!prof,
      data,
      majLe: dd?.updated_at ?? null,
      rempli: dd ? estRempli(data, dd.soumis) : false,
    }
  }), [profilParInitiales, desiderataParUser])

  const nbRemplis = lignes.filter(l => l.rempli).length

  // ── Ponts / jours fériés ──
  // Jours off par associé (depuis les desiderata déjà normalisés) → détection des ponts.
  const joursOffParAssocie = useMemo(() => {
    const map = {}
    for (const l of lignes) map[l.ini] = l.data.joursOffSouhaites ?? []
    return map
  }, [lignes])
  const pontsParAssocie = useMemo(() => detecterPontsTous(joursOffParAssocie, annee), [joursOffParAssocie, annee])
  // Indispos week-end par associé → ponts week-end (accolés à un férié vendredi/lundi).
  const weekendsIndispoParAssocie = useMemo(() => {
    const map = {}
    for (const l of lignes) map[l.ini] = l.data.weekendsIndispo ?? []
    return map
  }, [lignes])
  const pontsWeekendParAssocie = useMemo(() => detecterPontsWeekendTous(weekendsIndispoParAssocie, annee), [weekendsIndispoParAssocie, annee])
  const ecartesSet = useMemo(() => new Set(calendrier?.pontsEcartes ?? []), [calendrier])

  // ── Vacances scolaires ── desiderata déjà normalisés (l.data) + semaines scolaires de la base calendrier.
  const desiderataParAssocie = useMemo(() => {
    const m = {}
    for (const l of lignes) m[l.ini] = l.data
    return m
  }, [lignes])
  const scolairesSet = useMemo(() => new Set(calendrier?.vacancesScolaires ?? []), [calendrier])
  const aSouhaitScolaire = aDesSouhaitsScolaires(desiderataParAssocie, scolairesSet)
  // Suggestion de période pour un nouveau recueil : reprend après le dernier recueil. La fin proposée
  // est la fin des vacances d'été tant qu'on n'a pas dépassé l'été (2ᵉ partie), sinon la dernière
  // semaine de l'année (3ᵉ partie : automne → fin d'année, Noël inclus).
  const suggestionRecueil = useMemo(() => {
    const dernierFin = recueils.length ? Math.max(...recueils.map(r => r.semaine_fin)) : 0
    const dernierNum = semainesAnnee.length ? semainesAnnee[semainesAnnee.length - 1].num : 53
    const debut = Math.min(Math.max(dernierFin + 1, 1), dernierNum)
    const ete = blocEteVacancesScolaires(calendrier?.vacancesScolaires ?? [])
    const fin = (ete && debut <= ete.fin) ? ete.fin : dernierNum
    return { debut, fin, jusquEte: !!(ete && debut <= ete.fin) }
  }, [recueils, calendrier, semainesAnnee])

  // Valeurs effectives du formulaire : override manuel s'il existe, sinon la suggestion (qui se recalcule
  // au chargement, au changement d'année et après chaque création → propose la partie suivante).
  const debutVal = semDebut ?? suggestionRecueil.debut
  const finVal = semFin ?? suggestionRecueil.fin ?? 13

  // Recueil « d'été » = celui qui couvre la fin du bloc des vacances scolaires d'été (la 2ᵉ partie,
  // proposée jusqu'aux vacances d'été incluses). La grille d'été lui est rattachée (clé recueil_id).
  const recueilEte = useMemo(() => {
    const ete = blocEteVacancesScolaires(calendrier?.vacancesScolaires ?? [])
    if (!ete) return null
    return recueils.find(r => r.semaine_debut <= ete.fin && r.semaine_fin >= ete.fin) ?? null
  }, [recueils, calendrier])

  // Le recueil actuellement affiché EST le recueil d'été → restitution adaptée (choix de colonnes).
  const estEteSelection = !!recueilEte && !!recueil && recueilEte.id === recueil.id
  // Préférences de colonnes par associé relié (pour la synthèse).
  const associesEte = useMemo(
    () => lignes.filter(l => l.relie).map(l => ({ ini: l.ini, pref: l.data.colonnesEte })),
    [lignes]
  )

  // Grille d'été publiée pour ce recueil (rechargée à chaque changement de recueil d'été).
  // chargerTrameEte(undefined) renvoie null → pas de setState synchrone (tout passe par la promesse).
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    chargerTrameEte(recueilEte?.id)
      .then(t => { if (!annule) setTrameEte(t) })
      .catch(() => { if (!annule) setTrameEte(null) }) // table peut-être pas encore créée
    return () => { annule = true }
  }, [recueilEte, estFaiseur])

  // Collage de la grille d'été depuis Excel (texte tabulé + HTML pour les couleurs de fond).
  function collerGrilleEte(e) {
    const html = e.clipboardData?.getData('text/html') ?? ''
    const texte = e.clipboardData?.getData('text/plain') ?? ''
    if (!texte) return
    e.preventDefault()
    setTexteEte(texte)
    setApercuEte(parserGrilleEte(texte, html))
  }

  async function publierTrameEte() {
    if (!recueilEte || !apercuEte || apercuEte.colonnes.length === 0) return
    setErreur(null); setMsgEte(null)
    try {
      const data = { ...apercuEte, importeLe: new Date().toISOString() }
      await sauverTrameEte(recueilEte.id, data, session.user.id)
      setTrameEte(data)
      setApercuEte(null)
      setTexteEte('')
      setMsgEte('Trame d\'été publiée. Les associés peuvent désormais choisir leurs colonnes.')
      setTimeout(() => setMsgEte(null), 4000)
    } catch {
      setErreur('Publication impossible (réservée au faiseur).')
    }
  }

  async function supprimerGrilleEte() {
    if (!recueilEte) return
    if (!confirm('Supprimer la trame d\'été publiée pour ce recueil ?')) return
    setErreur(null)
    try {
      await supprimerTrameEte(recueilEte.id)
      setTrameEte(null)
    } catch {
      setErreur('Suppression impossible (réservée au faiseur).')
    }
  }

  // Écarter / réintégrer un élément de pont (jour off ou week-end) — persisté dans la base calendrier.
  async function toggleEcart(cle) {
    if (!calendrier) return
    const actuel = calendrier.pontsEcartes ?? []
    const nouveau = actuel.includes(cle) ? actuel.filter(c => c !== cle) : [...actuel, cle]
    const maj = { ...calendrier, pontsEcartes: nouveau }
    const precedent = calendrier
    setCalendrier(maj) // optimiste
    try {
      await sauverCalendrier(annee, maj, session.user.id)
    } catch {
      setCalendrier(precedent)
      setErreur('Écartement impossible (réservé au faiseur).')
    }
  }

  // ── Styles ──
  const s = {
    select: {
      padding: '8px 12px', fontSize: 14, border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    input: {
      padding: '8px 12px', fontSize: 14, border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    bouton: {
      padding: '9px 16px', background: 'var(--color-primary)', color: '#fff',
      border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500,
    },
    boutonSec: {
      padding: '5px 10px', fontSize: 12, borderRadius: 'var(--radius-md)',
      border: '0.5px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)',
    },
    boutonDanger: {
      padding: '5px 10px', fontSize: 12, borderRadius: 'var(--radius-md)',
      border: '0.5px solid var(--color-danger)', background: 'transparent', color: 'var(--color-danger)',
    },
    label: { fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 },
    carteSection: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 24,
    },
    grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 24 },
    carte: (actif) => ({
      textAlign: 'left', background: 'var(--color-surface)',
      border: `0.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-border)'}`,
      borderRadius: 'var(--radius-lg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6,
    }),
    pastille: (couleur) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: couleur }),
    point: (couleur) => ({ width: 9, height: 9, borderRadius: '50%', background: couleur }),
    panneau: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: 24,
    },
  }

  if (!estFaiseur) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Ouverture du planning</h1>
        <div style={{ ...s.carteSection, color: 'var(--color-text-secondary)', fontSize: 14 }}>
          Cette page est réservée au faiseur de planning.
        </div>
      </div>
    )
  }

  function couleurStatut(l) {
    if (!l.relie) return 'var(--color-text-tertiary)'
    return l.rempli ? 'var(--color-success)' : 'var(--color-danger)'
  }
  function texteStatut(l) {
    if (!l.relie) return 'Non relié'
    if (l.data.rienASignaler) return 'Rien à signaler'
    return l.rempli ? 'Transmis' : 'En attente'
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Ouverture du planning</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        {recueil
          ? `${nbRemplis}/${ASSOCIES.length} associés ont transmis pour « ${recueil.nom} ».`
          : 'Créez un recueil pour commencer à collecter les desiderata.'}
      </p>

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }} className="no-print">
          {erreur}
        </div>
      )}

      {/* Gestion des recueils */}
      <div style={s.carteSection} className="no-print">
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
          <div>
            <label style={s.label}>Année</label>
            <select value={annee} onChange={e => { setAnnee(Number(e.target.value)); setSemDebut(null); setSemFin(null) }} style={s.select}>
              {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={recupererVacances}
            disabled={recupVac}
            style={{ ...s.bouton, background: 'transparent', color: 'var(--color-primary)', border: '0.5px solid var(--color-primary)', opacity: recupVac ? 0.6 : 1 }}
            title="Pré-remplit les vacances scolaires zone C dans la base calendrier (avant que les associés saisissent)"
          >
            {recupVac ? 'Récupération…' : 'Récupérer les vacances scolaires (zone C)'}
          </button>
        </div>
        {msgVac && <div style={{ fontSize: 12, color: 'var(--color-success)', marginBottom: 12 }}>{msgVac}</div>}
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
          Au démarrage, récupérez les vacances scolaires : elles seront bloquées dans les grilles
          de desiderata des associés (gérées via la question dédiée). Vous pourrez les ajuster dans « Base calendrier ».
        </div>

        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
          « Fermer » un recueil bloque les modifications des associés (ils ne peuvent plus que consulter).
        </div>

        {/* Liste des recueils de l'année */}
        {recueils.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {recueils.map(r => {
              const ouvertR = r.statut === 'ouvert'
              const actif = r.id === recueilId
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: `0.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                  <button type="button" onClick={() => setRecueilId(r.id)} style={{ ...s.boutonSec, border: 'none', background: 'transparent', fontSize: 13, fontWeight: actif ? 600 : 400, color: 'var(--color-text)', flex: 1, textAlign: 'left' }}>
                    {r.nom} <span style={{ color: 'var(--color-text-tertiary)' }}>· S{r.semaine_debut}→S{r.semaine_fin}</span>
                  </button>
                  <span style={s.pastille(ouvertR ? 'var(--color-success)' : 'var(--color-text-tertiary)')}>
                    <span style={s.point(ouvertR ? 'var(--color-success)' : 'var(--color-text-tertiary)')} />
                    {ouvertR ? 'Ouvert' : 'Fermé'}
                  </span>
                  <button type="button" onClick={() => basculer(r)} style={s.boutonSec}>{ouvertR ? 'Fermer' : 'Ouvrir'}</button>
                  <button type="button" onClick={() => supprimer(r)} style={s.boutonDanger}>Supprimer</button>
                </div>
              )
            })}
          </div>
        )}

        {/* Créer un recueil */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', borderTop: '0.5px solid var(--color-border)', paddingTop: 16 }}>
          <div>
            <label style={s.label}>Nom du recueil</label>
            <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex. : 1er trimestre" style={{ ...s.input, width: 200 }} />
          </div>
          <div>
            <label style={s.label}>Semaine de début</label>
            <select value={debutVal} onChange={e => setSemDebut(Number(e.target.value))} style={s.select}>
              {semainesAnnee.map(sm => <option key={sm.num} value={sm.num}>{sm.label}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Semaine de fin</label>
            <select value={finVal} onChange={e => setSemFin(Number(e.target.value))} style={s.select}>
              {semainesAnnee.map(sm => <option key={sm.num} value={sm.num}>{sm.label}</option>)}
            </select>
          </div>
          {suggestionRecueil.fin != null && (
            <div style={{ paddingBottom: 9, alignSelf: 'flex-end', fontSize: 12, color: 'var(--color-text-tertiary)', maxWidth: 280 }}>
              Suggéré : reprend après le dernier recueil, {suggestionRecueil.jusquEte ? 'jusqu\'aux vacances d\'été incluses' : 'jusqu\'à la fin de l\'année'} (S{suggestionRecueil.debut} → S{suggestionRecueil.fin}).
            </div>
          )}
          <button type="button" onClick={creer} style={s.bouton}>Créer le recueil</button>
        </div>
      </div>

      {/* Plannings archivés (fichiers Excel validés définitivement), par année */}
      <div style={s.carteSection} className="no-print">
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
          Plannings archivés {annee}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
          Plannings « validés définitivement » de l'année (fichiers Excel). La liste s'enrichit à chaque validation et au fil des années.
        </div>
        {archives.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Aucun planning archivé pour {annee}.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {archives.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text)', flex: 1 }}>
                  📄 {a.nom}
                  {a.semaine_debut != null && <span style={{ color: 'var(--color-text-tertiary)' }}> · S{a.semaine_debut}→S{a.semaine_fin}</span>}
                  <span style={{ color: 'var(--color-text-tertiary)' }}> · {new Date(a.created_at).toLocaleDateString('fr-FR')}</span>
                </span>
                <button type="button" onClick={() => telechargerArchive(a)} style={{ ...s.boutonSec, color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}>⬇ Télécharger</button>
                <button type="button" onClick={() => supprimerArchiveLigne(a)} style={s.boutonDanger}>Supprimer</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trames de l'année — gérées ici, en même temps que l'ouverture des desiderata */}
      <div style={s.carteSection} className="no-print">
        <button
          type="button"
          onClick={() => setTramesOuvert(o => !o)}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left', display: 'block' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{tramesOuvert ? '▾' : '▸'}</span>
            Trames de l'année {annee}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
            Collez vos semaines type, désignez la trame principale (montrée aux associés dans leurs desiderata).
            Modifiable à tout moment.
          </span>
        </button>
        {tramesOuvert && (
          <div style={{ marginTop: 16 }}>
            <PlanningTrames sansEntete annee={annee} onChangeAnnee={setAnnee} />
          </div>
        )}
      </div>

      {/* Trame de l'été — seulement quand le recueil SÉLECTIONNÉ est celui qui couvre l'été */}
      {estEteSelection && (
        <div style={s.carteSection} className="no-print">
          <button
            type="button"
            onClick={() => setTramesEteOuvert(o => !o)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left', display: 'block' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{tramesEteOuvert ? '▾' : '▸'}</span>
              Trame de l'été {annee}
            </span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
              Grille d'été pour « {recueilEte.nom} » (S{recueilEte.semaine_debut}→S{recueilEte.semaine_fin}).
              Collez la grille depuis Excel : les associés y choisiront leur(s) colonne(s).
            </span>
          </button>
          {tramesEteOuvert && (
            <div style={{ marginTop: 16 }}>
              {msgEte && <div style={{ fontSize: 12, color: 'var(--color-success)', marginBottom: 12 }}>{msgEte}</div>}

              {/* Grille déjà publiée */}
              {trameEte && trameEte.colonnes.length > 0 ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                    Trame d'été publiée ({trameEte.colonnes.length} colonne{trameEte.colonnes.length > 1 ? 's' : ''},
                    {' '}{trameEte.lignes.length} jours).
                    <button type="button" onClick={supprimerGrilleEte} style={{ ...s.boutonDanger, marginLeft: 10 }}>Supprimer</button>
                  </div>
                  <TrameEteGrille colonnes={trameEte.colonnes} lignes={trameEte.lignes} />
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
                  Aucune trame d'été publiée pour ce recueil.
                </div>
              )}

              {/* Zone de collage (importer / remplacer) */}
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
                {trameEte ? 'Remplacer la trame d\'été' : 'Coller la grille d\'été depuis Excel'}
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
                Dans Excel, sélectionnez le bloc avec la <strong>colonne des dates en premier</strong>, puis les
                colonnes B, C, D… et collez ci-dessous (Ctrl+V). Les <strong>fonds de couleur</strong>
                (vacances, gardes, jour férié…) sont conservés tels quels.
              </p>
              <textarea
                value={texteEte}
                onChange={e => setTexteEte(e.target.value)}
                onPaste={collerGrilleEte}
                placeholder="Collez ici la grille d'été copiée depuis Excel…"
                style={{
                  width: '100%', minHeight: 80, padding: '10px 12px', fontSize: 13, fontFamily: 'monospace',
                  border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                }}
              />

              {apercuEte && apercuEte.colonnes.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      Aperçu : {apercuEte.colonnes.length} colonne{apercuEte.colonnes.length > 1 ? 's' : ''} · {apercuEte.lignes.length} jours
                    </span>
                    <button type="button" onClick={publierTrameEte} style={s.bouton}>Publier la trame d'été</button>
                  </div>
                  <TrameEteGrille colonnes={apercuEte.colonnes} lignes={apercuEte.lignes} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Compteurs de référence (cumul à ce stade) — socle annuel pour construire la suite */}
      <CompteursReference
        annee={annee}
        valeur={compteursRef}
        onEnregistrer={enregistrerCompteursRef}
        onSupprimer={supprimerCompteursRefH}
        enregistrement={enregistrementRef}
      />

      {recueil && (
        <>
          <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }} className="no-print">
            <button type="button" onClick={() => window.print()} style={s.bouton}>
              Imprimer les desiderata des associés
            </button>
            <button
              type="button"
              onClick={() => basculer(recueil)}
              style={{
                ...s.bouton, border: '0.5px solid var(--color-amber)',
                background: recueil.statut === 'ferme' ? 'var(--color-amber)' : 'transparent',
                color: recueil.statut === 'ferme' ? '#fff' : 'var(--color-amber)',
              }}
              title={recueil.statut === 'ferme'
                ? 'Desiderata bloqués : cliquez pour rouvrir le recueil (les associés pourront de nouveau modifier leurs choix).'
                : 'Ferme le recueil de desiderata : les associés ne peuvent plus modifier leurs choix. Cliquez de nouveau pour rouvrir.'}
            >
              {recueil.statut === 'ferme' ? '🔓 Débloquer les desiderata' : '🔒 Bloquer les desiderata'}
            </button>
            <button
              type="button"
              disabled={!aSouhaitScolaire}
              onClick={() => setVueScolaire(v => !v)}
              style={{
                ...s.bouton, border: '0.5px solid #2D6CB5',
                background: vueScolaire ? '#2D6CB5' : 'transparent',
                color: vueScolaire ? '#fff' : '#2D6CB5',
                cursor: aSouhaitScolaire ? 'pointer' : 'default',
                opacity: aSouhaitScolaire ? 1 : 0.45,
              }}
              title={aSouhaitScolaire
                ? 'Voir les souhaits de vacances scolaires de tous les associés (et les conflits éventuels)'
                : 'Aucun souhait de vacances scolaires'}
            >
              📚 Vacances scolaires
            </button>
          </div>

          {vueScolaire && aSouhaitScolaire && (
            <div className="no-print" style={{
              background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)', padding: '4px 16px 14px', marginBottom: 16,
            }}>
              <RecapVacancesScolaires desiderataParAssocie={desiderataParAssocie} scolairesSet={scolairesSet} />
            </div>
          )}

          {/* Board des associés */}
          <div style={s.grille} className="no-print">
            {lignes.map(l => (
              <button key={l.ini} type="button" onClick={() => setOuvert(prev => prev === l.ini ? null : l.ini)} style={s.carte(ouvert === l.ini)} disabled={!l.relie}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>{l.ini}</span>
                <span style={s.pastille(couleurStatut(l))}>
                  <span style={s.point(couleurStatut(l))} />
                  {texteStatut(l)}
                </span>
                {l.majLe && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    {new Date(l.majLe).toLocaleDateString('fr-FR')}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Panneau récap au clic d'un associé */}
          {ouvert && (
            <div style={s.panneau} className="no-print">
              {estEteSelection && trameEte ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12 }}>{ouvert} — choix de colonnes</div>
                  <ChoixColonnesEte trameEte={trameEte} valeur={lignes.find(l => l.ini === ouvert).data.colonnesEte} lectureSeule enteteSeule />
                </>
              ) : (
                <RecapDesiderata initiales={ouvert} d={lignes.find(l => l.ini === ouvert).data} annee={annee} estEte={estEteSelection} />
              )}
            </div>
          )}

          {/* Synthèse par colonne (recueil d'été) — aide à la décision, sous le board */}
          {estEteSelection && (
            <div style={s.panneau}>
              <SyntheseColonnesEte colonnes={trameEte?.colonnes ?? []} associes={associesEte} />
            </div>
          )}

          {/* Ponts / jours fériés — alerte précoce, avant l'attribution des week-ends (sans objet l'été) */}
          {!estEteSelection && (
            <div className="no-print">
              <PanneauPonts pontsParAssocie={pontsParAssocie} pontsWeekendParAssocie={pontsWeekendParAssocie} joursOffParAssocie={joursOffParAssocie} weekendsIndispoParAssocie={weekendsIndispoParAssocie} annee={annee} ecartesSet={ecartesSet} onToggle={toggleEcart} />
            </div>
          )}

          {/* Vue imprimable */}
          <div className="zone-impression">
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
              Desiderata — {recueil.nom} ({annee}, S{recueil.semaine_debut}→S{recueil.semaine_fin})
            </h2>
            {estEteSelection && (
              <div style={{ marginBottom: 24 }}>
                <SyntheseColonnesEte colonnes={trameEte?.colonnes ?? []} associes={associesEte} />
              </div>
            )}
            {lignes.map(l => (
              <div key={l.ini} style={{ marginBottom: 24 }}>
                <RecapDesiderata
                  initiales={l.ini}
                  d={l.data}
                  annee={annee}
                  estEte={estEteSelection}
                  ponts={pontsParAssocie[l.ini] ?? []}
                  pontsWeekend={pontsWeekendParAssocie[l.ini] ?? []}
                  ecartesSet={ecartesSet}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
