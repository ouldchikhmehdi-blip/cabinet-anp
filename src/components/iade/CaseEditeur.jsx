// ============================================================
// CaseEditeur — modifier UNE case du planning IADE depuis le dashboard.
//
// Ouvert d'un clic sur une case par la gestion IADE (cf. IadePlanning.jsx).
// Trois formes, celles du fichier : journée pleine (un texte), journée coupée
// (matin / après-midi), OFF. Le texte d'une demi-journée est celui que le fichier
// écrit — « 8h-18h B » — et les boutons de poste ne font que remplacer le poste
// dans ce texte : les horaires restent, le poste change de couleur. Le texte reste
// libre, volontairement : le fichier contient des cases comme « 13-18h Renfort A/B »
// qu'aucun formulaire à cases ne saurait dire.
//
// « Appliquer » ne touche pas la base : la case passe dans le brouillon de la page,
// enregistré d'un bloc avec les autres, pour que l'agent reçoive UN e-mail.
// ============================================================
import { useEffect, useState } from 'react'
import {
  LIBELLE_POSTE_CASE, POSTES, composerCase, formulaireDeCase, remplacerPoste,
  posteDepuisTexte, couleurPoste, resumeCase, decrire,
} from '../../utils/iadePlanning'

const MODES = [
  { cle: 'pleine', libelle: 'Journée' },
  { cle: 'coupee', libelle: 'Matin / Après-midi' },
  { cle: 'off', libelle: 'OFF' },
]

export default function CaseEditeur({ jour, iade, caseAffichee, brouillon, onAppliquer, onRevenirFichier, onFermer }) {
  // Le brouillon en cours l'emporte sur la case affichée : on rouvre ce qu'on
  // était en train de saisir, pas ce qui est en base.
  const [form, setForm] = useState(() => formulaireDeCase(brouillon?.type === 'modif' ? brouillon.cas : caseAffichee))
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    const echap = (e) => { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [onFermer])

  const apercu = composerCase(form)
  const modif = caseAffichee?.modif
  const dejaModifiee = modif && !modif.retour

  function appliquer() {
    if (!apercu) {
      setErreur(form.mode === 'off' ? null : 'Écrivez au moins une demi-journée, ou choisissez OFF.')
      if (form.mode !== 'off') return
    }
    onAppliquer(apercu)
  }

  const d = decrire(jour)
  const nom = iade.charAt(0).toUpperCase() + iade.slice(1).toLowerCase()

  // ── Styles ──────────────────────────────────────────────────────────────
  const champ = {
    flex: 1, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box', minWidth: 0,
    border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
  }
  const label = { fontSize: 12, color: 'var(--color-text-secondary)', width: 84, flexShrink: 0 }
  const segment = (actif) => ({
    flex: 1, padding: '7px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: `0.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-border)'}`,
    background: actif ? 'var(--color-primary)' : 'var(--color-bg)',
    color: actif ? '#fff' : 'var(--color-text-secondary)',
  })
  const puce = (poste, actif) => ({
    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
    border: `1.5px solid ${couleurPoste(poste)}`,
    background: actif ? couleurPoste(poste) : 'transparent',
    color: actif ? '#fff' : couleurPoste(poste),
  })
  const bouton = (variante) => ({
    fontSize: 13, padding: '7px 14px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
    border: `0.5px solid var(--color-${variante})`,
    background: variante === 'primary' ? 'var(--color-primary)' : 'transparent',
    color: variante === 'primary' ? '#fff' : `var(--color-${variante})`,
  })

  // Une demi-journée : le texte, et les postes à poser dedans.
  const ligne = (cle, libelle) => {
    const texte = form[cle]
    const posteActif = posteDepuisTexte(texte)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={label}>{libelle}</span>
          <input
            style={champ} value={texte} placeholder="ex. 8h-18h B"
            autoFocus={cle === 'matin' || form.mode === 'pleine'}
            onChange={e => { setErreur(null); setForm(f => ({ ...f, [cle]: e.target.value })) }}
            onKeyDown={e => { if (e.key === 'Enter') appliquer() }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 92 }}>
          {Object.keys(LIBELLE_POSTE_CASE).map(poste => (
            <button key={poste} type="button" style={puce(poste, posteActif === poste)}
                    title={POSTES[poste].libelle}
                    onClick={() => { setErreur(null); setForm(f => ({ ...f, [cle]: remplacerPoste(f[cle], poste) })) }}>
              {POSTES[poste].libelle}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // L'aperçu : la case telle qu'elle s'affichera dans la grille.
  const bandes = !apercu ? [] : apercu.kind === 'off' ? [{ texte: 'OFF', poste: 'OFF' }]
    : apercu.kind === 'split'
      ? [{ texte: apercu.matin, poste: posteDepuisTexte(apercu.matin) }, { texte: apercu.apres_midi, poste: posteDepuisTexte(apercu.apres_midi) }]
      : [{ texte: apercu.matin || apercu.apres_midi, poste: apercu.poste }]

  return (
    <div role="dialog" aria-modal="true" aria-label={`Modifier la case de ${nom}, ${d.court}`}
         onMouseDown={e => { if (e.target === e.currentTarget) onFermer() }}
         style={{
           position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.35)',
           display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
         }}>
      <div style={{
        background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)', padding: 20, width: '100%', maxWidth: 460,
        display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>
            {nom} — {d.libelleJour} {String(d.jour).padStart(2, '0')}/{String(d.mois).padStart(2, '0')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            Le fichier dit : <strong>{resumeCase(dejaModifiee ? modif.fichier : caseAffichee)}</strong>
            {dejaModifiee && <> · modifiée dans le dashboard, affichée : <strong>{resumeCase(caseAffichee)}</strong></>}
          </div>
        </div>

        <div style={{ display: 'flex' }}>
          {MODES.map((m, i) => (
            <button key={m.cle} type="button"
                    style={{ ...segment(form.mode === m.cle), borderRadius: i === 0 ? '6px 0 0 6px' : i === MODES.length - 1 ? '0 6px 6px 0' : 0 }}
                    onClick={() => { setErreur(null); setForm(f => ({ ...f, mode: m.cle })) }}>
              {m.libelle}
            </button>
          ))}
        </div>

        {form.mode === 'pleine' && ligne('matin', 'Journée')}
        {form.mode === 'coupee' && (<>{ligne('matin', 'Matin')}{ligne('apres_midi', 'Après-midi')}</>)}
        {form.mode === 'off' && (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Journée OFF : aucun horaire, la case s'affiche grise.
          </div>
        )}

        {/* Aperçu — la case comme dans la grille */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={label}>Aperçu</span>
          <div style={{ width: 120, height: 36, border: '0.5px solid var(--color-border)', display: 'flex', flexDirection: 'column' }}>
            {bandes.map((b, k) => {
              const fond = couleurPoste(b.poste)
              return (
                <div key={k} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, padding: '1px 3px', background: fond ?? 'transparent',
                  color: fond ? '#fff' : 'var(--color-text-secondary)', fontWeight: fond ? 600 : 400,
                }}>{b.texte}</div>
              )
            })}
          </div>
          {apercu && !apercu.poste && apercu.kind !== 'off' && (
            <span style={{ fontSize: 11, color: 'var(--color-amber)' }}>
              Aucun poste reconnu : la case restera sans couleur.
            </span>
          )}
        </div>

        {erreur && <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>{erreur}</div>}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {dejaModifiee && (
            <button type="button" style={{ ...bouton('text-secondary'), marginRight: 'auto' }}
                    title="La case reprend ce que le fichier dit ; l'agent en est prévenu"
                    onClick={onRevenirFichier}>
              Revenir au fichier
            </button>
          )}
          <button type="button" style={{ ...bouton('text-secondary'), marginLeft: dejaModifiee ? 0 : 'auto' }} onClick={onFermer}>Annuler</button>
          <button type="button" style={bouton('primary')} onClick={appliquer}>Appliquer</button>
        </div>
      </div>
    </div>
  )
}
