// ============================================================
// IadePlanning — « Planning IADE », le même écran pour les agents IADE et les
// associés MAR : mêmes données, mêmes droits (lecture seule).
//
// La source est le fichier Excel du planning, republié chaque nuit depuis le
// mini PC (cf. IADE.md § « Planning IADE » et Projects/outils-planning). Le miroir
// `iade_planning` n'est jamais écrit d'ici.
//
// Depuis le 2026-09-16, la gestion IADE MODIFIE pourtant une case ici même (poste,
// horaires) : la modification vit dans sa propre table, `iade_planning_modifs`, se
// superpose au miroir à l'affichage, et la chaîne du mini PC la reporte dans le
// fichier Dropbox dans le quart d'heure — avec un commentaire sur la case. L'agent
// concerné est prévenu par e-mail à l'enregistrement. Il n'y a donc toujours qu'une
// vérité : la modification l'emporte sur le fichier, et le fichier la reprend.
// Les cases s'éditent en brouillon puis s'enregistrent d'un bloc, pour qu'un agent
// dont trois jours changent reçoive UN e-mail, pas trois.
//
// La colonne « Créneaux en moins » N'EST PAS MONTRÉE AUX IADE (décision de Mehdi
// le 2026-09-03) : les salles qui ne tournent pas sont une donnée d'organisation du
// cabinet, pas le planning d'un salarié. Le masquage ici n'est que le confort de
// lecture — ce qui protège vraiment, c'est la RLS de `iade_creneaux_fermes`, qui ne
// laisse plus un compte IADE lire la table du tout. Un écran ne cache rien : l'API
// REST répondrait quand même. Même règle sur Dropbox : le fichier des IADE est
// généré SANS cette colonne (`convertir_mois.py --sans-creneaux`).
//
// DEUX exceptions, ajoutées par-dessus le fichier et signalées comme telles : la
// colonne des remplaçants (noms validés dans l'onglet « Rempla ») et celle des
// créneaux en moins (onglet « Créneaux »). Elles vivent dans leurs propres tables,
// que la republication nocturne ne touche pas — sans quoi un remplaçant saisi le
// soir aurait disparu le lendemain matin. La chaîne de 5 h fait le trajet inverse :
// elle les recopie dans le fichier Excel publié sur Dropbox, pour que les deux
// supports disent la même chose.
// ============================================================
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import {
  chargerMois, chargerDerniereMaj, chargerModifsPeriode, enregistrerModifs, annulerModifs, notifierPlanning,
} from '../utils/iadePlanningApi'
import CaseEditeur from '../components/iade/CaseEditeur'
import { chargerRemplacantsPourvus } from '../utils/iadeRemplaApi'
import { chargerCreneauxPeriode } from '../utils/iadeCreneauxApi'
import {
  indexerParJour as indexerCreneaux, resume as resumeCreneau, bilanBlocB, segmentsBilanB,
} from '../utils/iadeCreneaux'
import {
  POSTES, COULEUR_CONGE, COULEUR_HS, COULEUR_VACANCES,
  couleurPoste, decrire, bornesDuMois, colonnesDuMois, indexerParJour, moitiesCase,
  semaineISO, natureNote, libelleNote, appliquerModifs, memeCase, resumeCase,
} from '../utils/iadePlanning'
import { moisAnneeFR } from '../utils/calendrier'

// Encre sombre imposée sur les fonds jaunes : ils ne changent pas avec le thème,
// le texte ne doit pas changer non plus.
const ENCRE_SUR_JAUNE = '#2C2C2A'

// Date du jour en heure locale : construire l'ISO depuis les champs locaux
// évite qu'un fuseau décale « aujourd'hui » d'une journée.
function isoAujourdHui() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const cleCase = (jour, iade) => `${jour}|${iade}`
const joli = (nom) => nom.charAt(0).toUpperCase() + nom.slice(1).toLowerCase()
const lister = (l) => l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}`
const extraire = (c) => ({ kind: c?.kind, matin: c?.matin ?? null, apres_midi: c?.apres_midi ?? null, poste: c?.poste ?? null })

// Ce qu'on dit à la gestion après l'enregistrement. Des faits, pas des espoirs :
// qui a reçu l'e-mail, pour quelle colonne personne n'a pu être prévenu, et ce
// qu'il lui reste à faire elle-même dans ce cas.
function messageBilan(entrees, bilans) {
  const colonnes = [...new Set(entrees.map(e => joli(e.iade)))]
  const prevenus = [...new Set(bilans.flatMap(b => b.prevenus))]
  const sansCompte = [...new Set(bilans.flatMap(b => b.sansCompte))]
  const sansEnvoi = [...new Set(bilans.flatMap(b => (b.ok ? b.sansEnvoi : [])))]
  const echec = bilans.some(b => !b.ok)
  const parts = [`${entrees.length} case(s) enregistrée(s).`]
  if (prevenus.length > 0) {
    parts.push(`${lister(prevenus)} ${prevenus.length > 1 ? 'ont' : 'a'} été prévenu(e)${prevenus.length > 1 ? 's' : ''} par e-mail.`)
  }
  if (sansCompte.length > 0) {
    parts.push(`Aucun compte IADE ne correspond à la colonne ${lister(sansCompte.map(c => `« ${c} »`))} : prévenez cette personne vous-même.`)
  }
  if (sansEnvoi.length > 0) {
    parts.push(`L'e-mail à ${lister(sansEnvoi)} n'est pas parti : prévenez-le vous-même.`)
  }
  if (echec) {
    const restants = colonnes.filter(c => !prevenus.includes(c))
    if (restants.length > 0) parts.push(`Les e-mails n'ont pas pu partir : prévenez ${lister(restants)} vous-même.`)
  }
  parts.push('Le fichier Dropbox est mis à jour dans le quart d\'heure.')
  return parts.join(' ')
}

export default function IadePlanning() {
  const { profile } = useAuth()
  // Un compte IADE ne voit pas les créneaux en moins. Par défaut on ne les montre
  // PAS : tant que le profil n'est pas chargé, mieux vaut une colonne qui apparaît
  // que des données qui s'affichent une seconde à qui ne doit pas les voir.
  const voitCreneaux = profile ? !profile.is_iade : false
  // Modifier une case : la gestion IADE (gestionnaire, faiseur de planning, admin) —
  // les mêmes que pour les remplaçants et les créneaux. La RLS le vérifie de son côté.
  const peutModifier = profile?.is_gestion_iade === true || profile?.is_faiseur === true || profile?.role === 'admin'

  const aujourdHui = isoAujourdHui()
  const [annee, setAnnee] = useState(() => Number(aujourdHui.slice(0, 4)))
  const [mois, setMois] = useState(() => Number(aujourdHui.slice(5, 7)))
  // Les données portent le mois qu'elles décrivent : « en chargement » et
  // « en erreur » s'en déduisent, plutôt que d'être remis à zéro à la main à
  // chaque changement de mois (deux états à garder d'accord, donc un à oublier).
  const [donnees, setDonnees] = useState({ annee: null, mois: null, cases: [], jours: [], rempla: [], creneaux: [], modifs: [] })
  const [maj, setMaj] = useState(null)
  const [echec, setEchec] = useState(null)
  // Cases modifiées mais pas encore enregistrées : clé jour|IADE →
  //   { type: 'modif', cas, avant, fichier } ou { type: 'retour', id }.
  const [brouillon, setBrouillon] = useState(() => new Map())
  const [edition, setEdition] = useState(null)          // { jour, iade } de la case ouverte
  const [enregistrement, setEnregistrement] = useState(false)
  const [succes, setSucces] = useState(null)
  const [erreurAction, setErreurAction] = useState(null)

  useEffect(() => {
    let vivant = true
    const { debut, fin } = bornesDuMois(annee, mois)
    Promise.all([
      chargerMois(annee, mois), chargerDerniereMaj(),
      chargerRemplacantsPourvus(debut, fin),
      // Requête inutile pour un IADE : la RLS ne lui rendrait rien de toute façon.
      voitCreneaux ? chargerCreneauxPeriode(debut, fin) : Promise.resolve([]),
      chargerModifsPeriode(debut, fin),
    ])
      .then(([d, m, r, c, md]) => {
        if (!vivant) return
        setDonnees({ annee, mois, ...d, rempla: r, creneaux: c, modifs: md })
        setMaj(m)
      })
      .catch(e => {
        if (vivant) setEchec({ annee, mois, message: e.message || 'Chargement impossible.' })
      })
    return () => { vivant = false }
  }, [annee, mois, voitCreneaux])

  const aJour = donnees.annee === annee && donnees.mois === mois
  const erreur = echec && echec.annee === annee && echec.mois === mois ? echec.message : null
  const chargement = !aJour && !erreur

  // Le mois précédent ne doit pas rester affiché pendant le chargement du suivant.
  // `casesBase` = ce que la base dit (miroir + modifications enregistrées) ;
  // `cases` = la même chose, avec le brouillon par-dessus — ce qu'on affiche.
  const casesBase = useMemo(() => (aJour ? appliquerModifs(donnees.cases, donnees.modifs) : []), [aJour, donnees.cases, donnees.modifs])
  const cases = useMemo(() => {
    if (brouillon.size === 0) return casesBase
    return casesBase.map(c => {
      const b = brouillon.get(cleCase(c.jour, c.iade))
      if (!b) return c
      if (b.type === 'retour') {
        const f = c.modif?.fichier ?? {}
        return { ...c, kind: undefined, matin: f.matin ?? null, apres_midi: f.apres_midi ?? null, poste: f.poste ?? null, brouillon: b }
      }
      return { ...c, ...b.cas, brouillon: b }
    })
  }, [casesBase, brouillon])
  const jours = useMemo(() => (aJour ? donnees.jours : []), [aJour, donnees.jours])
  const colonnes = useMemo(() => colonnesDuMois(cases), [cases])
  const index = useMemo(() => indexerParJour(cases, jours), [cases, jours])
  const indexBase = useMemo(() => indexerParJour(casesBase, jours), [casesBase, jours])
  const joursTries = useMemo(() => [...index.keys()].sort(), [index])

  // ── Édition d'une case ──────────────────────────────────────────────────
  const caseBaseEnEdition = edition ? (indexBase.get(edition.jour)?.cases.get(edition.iade) ?? null) : null

  // « Appliquer » dans l'éditeur : la case va au brouillon. Une case remise telle
  // qu'elle est en base n'est pas une modification — elle sort du brouillon.
  function appliquerBrouillon(cas) {
    if (!edition || !cas) return
    const { jour, iade } = edition
    const cle = cleCase(jour, iade)
    setBrouillon(prev => {
      const suivant = new Map(prev)
      if (caseBaseEnEdition && memeCase(cas, caseBaseEnEdition)) suivant.delete(cle)
      else suivant.set(cle, { type: 'modif', jour, iade, cas, avant: extraire(caseBaseEnEdition), fichier: extraire(caseBaseEnEdition) })
      return suivant
    })
    setEdition(null)
  }

  // « Revenir au fichier » : la modification enregistrée sera annulée.
  function revenirFichier() {
    if (!edition) return
    const modif = caseBaseEnEdition?.modif
    if (!modif || modif.retour) { setEdition(null); return }
    const { jour, iade } = edition
    setBrouillon(prev => new Map(prev).set(cleCase(jour, iade), { type: 'retour', jour, iade, id: modif.id }))
    setEdition(null)
  }

  async function enregistrer() {
    const entrees = [...brouillon.values()]
    if (entrees.length === 0) return
    const modifs = entrees.filter(b => b.type === 'modif')
    const retours = entrees.filter(b => b.type === 'retour')
    setEnregistrement(true); setSucces(null); setErreurAction(null)
    try {
      const { lot } = await enregistrerModifs(modifs.map(b => ({
        jour: b.jour, iade: b.iade, ...b.cas, avant: b.avant, fichier: b.fichier,
      })))
      const annulees = await annulerModifs(retours.map(b => b.id))
      const bilans = []
      if (lot) bilans.push(await notifierPlanning({ type: 'planning_modif', lot }))
      if (annulees.length > 0) bilans.push(await notifierPlanning({ type: 'planning_retour', ids: annulees.map(a => a.id) }))
      setSucces(messageBilan(entrees, bilans))
      setBrouillon(new Map())
      const { debut, fin } = bornesDuMois(annee, mois)
      const md = await chargerModifsPeriode(debut, fin)
      setDonnees(d => (d.annee === annee && d.mois === mois ? { ...d, modifs: md } : d))
    } catch (e) {
      setErreurAction(`Enregistrement incomplet : ${e.message || 'erreur inconnue'}. Rechargez la page pour voir ce qui a été pris en compte.`)
    } finally {
      setEnregistrement(false)
    }
  }
  const colonnesBrouillon = [...new Set([...brouillon.values()].map(b => joli(b.iade)))]

  // Remplaçants saisis dans le dashboard : jour → noms. Ceux que le fichier Excel
  // porte déjà ne sont pas répétés (comparaison insensible à la casse et aux
  // espaces) — la même personne ne doit pas apparaître deux fois sur une ligne.
  // Salles qui ne tournent pas, saisies dans l'onglet « Créneaux ».
  const creneauxParJour = useMemo(
    () => indexerCreneaux(aJour ? donnees.creneaux : []),
    [aJour, donnees.creneaux]
  )

  const remplaDashboard = useMemo(() => {
    const index = new Map()
    for (const r of (aJour ? donnees.rempla : [])) {
      if (!r.nom) continue
      if (!index.has(r.jour)) index.set(r.jour, [])
      index.get(r.jour).push(r.nom)
    }
    return index
  }, [aJour, donnees.rempla])

  function naviguer(pas) {
    const m = mois + pas
    if (m < 1) { setAnnee(annee - 1); setMois(12) }
    else if (m > 12) { setAnnee(annee + 1); setMois(1) }
    else setMois(m)
  }

  const carte = {
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: 16,
  }
  const boutonNav = {
    padding: '4px 10px', fontSize: 12, borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)', background: 'var(--color-bg)',
    color: 'var(--color-text)', cursor: 'pointer',
  }
  // Un peu plus étroit qu'avant : chaque IADE occupe maintenant deux colonnes,
  // il faut bien les loger sans que le mois parte trop loin sur la droite.
  const cellule = {
    border: '0.5px solid var(--color-border)', padding: '0 2px',
    minWidth: 98, height: 36, textAlign: 'center', fontSize: 11,
  }

  const enTete = {
    ...cellule, position: 'sticky', top: 0, zIndex: 2, height: 30,
    background: 'var(--color-bg)', fontWeight: 600, color: 'var(--color-text)',
  }
  // Deuxième ligne d'en-tête, collée sous la première (30 px plus bas).
  const sousEnTete = {
    ...enTete, top: 30, height: 20, minWidth: 0,
    fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)',
  }
  // La colonne « Congé / HS » porte les couleurs du fichier jusque dans son
  // en-tête : on la repère avant même qu'elle soit remplie.
  const enTeteNote = { ...sousEnTete, background: COULEUR_HS, color: '#7A4A0B' }

  // Couleurs de la case « Congé / HS ». Congé en rouge plein, heures sup sur le
  // beige — exactement le fichier Excel, pour qu'on lise les deux pareil.
  const celluleNote = (nature) => ({
    ...cellule, minWidth: 62, fontWeight: 700, letterSpacing: '0.02em',
    background: nature === 'conge' ? COULEUR_CONGE : nature === 'hs' ? COULEUR_HS : 'transparent',
    color: nature === 'conge' ? '#fff' : nature === 'hs' ? '#7A4A0B' : 'var(--color-text-tertiary)',
  })

  // Numéro de semaine ISO, posé dans la case du lundi. Le fichier Excel se lit
  // par semaine (« la S38 ») et les échanges de garde se disent comme ça : le
  // numéro évite de recompter les lundis à chaque fois.
  const badgeSemaine = (surJaune) => ({
    fontSize: 9, fontWeight: 700, letterSpacing: '0.02em',
    padding: '0 4px', borderRadius: 3, whiteSpace: 'nowrap',
    border: '0.5px solid var(--color-border)',
    color: surJaune ? ENCRE_SUR_JAUNE : 'var(--color-text-tertiary)',
  })

  const vide = !chargement && !erreur && joursTries.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
          Planning IADE
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
          {peutModifier ? (
            <>Le planning de l'équipe IADE, repris du fichier du planning. <strong>Cliquez une case</strong> pour
            changer le poste ou les horaires : l'agent est prévenu par e-mail à l'enregistrement, et le
            fichier Dropbox est mis à jour dans le quart d'heure.</>
          ) : (
            <>Le planning de l'équipe IADE, en lecture seule. Il reprend le fichier du planning ; une case
            cerclée a été modifiée par la gestion, qui vous en a prévenu(e) par e-mail.</>
          )}
          {maj?.genere_le && (
            <> {' '}À jour au <strong>{new Date(maj.genere_le).toLocaleString('fr-FR', {
              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}</strong>.</>
          )}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button style={boutonNav} onClick={() => naviguer(-1)}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', minWidth: 150, textAlign: 'center' }}>
          {moisAnneeFR(new Date(Date.UTC(annee, mois - 1, 1)))}
        </span>
        <button style={boutonNav} onClick={() => naviguer(1)}>›</button>
        {chargement && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>chargement…</span>}
      </div>

      {erreur && (
        <div style={{ ...carte, borderColor: COULEUR_CONGE, color: COULEUR_CONGE, fontSize: 13 }}>
          {erreur}
        </div>
      )}
      {erreurAction && <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px' }}>{erreurAction}</div>}
      {succes && <div style={{ fontSize: 13, color: 'var(--color-success)', background: 'var(--color-success-light)', borderRadius: 8, padding: '10px 14px' }}>{succes}</div>}

      {/* ── Brouillon : les cases modifiées partent d'un bloc, un e-mail par agent ── */}
      {brouillon.size > 0 && (
        <div style={{ ...carte, borderColor: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--color-text)', flex: 1, minWidth: 220 }}>
            <strong>{brouillon.size} case(s) modifiée(s)</strong>, pas encore enregistrée(s).
            {' '}À l'enregistrement, {lister(colonnesBrouillon)} {colonnesBrouillon.length > 1 ? 'seront prévenus' : 'sera prévenu(e)'} par e-mail.
          </span>
          <button style={{ ...boutonNav, background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)', fontWeight: 600 }}
                  disabled={enregistrement} onClick={enregistrer}>
            {enregistrement ? 'Enregistrement…' : 'Enregistrer et prévenir'}
          </button>
          <button style={boutonNav} disabled={enregistrement} onClick={() => setBrouillon(new Map())}>Tout annuler</button>
        </div>
      )}

      {vide && (
        <div style={{ ...carte, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Aucun planning publié pour ce mois. S'il devrait y en avoir un, c'est que la
          publication nocturne n'est pas passée — le fichier, lui, reste consultable sur Dropbox.
        </div>
      )}

      {/* ── Grille du mois : la vue d'ensemble, comme dans le fichier ── */}
      {joursTries.length > 0 && (
        <div style={{ ...carte, padding: 0, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            {/* En-tête sur deux lignes, comme le fichier : le nom de l'IADE
                coiffe SA colonne d'horaires ET sa colonne « Congé / HS ». */}
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...enTete, minWidth: 116, textAlign: 'left', paddingLeft: 10, zIndex: 3 }}>Jour</th>
                {colonnes.map(nom => (
                  <th key={nom} colSpan={2} style={{ ...enTete, fontSize: 12 }}>{nom}</th>
                ))}
                <th rowSpan={2} style={{ ...enTete, minWidth: 130 }}>Remplaçants</th>
                {voitCreneaux && (
                  <th rowSpan={2} style={{ ...enTete, minWidth: 140 }}>Créneaux en moins</th>
                )}
              </tr>
              <tr>
                {colonnes.map(nom => (
                  <Fragment key={nom}>
                    <th style={sousEnTete}>Horaires</th>
                    <th style={enTeteNote}>Congé / HS</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {joursTries.map((iso, i) => {
                const d = decrire(iso)
                const ligne = index.get(iso)
                const nouvelleSemaine = i > 0 && semaineISO(iso) !== semaineISO(joursTries[i - 1])
                // Le numéro se pose sur le lundi. Quand le mois commence en
                // milieu de semaine — ou qu'un lundi férié manque au fichier —
                // il se pose sur le premier jour affiché de cette semaine :
                // une semaine sans numéro obligerait à le recompter.
                const premierDeLaSemaine = i === 0 || nouvelleSemaine
                return (
                  <Fragment key={iso}>
                    {/* Respiration entre les semaines, comme la ligne vide du fichier Excel :
                        sans elle, le mois se lit comme un seul bloc. */}
                    {nouvelleSemaine && (
                      <tr aria-hidden="true">
                        <td colSpan={colonnes.length * 2 + 3}
                            style={{ height: 14, border: 'none', background: 'transparent', padding: 0 }} />
                      </tr>
                    )}
                    <tr>
                    <td style={{
                      ...cellule, textAlign: 'left', paddingLeft: 10, fontWeight: 600,
                      background: ligne.infos.vacances ? COULEUR_VACANCES : 'var(--color-bg)',
                      // Sur le jaune vif, l'encre reste sombre quel que soit le thème : en
                      // mode sombre, var(--color-text) est clair et devient illisible.
                      color: ligne.infos.vacances ? ENCRE_SUR_JAUNE : 'var(--color-text)',
                      boxShadow: iso === aujourdHui ? 'inset 3px 0 0 var(--color-primary)' : 'none',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span>{d.court}</span>
                        {premierDeLaSemaine && (
                          <span title={`Semaine ${semaineISO(iso)}`} style={badgeSemaine(ligne.infos.vacances)}>
                            S{semaineISO(iso)}
                          </span>
                        )}
                      </span>
                    </td>
                    {colonnes.map(nom => {
                      const c = ligne.cases.get(nom)
                      const moities = moitiesCase(c)
                      const nature = natureNote(c?.note)
                      // Cerclage : brouillon en pointillé, modification enregistrée en
                      // plein, retour au fichier en attente de publication en ambre.
                      const marque = c?.brouillon
                        ? { outline: '2px dashed var(--color-primary)', outlineOffset: -2, titre: 'Modification pas encore enregistrée' }
                        : c?.modif?.retour
                          ? { boxShadow: 'inset 0 0 0 2px var(--color-amber)', titre: 'Retour au fichier — publication dans le quart d\'heure' }
                          : c?.modif
                            ? { boxShadow: 'inset 0 0 0 2px var(--color-primary)', titre: `Modifiée dans le dashboard le ${new Date(c.modif.maj_le).toLocaleDateString('fr-FR')} — le fichier dit : ${resumeCase(c.modif.fichier)}` }
                            : null
                      return (
                        <Fragment key={nom}>
                          {/* Horaires : le poste reste intact, même en congé —
                              c'est celui que le remplaçant vient couvrir.
                              Une journée coupée porte DEUX bandes de couleur, une
                              par demi-journée : le vendredi « CPRE le matin, Bloc B
                              l'après-midi » doit se lire d'un coup d'œil, comme
                              dans le fichier Excel qui peint deux cellules. */}
                          <td style={{
                                ...cellule, padding: 0,
                                cursor: peutModifier && c ? 'pointer' : 'default',
                                outline: marque?.outline, outlineOffset: marque?.outlineOffset, boxShadow: marque?.boxShadow,
                              }}
                              title={marque?.titre ?? (peutModifier && c ? 'Cliquer pour modifier' : undefined)}
                              onClick={peutModifier && c ? () => setEdition({ jour: iso, iade: nom }) : undefined}>
                            <div style={{
                              display: 'flex', flexDirection: 'column',
                              height: '100%', minHeight: 34,
                            }}>
                              {moities.map((m, k) => {
                                const fond = couleurPoste(m.poste)
                                return (
                                  <div key={k} style={{
                                    flex: 1, display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', padding: '1px 3px',
                                    background: fond ?? 'transparent',
                                    color: fond ? '#fff' : 'var(--color-text-secondary)',
                                    fontWeight: fond ? 600 : 400,
                                  }}>
                                    {m.texte}
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                          <td style={celluleNote(nature)}>
                            {nature ? libelleNote(c.note) : ''}
                          </td>
                        </Fragment>
                      )
                    })}
                    <td style={{ ...cellule, fontSize: 10, color: 'var(--color-text-secondary)' }}>
                      {(() => {
                        const duFichier = ligne.infos.remplacants ?? []
                        const connus = new Set(duFichier.map(n => n.trim().toLowerCase()))
                        const duDashboard = (remplaDashboard.get(iso) ?? [])
                          .filter(n => !connus.has(n.trim().toLowerCase()))
                        return (
                          <>
                            {duFichier.join(' · ')}
                            {duFichier.length > 0 && duDashboard.length > 0 && ' · '}
                            {duDashboard.map((nom, k) => (
                              <span key={nom} title="Saisi dans l'onglet « Rempla », pas encore dans le fichier"
                                    style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                                {k > 0 && ' · '}{nom}
                              </span>
                            ))}
                          </>
                        )
                      })()}
                    </td>
                    {/* Salles qui ne tournent pas — saisies dans l'onglet « Créneaux ».
                        Bloc B : un compte, « −2 salles le matin », parce qu'un
                        opérateur = une salle et que c'est le nombre qui sert. Les
                        noms restent dessous, en petit. Bloc A : la salle nommée,
                        journée entière en rouge, demi-journée en brun.
                        Colonne absente pour un compte IADE (cf. en-tête du fichier). */}
                    {voitCreneaux && (
                      <td style={{
                        ...cellule, fontSize: 10, color: 'var(--color-text-secondary)',
                        textAlign: 'left', padding: '2px 6px',
                      }}>
                        {(() => {
                          const duJour = creneauxParJour.get(iso) ?? []
                          const bilan = bilanBlocB(duJour)
                          const blocA = duJour.filter(c => c.secteur !== 'B')
                          return (
                            <>
                              {bilan.lignes.length > 0 && (
                                <div style={{ lineHeight: 1.3 }}>
                                  {segmentsBilanB(bilan).map(s => (
                                    <div key={s} style={{ color: COULEUR_CONGE, fontWeight: 700, fontSize: 11 }}>{s}</div>
                                  ))}
                                  <div style={{ color: 'var(--color-text-tertiary)', fontSize: 9 }}>
                                    Bloc B · {bilan.lignes.map(c => c.absent).join(', ')}
                                  </div>
                                </div>
                              )}
                              {blocA.map(c => (
                                <div key={`${c.moment}-${c.salle}`} style={{
                                  color: c.moment === 'journee' ? COULEUR_CONGE : '#9A5B12',
                                  fontWeight: 600, lineHeight: 1.3,
                                }}>
                                  {resumeCreneau(c)}
                                </div>
                              ))}
                            </>
                          )
                        })()}
                      </td>
                    )}
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Légende : les mêmes couleurs que le fichier Excel ── */}
      {joursTries.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, color: 'var(--color-text-secondary)' }}>
          {Object.entries(POSTES).map(([cle, p]) => (
            <span key={cle} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: p.couleur }} />
              {p.libelle}
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              background: COULEUR_CONGE, color: '#fff', fontSize: 10, fontWeight: 700,
              padding: '1px 6px', borderRadius: 3,
            }}>Congé</span>
            Colonne « Congé / HS » — les horaires restent affichés à côté, c'est le poste
            que couvre le remplaçant
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              background: COULEUR_HS, color: '#7A4A0B', fontSize: 10, fontWeight: 700,
              padding: '1px 6px', borderRadius: 3,
            }}>+10 h</span>
            Heures supplémentaires, dans la même colonne
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: COULEUR_VACANCES }} />
            Vacances scolaires
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, boxShadow: 'inset 0 0 0 2px var(--color-primary)' }} />
            Case modifiée dans le dashboard — le fichier Dropbox la reprend dans le quart d'heure
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Nom</span>
            Remplaçant saisi dans « Rempla » (pas encore dans le fichier)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: COULEUR_CONGE, fontWeight: 700 }}>−2 salles le matin</span>
            Bloc B, un opérateur absent = une salle en moins
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: COULEUR_CONGE, fontWeight: 600 }}>Dr X</span>
            <span style={{ color: '#9A5B12', fontWeight: 600 }}>/ Dr X — matin</span>
            Bloc A, l'opérateur absent — le moment n'est dit que pour une demi-journée
          </span>
        </div>
      )}

      {edition && (
        <CaseEditeur
          jour={edition.jour}
          iade={edition.iade}
          caseAffichee={caseBaseEnEdition}
          brouillon={brouillon.get(cleCase(edition.jour, edition.iade)) ?? null}
          onAppliquer={appliquerBrouillon}
          onRevenirFichier={revenirFichier}
          onFermer={() => setEdition(null)}
        />
      )}
    </div>
  )
}
