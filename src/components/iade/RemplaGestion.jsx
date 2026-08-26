// ============================================================
// RemplaGestion — onglet « Rempla » : chercher, puis nommer les remplaçants IADE.
//
// Trois temps, dans l'ordre où ça se passe vraiment :
//   1. on désigne les jours où il manque quelqu'un (calendrier, ou suggestions
//      tirées des congés posés — c'est là qu'il faut un remplaçant neuf fois
//      sur dix) ;
//   2. on copie le mail de recherche et on l'envoie ;
//   3. quand quelqu'un répond, on inscrit son nom en face du jour et on valide.
//      Le nom apparaît alors dans l'onglet « Planning IADE ».
//
// Tout se défait : dévalider garde le nom, retirer un jour ne touche pas les
// autres, rien n'est définitif. C'est la partie du module qui bouge le plus.
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react'
import CalendrierRempla from './CalendrierRempla'
import {
  chargerRemplacements, ouvrirBesoins, majBesoin,
  validerBesoin, devaliderBesoin, supprimerBesoins,
} from '../../utils/iadeRemplaApi'
import {
  MAX_PAR_JOUR, STATUTS_REMPLA, libelleStatutRempla, indexerBesoins, actionClicJour,
  suggestionsDepuisConges, texteMailRempla, verifierNom, joursEntre, periodeLongue,
} from '../../utils/iadeRempla'
import { formatJour, libelleType, bornesMois } from '../../utils/iadeConges'
import { MOIS_FR } from '../../utils/calendrier'

export default function RemplaGestion({ annee, conges = [], agents = [] }) {
  const maintenant = new Date()
  const [mois, setMois] = useState(maintenant.getMonth())
  const [besoins, setBesoins] = useState([])
  const [charge, setCharge]   = useState(true)
  const [erreur, setErreur]   = useState(null)
  const [succes, setSucces]   = useState(null)
  const [enCours, setEnCours] = useState(null)

  // Dernier jour cliqué : point d'ancrage de « Maj + clic ».
  const [ancre, setAncre] = useState(null)
  // Saisie en cours des noms, par ligne — tant qu'on n'a pas enregistré.
  const [saisies, setSaisies] = useState({})
  // Portée de la liste ET du mail : le mois qu'on regarde, ou tout ce qui reste.
  const [portee, setPortee] = useState('mois')
  // Mail retouché à la main : tant qu'il l'est, on ne le régénère pas sous les doigts.
  const [brouillon, setBrouillon] = useState(null)
  const [copie, setCopie] = useState(false)

  const charger = useCallback(async () => {
    setCharge(true)
    try {
      setBesoins(await chargerRemplacements(annee))
      setErreur(null)
    } catch {
      setErreur('Impossible de charger les remplacements.')
    } finally {
      setCharge(false)
    }
  }, [annee])

  // Chargement initial et à chaque changement d'année (asynchrone).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { charger() }, [charger])

  const nomDe = useCallback(
    (id) => agents.find(a => a.id === id)?.nom ?? 'Agent',
    [agents]
  )

  const parJour = useMemo(() => indexerBesoins(besoins), [besoins])

  // Qui est absent quel jour — sert à souligner les cases du calendrier.
  const absences = useMemo(() => {
    const index = new Map()
    for (const c of conges) {
      if (c.statut === 'refusee') continue
      if (!index.has(c.jour)) index.set(c.jour, [])
      index.get(c.jour).push({ nom: nomDe(c.user_id), statut: c.statut })
    }
    return index
  }, [conges, nomDe])

  const suggestions = useMemo(
    () => suggestionsDepuisConges(conges, besoins, { nomDe }),
    [conges, besoins, nomDe]
  )

  const { debut: debutMois, fin: finMois } = bornesMois(annee, mois)
  const listes = useMemo(() => {
    const dansLaPortee = portee === 'mois'
      ? besoins.filter(b => b.jour >= debutMois && b.jour <= finMois)
      : besoins
    return {
      affiches: [...dansLaPortee].sort((a, b) => a.jour.localeCompare(b.jour) || a.rang - b.rang),
      aChercher: dansLaPortee.filter(b => b.statut === 'recherche'),
    }
  }, [besoins, portee, debutMois, finMois])

  const mailGenere = useMemo(() => texteMailRempla(listes.aChercher), [listes.aChercher])
  const mail = brouillon ?? mailGenere

  // ── Actions ─────────────────────────────────────────────────────────────
  // Toutes rechargent depuis la base : deux personnes peuvent travailler dessus
  // en même temps, et l'écran doit montrer l'état réel, pas ce qu'on espérait.
  async function agir(quoi, cle = 'global') {
    setErreur(null); setSucces(null); setEnCours(cle)
    try {
      const message = await quoi()
      if (message) setSucces(message)
      await charger()
    } catch (err) {
      setErreur(err?.message ?? 'Action impossible. Réessayez.')
    } finally {
      setEnCours(null)
    }
  }

  function clicJour(iso, { plage } = {}) {
    if (plage && ancre) {
      const jours = joursEntre(ancre, iso).filter(j => !parJour.has(j))
      setAncre(iso)
      if (jours.length === 0) return
      return agir(async () => {
        await ouvrirBesoins(jours.map(jour => ({ jour, rang: 1 })))
        return `${jours.length} jour(s) ajouté(s) à la recherche.`
      }, `jour-${iso}`)
    }

    setAncre(iso)
    const decision = actionClicJour(parJour.get(iso) ?? [])
    if (decision.action === 'rien') { setErreur(decision.motif); return }
    if (decision.action === 'ajouter') {
      return agir(async () => {
        await ouvrirBesoins([{ jour: iso, rang: decision.rang }])
        return decision.rang > 1
          ? `Deuxième remplaçant demandé le ${formatJour(iso)}.`
          : null
      }, `jour-${iso}`)
    }
    return agir(async () => {
      await supprimerBesoins(decision.ids)
      return null
    }, `jour-${iso}`)
  }

  function ajouterSuggestion(s) {
    return agir(async () => {
      await ouvrirBesoins(s.aCouvrir.map(jour => ({ jour, rang: 1 })))
      return `${s.aCouvrir.length} jour(s) ajouté(s) — absence de ${s.nom}.`
    }, `sug-${s.cle}`)
  }

  function valider(b) {
    const nom = saisies[b.id] ?? b.nom ?? ''
    const probleme = verifierNom(nom)
    if (probleme) { setErreur(probleme); return }
    return agir(async () => {
      await validerBesoin(b.id, nom)
      return `${nom.trim()} inscrit dans le planning le ${formatJour(b.jour)}.`
    }, b.id)
  }

  function devalider(b) {
    return agir(async () => {
      await devaliderBesoin(b.id)
      return `Remplaçant retiré du planning le ${formatJour(b.jour)} — le nom est conservé.`
    }, b.id)
  }

  function enregistrerNom(b) {
    const nom = (saisies[b.id] ?? '').trim()
    return agir(async () => {
      await majBesoin(b.id, { nom: nom || null })
      return 'Nom enregistré.'
    }, b.id)
  }

  function retirer(b) {
    const quoi = b.nom ? `${b.nom} — ${formatJour(b.jour)}` : formatJour(b.jour)
    if (!confirm(`Retirer cette recherche de remplaçant ?\n\n${quoi}`)) return
    return agir(async () => {
      await supprimerBesoins([b.id])
      return null
    }, b.id)
  }

  async function copier() {
    setErreur(null)
    try {
      await navigator.clipboard.writeText(mail)
      setCopie(true)
      setTimeout(() => setCopie(false), 2500)
    } catch {
      setErreur('Copie automatique refusée par le navigateur : sélectionnez le texte et copiez-le à la main.')
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────
  const carte = {
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: 20,
  }
  const champ = {
    padding: '6px 10px', fontSize: 13,
    border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
  }
  const bouton = (variante) => ({
    fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `0.5px solid var(--color-${variante})`,
    background: variante === 'success' ? 'var(--color-success)' : 'transparent',
    color: variante === 'success' ? '#fff' : `var(--color-${variante})`,
  })
  const th = { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const td = { padding: '8px 14px', fontSize: 13, color: 'var(--color-text)', verticalAlign: 'middle' }
  const tr = { borderBottom: '0.5px solid var(--color-border)' }
  const badge = (statut) => ({
    fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
    background: STATUTS_REMPLA[statut]?.fond, color: STATUTS_REMPLA[statut]?.couleur,
  })
  const titre = { fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12 }

  const restants = besoins.filter(b => b.statut === 'recherche').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {erreur && <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px' }}>{erreur}</div>}
      {succes && <div style={{ fontSize: 13, color: 'var(--color-success)', background: 'var(--color-success-light)', borderRadius: 8, padding: '10px 14px' }}>{succes}</div>}

      {/* ── 1. Désigner les jours ── */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ ...carte, flex: '0 1 500px' }}>
          <div style={titre}>Où manque-t-il quelqu'un ?</div>
          <CalendrierRempla
            annee={annee}
            mois={mois}
            besoins={parJour}
            absences={absences}
            onNaviguer={(pas) => setMois(m => Math.min(11, Math.max(0, m + pas)))}
            onClicJour={clicJour}
          />
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {annee} — l'année se choisit en haut de page. Jusqu'à {MAX_PAR_JOUR} remplaçants par jour.
          </div>
        </div>

        <div style={{ ...carte, flex: '1 1 340px' }}>
          <div style={titre}>Suggestions d'après les congés</div>
          {suggestions.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              Aucune absence non couverte sur {annee}. Les congés posés par les IADE — demandés
              comme validés — apparaissent ici tant qu'aucun remplaçant n'est cherché sur ces jours.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
              {suggestions.map(s => (
                <div key={s.cle} style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                  padding: '8px 12px',
                }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{s.nom}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      {periodeLongue(s.debut, s.fin)} — {libelleType(s.type_conge).toLowerCase()}
                      {s.statut === 'en_attente' && ' (demandé, pas encore validé)'}
                    </div>
                  </div>
                  <button
                    type="button"
                    style={bouton('primary')}
                    disabled={enCours === `sug-${s.cle}`}
                    onClick={() => ajouterSuggestion(s)}
                  >
                    Chercher ({s.aCouvrir.length} j)
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 2. La liste, et le nom du remplaçant trouvé ── */}
      <div style={carte}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ ...titre, marginBottom: 0 }}>Remplaçants</div>
          <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Voir&nbsp;:
            <select value={portee} onChange={e => setPortee(e.target.value)} style={{ ...champ, marginLeft: 8 }}>
              <option value="mois">{MOIS_FR[mois]} {annee}</option>
              <option value="annee">toute l'année {annee}</option>
            </select>
          </label>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {restants > 0 ? `${restants} jour(s) encore à pourvoir sur l'année` : 'Tout est pourvu'}
          </span>
        </div>

        {charge ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Chargement…</div>
        ) : listes.affiches.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Aucun remplaçant cherché sur cette période. Cliquez les jours dans le calendrier,
            ou partez d'une suggestion.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr style={tr}>
                  <th style={th}>Jour</th>
                  <th style={th}>Remplaçant</th>
                  <th style={th}>État</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {listes.affiches.map(b => {
                  const saisi = saisies[b.id]
                  const valeur = saisi ?? b.nom ?? ''
                  const modifie = saisi !== undefined && saisi.trim() !== (b.nom ?? '').trim()
                  const occupe = enCours === b.id
                  return (
                    <tr key={b.id} style={tr}>
                      <td style={{ ...td, fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {formatJour(b.jour)}
                        {b.rang > 1 && (
                          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>
                            2ᵉ remplaçant
                          </span>
                        )}
                      </td>
                      <td style={td}>
                        <input
                          type="text"
                          value={valeur}
                          placeholder="Nom du remplaçant"
                          maxLength={80}
                          onChange={e => setSaisies(prev => ({ ...prev, [b.id]: e.target.value }))}
                          style={{ ...champ, width: 220 }}
                        />
                      </td>
                      <td style={td}><span style={badge(b.statut)}>{libelleStatutRempla(b.statut)}</span></td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {modifie && (
                            <button type="button" style={bouton('primary')} disabled={occupe} onClick={() => enregistrerNom(b)}>
                              Enregistrer
                            </button>
                          )}
                          {b.statut === 'recherche' ? (
                            <button type="button" style={bouton('success')} disabled={occupe} onClick={() => valider(b)}>
                              Valider
                            </button>
                          ) : (
                            <button type="button" style={bouton('amber')} disabled={occupe} onClick={() => devalider(b)}>
                              Dévalider
                            </button>
                          )}
                          <button type="button" style={bouton('danger')} disabled={occupe} onClick={() => retirer(b)}>
                            Retirer
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
          « Valider » inscrit le nom dans l'onglet <strong>Planning IADE</strong>, à la date concernée.
          « Dévalider » l'en retire <strong>en gardant le nom</strong> : un remplaçant qui se décommande
          puis revient se revalide d'un clic.
        </div>
      </div>

      {/* ── 3. Le mail de recherche ── */}
      <div style={carte}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ ...titre, marginBottom: 0 }}>Mail de recherche</div>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {listes.aChercher.length} jour(s) à pourvoir — {portee === 'mois' ? `${MOIS_FR[mois]} ${annee}` : `année ${annee}`}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {copie && <span style={{ fontSize: 12, color: 'var(--color-success)' }}>✓ Copié</span>}
            {brouillon !== null && (
              <button type="button" style={bouton('primary')} onClick={() => setBrouillon(null)}>
                Régénérer
              </button>
            )}
            <button
              type="button"
              onClick={copier}
              disabled={!mail}
              style={{
                padding: '8px 16px', background: mail ? 'var(--color-primary)' : 'var(--color-border)',
                color: '#fff', border: 'none', borderRadius: 'var(--radius-md)',
                fontSize: 13, fontWeight: 500, cursor: mail ? 'pointer' : 'not-allowed',
              }}
            >
              Copier le mail
            </button>
          </div>
        </div>

        {mail ? (
          <>
            <textarea
              value={mail}
              onChange={e => setBrouillon(e.target.value)}
              rows={18}
              style={{
                width: '100%', boxSizing: 'border-box', padding: 14,
                fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit',
                border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg)', color: 'var(--color-text)', resize: 'vertical',
              }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
              Le texte est modifiable avant d'être copié — ajoutez-y vos coordonnées, il n'en
              contient aucune. Vos retouches tiennent jusqu'à « Régénérer ».
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Rien à chercher sur cette période : le mail apparaîtra dès qu'un jour sera à pourvoir.
          </div>
        )}
      </div>
    </div>
  )
}
