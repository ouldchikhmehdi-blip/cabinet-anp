// ============================================================
// IadePlanning — « Planning IADE », le même écran pour les agents IADE et les
// associés MAR : mêmes données, mêmes droits (lecture seule).
//
// La source est le fichier Excel du planning, republié chaque nuit depuis le
// mini PC (cf. IADE.md § « Planning IADE » et Projects/outils-planning). Aucune
// écriture ici : une correction se fait dans le fichier, sinon les deux versions
// divergent et plus personne ne sait laquelle croire.
//
// Deux niveaux de lecture : le bandeau du jour (qui est où — lisible sur
// téléphone) et la grille du mois (la vue d'ensemble que l'équipe connaît).
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { chargerMois, chargerDerniereMaj } from '../utils/iadePlanningApi'
import {
  POSTES, COULEUR_CONGE, COULEUR_HS, COULEUR_VACANCES,
  couleurPoste, decrire, colonnesDuMois, indexerParJour, texteCase, jourParDefaut,
} from '../utils/iadePlanning'
import { moisAnneeFR } from '../utils/calendrier'

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
  const [donnees, setDonnees] = useState({ annee: null, mois: null, cases: [], jours: [] })
  const [maj, setMaj] = useState(null)
  const [echec, setEchec] = useState(null)
  const [jourChoisi, setJourChoisi] = useState(null)

  useEffect(() => {
    let vivant = true
    Promise.all([chargerMois(annee, mois), chargerDerniereMaj()])
      .then(([d, m]) => {
        if (!vivant) return
        setDonnees({ annee, mois, ...d })
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

  // Le jour du bandeau suit le mois affiché : celui que l'on a cliqué s'il est
  // dans le mois, sinon aujourd'hui, sinon le premier jour — jamais un jour d'un
  // autre mois, qui n'aurait pas de sens ici.
  const jourOuvert = jourChoisi && index.has(jourChoisi)
    ? jourChoisi
    : jourParDefaut(index, aujourdHui)

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
  const cellule = {
    border: '0.5px solid var(--color-border)', padding: 0,
    minWidth: 108, height: 34, textAlign: 'center', fontSize: 11,
  }
  const enTete = {
    ...cellule, position: 'sticky', top: 0, zIndex: 2, height: 30,
    background: 'var(--color-bg)', fontWeight: 600, color: 'var(--color-text)',
  }

  const jour = jourOuvert ? index.get(jourOuvert) : null
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

      {/* ── Bandeau du jour : qui est où, lisible sans faire défiler la grille ── */}
      {jour && (
        <div style={carte}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
              {decrire(jour.infos.jour).libelleJour} {decrire(jour.infos.jour).jour}
            </span>
            {jour.infos.jour === aujourdHui && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)',
              }}>aujourd'hui</span>
            )}
            {jour.infos.vacances && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                background: COULEUR_VACANCES, color: '#2C2C2A',
              }}>vacances scolaires</span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {colonnes.map(nom => {
              const c = jour.cases.get(nom)
              const t = texteCase(c)
              const fond = couleurPoste(c?.poste)
              return (
                <div key={nom} style={{
                  border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '4px 8px', fontSize: 11, fontWeight: 600,
                    color: 'var(--color-text-secondary)', background: 'var(--color-bg)',
                  }}>{nom}</div>
                  <div style={{
                    padding: '8px', fontSize: 12, fontWeight: 600, textAlign: 'center',
                    background: fond ?? 'transparent',
                    color: fond ? '#fff' : 'var(--color-text-secondary)',
                  }}>
                    {t.haut || '—'}{t.bas && <><br />{t.bas}</>}
                  </div>
                  {c?.note && (
                    <div style={{
                      padding: '3px 8px', fontSize: 11, fontWeight: 600, textAlign: 'center',
                      background: c.note.startsWith('Congé') ? COULEUR_CONGE : COULEUR_HS,
                      color: c.note.startsWith('Congé') ? '#fff' : '#9A5B12',
                    }}>{c.note}</div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Remplaçants : {jour.infos.remplacants?.length
              ? <strong style={{ color: 'var(--color-text)' }}>{jour.infos.remplacants.join(' · ')}</strong>
              : 'aucun'}
          </div>
        </div>
      )}

      {/* ── Grille du mois : la vue d'ensemble, comme dans le fichier ── */}
      {joursTries.length > 0 && (
        <div style={{ ...carte, padding: 0, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...enTete, minWidth: 92, textAlign: 'left', paddingLeft: 10, zIndex: 3 }}>Jour</th>
                {colonnes.map(nom => <th key={nom} style={enTete}>{nom}</th>)}
                <th style={{ ...enTete, minWidth: 130 }}>Remplaçants</th>
              </tr>
            </thead>
            <tbody>
              {joursTries.map(iso => {
                const d = decrire(iso)
                const ligne = index.get(iso)
                const actif = iso === jourOuvert
                return (
                  <tr key={iso}
                      onClick={() => setJourChoisi(iso)}
                      style={{ cursor: 'pointer', outline: actif ? '2px solid var(--color-primary)' : 'none' }}>
                    <td style={{
                      ...cellule, textAlign: 'left', paddingLeft: 10, fontWeight: 600,
                      background: ligne.infos.vacances ? COULEUR_VACANCES : 'var(--color-bg)',
                      color: 'var(--color-text)',
                    }}>
                      {d.court}
                    </td>
                    {colonnes.map(nom => {
                      const c = ligne.cases.get(nom)
                      const t = texteCase(c)
                      const fond = couleurPoste(c?.poste)
                      return (
                        <td key={nom} style={{
                          ...cellule, background: fond ?? 'transparent',
                          color: fond ? '#fff' : 'var(--color-text-secondary)',
                          fontWeight: fond ? 600 : 400,
                        }}>
                          <div>{t.haut}{t.bas && <><br />{t.bas}</>}</div>
                          {c?.note && (
                            <div style={{
                              fontSize: 9, fontWeight: 700, marginTop: 1,
                              color: c.note.startsWith('Congé') ? COULEUR_CONGE : '#9A5B12',
                              background: '#fff', borderRadius: 3, display: 'inline-block', padding: '0 4px',
                            }}>{c.note}</div>
                          )}
                        </td>
                      )
                    })}
                    <td style={{ ...cellule, fontSize: 10, color: 'var(--color-text-secondary)' }}>
                      {ligne.infos.remplacants?.join(' · ') || ''}
                    </td>
                  </tr>
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
            <span style={{ width: 12, height: 12, borderRadius: 3, background: COULEUR_CONGE }} />
            Congé (le poste reste affiché : c'est celui que couvre le remplaçant)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: COULEUR_VACANCES }} />
            Vacances scolaires
          </span>
        </div>
      )}
    </div>
  )
}
