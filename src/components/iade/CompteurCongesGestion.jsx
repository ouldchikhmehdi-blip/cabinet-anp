// ============================================================
// CompteurCongesGestion — recopier le bloc « CONGES » des bulletins de paie,
// tous les agents d'un coup pour un mois donné.
//
// C'est une TRANSCRIPTION : on recopie ce que la paie imprime, le dashboard ne
// calcule rien et ne rapproche rien de ses propres jours validés. Le solde est
// la seule chose calculée (Acquis − Pris), et il n'est pas enregistré.
//
// Deux règles qui gouvernent l'enregistrement :
//   • on n'écrit QUE les agents dont une case a changé. Réécrire tout le monde
//     remettrait maj_par / maj_le à jour pour des bulletins que personne n'a
//     relus, et c'est la seule trace de qui a recopié quoi ;
//   • un agent dont on a vidé les six cases est SUPPRIMÉ, pas enregistré à
//     blanc : la contrainte `non_vide` le refuse, et c'est l'absence de ligne
//     qui dit « aucun bulletin recopié ».
//
// Composant séparé volontairement : un bloc lourd inline dans IadeGestion avait
// déjà cassé la mémoïsation de React (cf. SyntheseMensuelle, IADE.md § 3).
// ============================================================
import { useMemo, useState } from 'react'
import { MOIS_FR } from '../../utils/calendrier'
import {
  LIGNES, CHAMPS_JOURS, formatSolde, verifierCompteur, estVide,
  versColonnes, versSaisie, memeSaisie, moisRef, libelleMoisRef,
} from '../../utils/iadeCompteurConges'
import { enregistrerCompteursConges, supprimerCompteursConges } from '../../utils/iadeCompteurCongesApi'

export default function CompteurCongesGestion({ compteurs = [], agents = [], annee, onChange }) {
  const maintenant = new Date()
  const [mois, setMois] = useState(maintenant.getMonth())
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [succes, setSucces] = useState(null)

  const parAgent = useMemo(() => {
    const index = new Map()
    for (const c of compteurs) index.set(c.user_id, c)
    return index
  }, [compteurs])

  // Les agents à afficher : les comptes actifs, plus tout compte inactif qui
  // porte encore un compteur — sinon on ne pourrait plus l'effacer.
  const lignesAgents = useMemo(
    () => agents.filter(a => a.actif || parAgent.has(a.id)),
    [agents, parAgent]
  )

  // Ce que la base dit, mis en forme pour la grille.
  const initiales = useMemo(() => {
    const out = {}
    for (const a of lignesAgents) out[a.id] = versSaisie(parAgent.get(a.id))
    return out
  }, [lignesAgents, parAgent])

  // Resynchronisation sans effet : quand la base change (après enregistrement
  // ou changement d'année), la grille repart de ce qu'elle dit.
  const [refInitiales, setRefInitiales] = useState(initiales)
  const [saisies, setSaisies] = useState(initiales)
  if (initiales !== refInitiales) {
    setRefInitiales(initiales)
    setSaisies(initiales)
  }

  function changer(userId, champ, valeur) {
    setSaisies(prev => ({ ...prev, [userId]: { ...prev[userId], [champ]: valeur } }))
    setSucces(null); setErreur(null)
  }

  const touches = lignesAgents.filter(a => !memeSaisie(saisies[a.id], initiales[a.id]))

  async function enregistrer() {
    if (touches.length === 0) return
    for (const a of touches) {
      const probleme = verifierCompteur(saisies[a.id])
      if (probleme) { setErreur(`${a.nom} — ${probleme}`); return }
    }
    const aEcrire = touches.filter(a => !estVide(saisies[a.id]))
    const aEffacer = touches.filter(a => estVide(saisies[a.id]) && parAgent.has(a.id))

    setEnvoi(true); setErreur(null); setSucces(null)
    try {
      await enregistrerCompteursConges(aEcrire.map(a => ({
        user_id: a.id, mois_ref: moisRef(annee, mois), ...versColonnes(saisies[a.id]),
      })))
      await supprimerCompteursConges(aEffacer.map(a => a.id))
      const parts = []
      if (aEcrire.length > 0) {
        parts.push(`${aEcrire.length} compteur(s) enregistré(s) d'après le bulletin de ${libelleMoisRef(moisRef(annee, mois))}`)
      }
      if (aEffacer.length > 0) parts.push(`${aEffacer.length} compteur(s) effacé(s)`)
      setSucces(`${parts.join(' · ')}. Chaque agent le voit dans « Mes congés ».`)
      await onChange?.()
    } catch (err) {
      setErreur(err?.code === '42501' || err?.code === 'PGRST301'
        ? "Enregistrement refusé : votre compte n'a pas le droit de modifier les compteurs."
        : `Enregistrement impossible${err?.message ? ` (${err.message})` : ''}. Réessayez.`)
    } finally {
      setEnvoi(false)
    }
  }

  const s = {
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', overflowX: 'auto',
    },
    tr: { borderBottom: '0.5px solid var(--color-border)' },
    th: {
      padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)',
      textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    },
    thAgent: {
      padding: '8px 14px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)',
      textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    },
    td: { padding: '5px 6px', textAlign: 'center' },
    tdAgent: { padding: '5px 14px', fontSize: 13, color: 'var(--color-text)', fontWeight: 500, whiteSpace: 'nowrap' },
    tdSolde: { padding: '5px 10px', fontSize: 13, fontWeight: 700, color: 'var(--color-text)', textAlign: 'center', whiteSpace: 'nowrap' },
    champ: {
      width: 68, padding: '6px 6px', fontSize: 13, textAlign: 'right', boxSizing: 'border-box',
      border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    champSelect: {
      padding: '7px 10px', fontSize: 13, border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
  }

  return (
    <div>
      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
          {erreur}
        </div>
      )}
      {succes && (
        <div style={{ fontSize: 13, color: 'var(--color-success)', background: 'var(--color-success-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
          {succes}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Bulletin de&nbsp;:
          <select value={mois} onChange={e => setMois(Number(e.target.value))}
                  style={{ ...s.champSelect, marginLeft: 8 }}>
            {MOIS_FR.map((m, i) => (
              <option key={m} value={i}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
            ))}
          </select>
        </label>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {annee} — l'année se choisit en haut de page. Ce mois n'est écrit que sur les agents que vous modifiez.
        </span>
      </div>

      <div style={s.carte}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead>
            <tr style={s.tr}>
              <th rowSpan={2} style={s.thAgent}>Agent</th>
              {LIGNES.map(l => (
                <th key={l.cle} colSpan={3} style={s.th}>{l.label}</th>
              ))}
            </tr>
            <tr style={s.tr}>
              {LIGNES.map(l => (
                <Entetes key={l.cle} style={s.th} />
              ))}
            </tr>
          </thead>
          <tbody>
            {lignesAgents.map(a => {
              const saisie = saisies[a.id] ?? {}
              const modifie = !memeSaisie(saisie, initiales[a.id])
              return (
                <tr key={a.id} style={{ ...s.tr, background: modifie ? 'var(--color-primary-light, transparent)' : 'transparent' }}>
                  <td style={s.tdAgent}>
                    {a.nom}
                    {!a.actif && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 400 }}> — compte inactif</span>
                    )}
                  </td>
                  {LIGNES.map(l => (
                    <Cellules
                      key={l.cle} ligne={l} saisie={saisie} styles={s}
                      nom={a.nom}
                      onChanger={(champ, valeur) => changer(a.id, champ, valeur)}
                    />
                  ))}
                </tr>
              )
            })}
            {lignesAgents.length === 0 && (
              <tr>
                <td colSpan={10} style={{ ...s.tdAgent, color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                  Aucun compte IADE.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
        <button onClick={enregistrer} disabled={envoi || touches.length === 0}
                style={{
                  padding: '10px 18px', background: 'var(--color-primary)', color: '#fff',
                  border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500,
                  cursor: envoi || touches.length === 0 ? 'default' : 'pointer',
                  opacity: envoi || touches.length === 0 ? 0.5 : 1,
                }}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          {touches.length === 0
            ? 'Rien de modifié.'
            : `${touches.length} agent(s) modifié(s) : ${touches.map(a => a.nom).join(', ')}.`}
        </span>
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 14, lineHeight: 1.6 }}>
        Laissez une case vide quand le bulletin la laisse vide — c'est le cas de la ligne N-1 le plus
        souvent. Un zéro écrit à la place d'un blanc ferait dire au dashboard ce que la paie n'a pas dit.
        Le <strong>solde</strong> se calcule tout seul (Acquis − Pris) et n'est pas enregistré. Vider les
        six cases d'un agent efface son compteur.
      </p>
    </div>
  )
}

// Les trois en-têtes d'une ligne du bulletin.
function Entetes({ style }) {
  return (
    <>
      <th style={style}>Acquis</th>
      <th style={style}>Pris</th>
      <th style={style}>Solde</th>
    </>
  )
}

// Acquis / Pris saisissables, solde calculé à la frappe.
// `type="text"` et non `type="number"` : ce dernier tient « 15,00 » pour
// invalide et renvoie une chaîne vide, donc la case s'effacerait sous les doigts
// de qui tape une virgule française. `inputMode="decimal"` donne quand même le
// pavé numérique sur iPhone et Android.
function Cellules({ ligne, saisie, styles, nom, onChanger }) {
  return (
    <>
      {[ligne.acquis, ligne.pris].map(champ => (
        <td key={champ} style={styles.td}>
          <input
            type="text" inputMode="decimal" autoComplete="off"
            aria-label={`${nom} — ${ligne.label} ${champ.endsWith('acquis') ? 'acquis' : 'pris'}`}
            value={saisie[champ] ?? ''}
            onChange={e => onChanger(champ, e.target.value)}
            placeholder="—"
            style={styles.champ}
          />
        </td>
      ))}
      <td style={styles.tdSolde}>{formatSolde(...[ligne.acquis, ligne.pris].map(c => parseCase(saisie[c])))}</td>
    </>
  )
}

// Le solde se calcule sur ce qui est tapé, pas sur ce qui est enregistré :
// la gestion doit voir « 7,00 » apparaître pendant qu'elle recopie.
function parseCase(texte) {
  const propre = String(texte ?? '').replace(/[\s\u00A0]/g, '').replace(',', '.')
  if (propre === '') return null
  const v = Number(propre)
  return Number.isFinite(v) ? v : null
}

// Garde-fou de cohérence : la grille doit couvrir exactement les six colonnes
// que la base connaît. Si LIGNES change sans que CHAMPS_JOURS suive, on veut
// l'apprendre au développement, pas devant un bulletin mal recopié.
if (import.meta.env?.DEV && CHAMPS_JOURS.length !== LIGNES.length * 2) {
  console.error('iadeCompteurConges : LIGNES et CHAMPS_JOURS ne concordent plus.')
}
