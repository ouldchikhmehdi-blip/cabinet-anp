// ============================================================
// HeuresSupCase — les heures sup d'UN agent pour UN jour, depuis la case
// « Congé / HS » de l'onglet « Planning IADE » (ajouté le 2026-10-07).
//
// Ouvert d'un clic par la gestion IADE (mêmes droits que la modification d'une
// case). Trois gestes, chacun annoncé à l'agent par e-mail :
//   • ajouter des heures (elles naissent validées, comme depuis l'onglet « Heures
//     sup ») ;
//   • changer le nombre — c'est une décision de gestion : la ligne passe validée ;
//   • supprimer — l'agent est prévenu AVANT, le serveur relit la ligne pour la
//     décrire.
// La synthèse comptable lit cette même table : ce que la case affiche est ce qui
// part en paie.
//
// Contrairement à CaseEditeur, rien ne passe par le brouillon de la page : une
// heure sup est une ligne à part entière, enregistrée tout de suite.
// ============================================================
import { useEffect, useState } from 'react'
import {
  ajouterHeuresGestion, modifierHeuresGestion, supprimerHeuresGestion, notifierHeuresSupBilan,
} from '../../utils/iadeHeuresSupApi'
import { decrire, natureNote } from '../../utils/iadePlanning'

const STATUTS = { validee: 'validées', en_attente: 'en attente de décision', refusee: 'refusées' }

function heuresValides(v) {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 24
}

export default function HeuresSupCase({ jour, colonne, caseAffichee, onFermer, onFait }) {
  const ligne = caseAffichee?.hs ?? null
  const agent = caseAffichee?.agent ?? null
  const [heures, setHeures] = useState(ligne ? String(ligne.heures) : '')
  const [enCours, setEnCours] = useState(false)
  const [confirmer, setConfirmer] = useState(false)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    const echap = (e) => { if (e.key === 'Escape' && !enCours) onFermer() }
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [onFermer, enCours])

  const d = decrire(jour)
  const nom = colonne.charAt(0).toUpperCase() + colonne.slice(1).toLowerCase()
  const date = `${d.libelleJour} ${String(d.jour).padStart(2, '0')}/${String(d.mois).padStart(2, '0')}`
  const enConge = natureNote(caseAffichee?.note) === 'conge'
  const prevenu = (bilan) => (bilan?.notified > 0 ? `${nom} a été prévenu(e) par e-mail.` : `${nom} n'a pas pu être prévenu(e) par e-mail.`)

  async function executer(action, geste) {
    setEnCours(true); setErreur(null)
    try {
      const message = await action()
      onFait(message, geste)
    } catch (e) {
      setErreur(e?.code === '23505'
        ? 'Une ligne d\'heures sup existe déjà pour ce jour : rechargez la page.'
        : `Enregistrement impossible : ${e?.message || 'erreur inconnue'}.`)
      setEnCours(false)
    }
  }

  function ajouter() {
    if (!heuresValides(heures)) { setErreur('Un nombre entier d\'heures, de 1 à 24.'); return }
    executer(async () => {
      const creee = await ajouterHeuresGestion({ userId: agent.id, jour, heures })
      const bilan = await notifierHeuresSupBilan({ type: 'ajout', ids: [creee.id] })
      return `${heures} h ajoutées à ${nom} le ${date}. ${prevenu(bilan)}`
    }, 'ajout')
  }

  function enregistrer() {
    if (!heuresValides(heures)) { setErreur('Un nombre entier d\'heures, de 1 à 24.'); return }
    if (Number(heures) === Number(ligne.heures) && ligne.statut === 'validee') { onFermer(); return }
    executer(async () => {
      const avant = { [ligne.id]: ligne.heures }
      await modifierHeuresGestion(ligne.id, heures)
      const bilan = await notifierHeuresSupBilan({ type: 'modif_gestion', ids: [ligne.id], avant })
      return `Heures sup de ${nom} le ${date} : ${ligne.heures} h → ${heures} h. ${prevenu(bilan)}`
    }, 'modification')
  }

  function supprimer() {
    executer(async () => {
      // Prévenir d'abord : après la suppression, il n'y aurait plus rien à relire.
      const bilan = await notifierHeuresSupBilan({ type: 'suppression_gestion', ids: [ligne.id] })
      await supprimerHeuresGestion(ligne.id)
      return `Heures sup de ${nom} le ${date} supprimées (${ligne.heures} h). ${prevenu(bilan)}`
    }, 'suppression')
  }

  // ── Styles (ceux de CaseEditeur) ─────────────────────────────────────────
  const champ = {
    width: 90, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box',
    border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
  }
  const bouton = (variante) => ({
    fontSize: 13, padding: '7px 14px', borderRadius: 'var(--radius-md)', cursor: enCours ? 'default' : 'pointer',
    border: `0.5px solid var(--color-${variante})`, opacity: enCours ? 0.6 : 1,
    background: variante === 'primary' ? 'var(--color-primary)' : 'transparent',
    color: variante === 'primary' ? '#fff' : `var(--color-${variante})`,
  })
  const note = { fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Heures sup de ${nom}, ${d.court}`}
         onMouseDown={e => { if (e.target === e.currentTarget && !enCours) onFermer() }}
         style={{
           position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.35)',
           display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
         }}>
      <div style={{
        background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)', padding: 20, width: '100%', maxWidth: 420,
        display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>
            Heures sup — {nom}, {date}
          </div>
          <div style={{ ...note, marginTop: 2 }}>
            {ligne
              ? <>En base : <strong>{ligne.heures} h</strong>, {STATUTS[ligne.statut] ?? ligne.statut}
                  {ligne.origine === 'iade' ? ', déclarées par l\'agent' : ', ajoutées par la gestion'}.</>
              : 'Aucune heure sup en base pour ce jour.'}
          </div>
        </div>

        {!agent ? (
          <div style={{ ...note, color: 'var(--color-amber)' }}>
            {caseAffichee?.agentRaison === 'ambigu'
              ? `Plusieurs comptes actifs portent le prénom « ${nom} » : impossible de savoir à qui rattacher ces heures. Saisissez-les depuis l'onglet « Congés, HS et rempla ».`
              : `Aucun compte IADE actif ne correspond à la colonne « ${nom} ». Les heures sup se rattachent à un compte : créez-le, ou saisissez-les depuis l'onglet « Congés, HS et rempla ».`}
          </div>
        ) : (
          <>
            {enConge && (
              <div style={{ ...note, color: 'var(--color-amber)' }}>
                {nom} est en congé ce jour-là : le congé reste affiché dans la case, les heures sup comptent quand même dans la synthèse.
              </div>
            )}
            {caseAffichee?.hsFichier && !ligne && (
              <div style={{ ...note, color: 'var(--color-amber)' }}>
                La case affiche « {caseAffichee.note} », mais aucune ligne validée ne la porte : la note vient
                du fichier Excel, ou attend la republication. Elle n'entre pas dans la synthèse comptable ;
                à corriger dans le fichier si elle est fausse.
              </div>
            )}
            {ligne?.statut === 'en_attente' && (
              <div style={note}>
                Déclaration en attente du MAR désigné. Enregistrer la valide avec le nombre saisi.
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', width: 84 }}>Heures</span>
              <input style={champ} type="number" min={1} max={24} step={1} value={heures} autoFocus
                     disabled={enCours}
                     onChange={e => { setErreur(null); setConfirmer(false); setHeures(e.target.value) }}
                     onKeyDown={e => { if (e.key === 'Enter') (ligne ? enregistrer : ajouter)() }} />
              <span style={note}>h</span>
            </div>
          </>
        )}

        {erreur && <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>{erreur}</div>}

        {confirmer && (
          <div style={{ ...note, color: 'var(--color-danger)' }}>
            Supprimer les {ligne.heures} h de {nom} le {date} ? Elles disparaîtront de la synthèse comptable,
            et {nom} en sera prévenu(e) par e-mail.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {agent && ligne && (
            confirmer
              ? <button type="button" style={{ ...bouton('danger'), marginRight: 'auto' }} disabled={enCours} onClick={supprimer}>
                  Confirmer la suppression
                </button>
              : <button type="button" style={{ ...bouton('danger'), marginRight: 'auto' }} disabled={enCours} onClick={() => setConfirmer(true)}>
                  Supprimer
                </button>
          )}
          <button type="button" style={{ ...bouton('text-secondary'), marginLeft: agent && ligne ? 0 : 'auto' }}
                  disabled={enCours} onClick={onFermer}>
            {agent ? 'Annuler' : 'Fermer'}
          </button>
          {agent && (
            <button type="button" style={bouton('primary')} disabled={enCours} onClick={ligne ? enregistrer : ajouter}>
              {enCours ? 'Enregistrement…' : ligne ? 'Enregistrer' : 'Ajouter'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
