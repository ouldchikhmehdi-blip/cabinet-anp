// ============================================================
// IadePlanning — « Planning IADE », le même écran pour les agents IADE et les
// associés MAR : mêmes données, mêmes droits (lecture seule).
//
// La source est le fichier Excel du planning, republié chaque nuit depuis le
// mini PC (cf. IADE.md § « Planning IADE » et Projects/outils-planning). Aucune
// écriture ici : une correction se fait dans le fichier, sinon les deux versions
// divergent et plus personne ne sait laquelle croire.
//
// UNE exception, la colonne des remplaçants : les noms validés dans l'onglet
// « Rempla » y sont ajoutés à ceux du fichier, et signalés comme tels. Ils vivent
// dans leur propre table, que la republication nocturne ne touche pas — sans quoi
// un remplaçant saisi le soir aurait disparu le lendemain matin.
// ============================================================
import { Fragment, useEffect, useMemo, useState } from 'react'
import { chargerMois, chargerDerniereMaj } from '../utils/iadePlanningApi'
import { chargerRemplacantsPourvus } from '../utils/iadeRemplaApi'
import { chargerCreneauxPeriode } from '../utils/iadeCreneauxApi'
import { indexerParJour as indexerCreneaux, resume as resumeCreneau } from '../utils/iadeCreneaux'
import {
  POSTES, COULEUR_CONGE, COULEUR_HS, COULEUR_VACANCES,
  couleurPoste, decrire, bornesDuMois, colonnesDuMois, indexerParJour, texteCase,
  semaineISO, natureNote, libelleNote,
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

export default function IadePlanning() {
  const aujourdHui = isoAujourdHui()
  const [annee, setAnnee] = useState(() => Number(aujourdHui.slice(0, 4)))
  const [mois, setMois] = useState(() => Number(aujourdHui.slice(5, 7)))
  // Les données portent le mois qu'elles décrivent : « en chargement » et
  // « en erreur » s'en déduisent, plutôt que d'être remis à zéro à la main à
  // chaque changement de mois (deux états à garder d'accord, donc un à oublier).
  const [donnees, setDonnees] = useState({ annee: null, mois: null, cases: [], jours: [], rempla: [], creneaux: [] })
  const [maj, setMaj] = useState(null)
  const [echec, setEchec] = useState(null)

  useEffect(() => {
    let vivant = true
    const { debut, fin } = bornesDuMois(annee, mois)
    Promise.all([
      chargerMois(annee, mois), chargerDerniereMaj(),
      chargerRemplacantsPourvus(debut, fin), chargerCreneauxPeriode(debut, fin),
    ])
      .then(([d, m, r, c]) => {
        if (!vivant) return
        setDonnees({ annee, mois, ...d, rempla: r, creneaux: c })
        setMaj(m)
      })
      .catch(e => {
        if (vivant) setEchec({ annee, mois, message: e.message || 'Chargement impossible.' })
      })
    return () => { vivant = false }
  }, [annee, mois])

  const aJour = donnees.annee === annee && donnees.mois === mois
  const erreur = echec && echec.annee === annee && echec.mois === mois ? echec.message : null
  const chargement = !aJour && !erreur

  // Le mois précédent ne doit pas rester affiché pendant le chargement du suivant.
  const cases = useMemo(() => (aJour ? donnees.cases : []), [aJour, donnees.cases])
  const jours = useMemo(() => (aJour ? donnees.jours : []), [aJour, donnees.jours])
  const colonnes = useMemo(() => colonnesDuMois(cases), [cases])
  const index = useMemo(() => indexerParJour(cases, jours), [cases, jours])
  const joursTries = useMemo(() => [...index.keys()].sort(), [index])

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

  const vide = !chargement && !erreur && joursTries.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
          Planning IADE
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
          Le planning de l'équipe IADE, en lecture seule. Il reprend le fichier du planning,
          republié chaque nuit : une correction se fait dans le fichier, jamais ici.
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
                <th rowSpan={2} style={{ ...enTete, minWidth: 92, textAlign: 'left', paddingLeft: 10, zIndex: 3 }}>Jour</th>
                {colonnes.map(nom => (
                  <th key={nom} colSpan={2} style={{ ...enTete, fontSize: 12 }}>{nom}</th>
                ))}
                <th rowSpan={2} style={{ ...enTete, minWidth: 130 }}>Remplaçants</th>
                <th rowSpan={2} style={{ ...enTete, minWidth: 140 }}>Créneaux en moins</th>
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
                      {d.court}
                    </td>
                    {colonnes.map(nom => {
                      const c = ligne.cases.get(nom)
                      const t = texteCase(c)
                      const fond = couleurPoste(c?.poste)
                      const nature = natureNote(c?.note)
                      return (
                        <Fragment key={nom}>
                          {/* Horaires : le poste reste intact, même en congé —
                              c'est celui que le remplaçant vient couvrir. */}
                          <td style={{
                            ...cellule, background: fond ?? 'transparent',
                            color: fond ? '#fff' : 'var(--color-text-secondary)',
                            fontWeight: fond ? 600 : 400,
                          }}>
                            {t.haut}{t.bas && <><br />{t.bas}</>}
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
                        Journée entière en rouge, demi-journée en brun : la nuance
                        se lit sans avoir à relire le texte. */}
                    <td style={{
                      ...cellule, fontSize: 10, color: 'var(--color-text-secondary)',
                      textAlign: 'left', padding: '2px 6px',
                    }}>
                      {(creneauxParJour.get(iso) ?? []).map(c => (
                        <div key={`${c.moment}-${c.salle}`} style={{
                          color: c.moment === 'journee' ? COULEUR_CONGE : '#9A5B12',
                          fontWeight: 600, lineHeight: 1.3,
                        }}>
                          {resumeCreneau(c)}
                        </div>
                      ))}
                    </td>
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
            <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Nom</span>
            Remplaçant saisi dans « Rempla » (pas encore dans le fichier)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: COULEUR_CONGE, fontWeight: 600 }}>Salle — journée</span>
            <span style={{ color: '#9A5B12', fontWeight: 600 }}>/ demi-journée</span>
            Créneaux en moins
          </span>
        </div>
      )}
    </div>
  )
}
