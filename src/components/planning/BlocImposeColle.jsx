// ============================================================
// BlocImposeColle — UI partagée de collage d'un « bloc imposé » (grille fournie telle quelle) :
// zone de collage Excel (texte + HTML coloré) → aperçu façon Excel → bouton « Ajouter », puis aperçu
// de la grille committée avec « Remplacer / Effacer ». Utilisé par l'onglet Noël ET le panneau Toussaint
// de l'onglet Vacances (cf. noel.js, moteur générique). Le parent gère le state/enregistrement.
//
// Props :
//   annee            — pour la détection des dates et la coloration des fériés de l'aperçu ;
//   data             — grille committée { v, colle, jours } (source de l'aperçu du bas) ;
//   nom              — nom du bloc dans les libellés (ex. « grille de Noël », « grille de la Toussaint ») ;
//   aide             — nœud JSX d'instructions de collage (sinon texte par défaut) ;
//   sousTitreGrille  — complément de titre de la grille committée (ex. « apparaît telle quelle… ») ;
//   onAjouter(grille)— appelé avec la grille normalisée à figer ; onEffacer() — vider la grille committée.
// ============================================================
import { useState, useMemo } from 'react'
import { parseISO, formatJJMM, joursFeriesFR } from '../../utils/calendrier'
import { ASSOCIES } from '../../data/associes'
import { parserCollageNoel, normaliserNoel, groupeJourNoel } from '../../utils/noel'
import { COULEURS_GRILLE } from '../../utils/grilleSemaine'

const JOUR_LABEL = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'] // getUTCDay() : 0=dim … 6=sam
// Couleurs FIXES type-Excel (indépendantes du thème, lisibles en clair ET sombre), comme ApercuSemaine.
const ENCRE = 'rgba(0,0,0,0.85)'
const BORD = 'rgba(0,0,0,0.18)'
const fondCss = (fond) => (fond ? '#' + COULEURS_GRILLE[fond] : '#fff')
const capitaliser = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t)

export default function BlocImposeColle({ annee, data, nom = 'grille', aide = null, sousTitreGrille = null, onAjouter, onEffacer }) {
  const [texteCandidat, setTexteCandidat] = useState('')
  const [candidat, setCandidat] = useState(null) // { colle, jours } | null

  // Fériés des deux années (un bloc peut chevaucher l'an) → coloration verte de la date.
  const feriesSet = useMemo(
    () => new Set([...joursFeriesFR(annee), ...joursFeriesFR(annee + 1)].map(f => f.iso)),
    [annee]
  )

  const jours = useMemo(() => {
    const js = (data?.jours ?? []).slice()
    js.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0))
    return js
  }, [data])
  const joursCandidat = useMemo(() => {
    const js = (candidat?.jours ?? []).slice()
    js.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0))
    return js
  }, [candidat])

  function majTexteCandidat(valeur) {
    setTexteCandidat(valeur)
    setCandidat(parserCollageNoel(valeur, '', annee)) // saisie clavier : sans couleurs
  }
  function collerDepuisExcel(e) {
    const html = e.clipboardData?.getData('text/html') ?? ''
    if (!html) return // sans HTML, onChange gère le texte brut (sans couleurs)
    e.preventDefault()
    const texte = e.clipboardData.getData('text/plain')
    setTexteCandidat(texte)
    setCandidat(parserCollageNoel(texte, html, annee))
  }
  function ajouter() {
    if (!candidat?.jours?.length) return
    onAjouter?.(normaliserNoel({ colle: candidat.colle, jours: candidat.jours }))
    setTexteCandidat(''); setCandidat(null)
  }

  // ── Styles ──
  const s = {
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 24,
    },
    titreSection: { fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 },
    aide: { fontSize: 12.5, color: 'var(--color-text-secondary)', marginBottom: 12, lineHeight: 1.5 },
    textarea: {
      width: '100%', minHeight: 90, padding: '10px 12px', fontSize: 13, fontFamily: 'monospace',
      border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', resize: 'vertical',
      boxSizing: 'border-box',
    },
    bouton: {
      padding: '8px 14px', background: 'var(--color-primary)', color: '#fff', border: 'none',
      borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500,
    },
    table: { borderCollapse: 'collapse', fontSize: 12.5, background: '#fff', color: ENCRE },
    th: {
      padding: '5px 8px', fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.8)', textAlign: 'center',
      border: `0.5px solid ${BORD}`, background: '#' + COULEURS_GRILLE.header, whiteSpace: 'nowrap',
    },
    tdJour: { padding: '5px 8px', fontSize: 12, fontWeight: 600, color: ENCRE, border: `0.5px solid ${BORD}`, whiteSpace: 'nowrap' },
    td: { padding: '4px 6px', textAlign: 'center', color: ENCRE, border: `0.5px solid ${BORD}`, whiteSpace: 'nowrap' },
  }

  // Aperçu d'une grille (candidate ou committée) au MÊME format que l'export Excel : Date | 8 associés | G/A.
  const apercuTable = (joursList) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Date</th>
            {ASSOCIES.map(ini => <th key={ini} style={s.th}>{ini}</th>)}
            <th style={s.th}>G/A</th>
          </tr>
        </thead>
        <tbody>
          {joursList.map(j => {
            const d = parseISO(j.iso)
            const dow = d.getUTCDay()
            const fondDate = feriesSet.has(j.iso) ? 'ferie' : (dow === 0 || dow === 6) ? 'weekend' : null
            const grp = groupeJourNoel(j)
            const grpFond = grp === 'G' ? 'garde' : grp === 'A' ? 'astreinte' : null
            return (
              <tr key={j.iso}>
                <td style={{ ...s.tdJour, background: fondCss(fondDate) }}>{JOUR_LABEL[dow]} {formatJJMM(d)}</td>
                {ASSOCIES.map(ini => {
                  const cell = j.parAssocie?.[ini]
                  const poste = (cell?.poste ?? '').trim()
                  const fond = cell?.role === 'G' ? 'garde' : cell?.role === 'A' ? 'astreinte' : cell?.role === 'C' ? 'conge' : cell?.role === 'F' ? 'ferie' : null
                  return <td key={ini} style={{ ...s.td, background: fondCss(fond), fontWeight: (cell?.role === 'G' || cell?.role === 'A') ? 700 : 400 }}>{poste}</td>
                })}
                <td style={{ ...s.td, background: fondCss(grpFond), fontWeight: 700 }}>{grp}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      {/* Coller une grille candidate puis « Ajouter » */}
      <div style={s.carte}>
        <div style={s.titreSection}>Coller la {nom} depuis Excel</div>
        {aide ?? (
          <p style={s.aide}>
            Sélectionnez dans Excel le bloc complet (ligne d'en-tête avec les initiales, colonne des dates à
            gauche, cases colorées) puis collez ci-dessous (Ctrl+V). Les fonds <strong>jaune (garde)</strong> et
            <strong> orange (astreinte)</strong> sont lus automatiquement ; une case vide = repos. Vérifiez
            l'aperçu, puis <strong>Ajouter</strong>.
          </p>
        )}
        <textarea
          value={texteCandidat}
          onChange={e => majTexteCandidat(e.target.value)}
          onPaste={collerDepuisExcel}
          placeholder="Collez ici la grille (en-tête + dates + cases colorées) copiée depuis Excel…"
          style={s.textarea}
        />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
          <button
            type="button"
            onClick={ajouter}
            disabled={joursCandidat.length === 0}
            style={{ ...s.bouton, opacity: joursCandidat.length === 0 ? 0.5 : 1, cursor: joursCandidat.length === 0 ? 'default' : 'pointer' }}
          >
            + Ajouter la {nom}
          </button>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {joursCandidat.length > 0
              ? `${joursCandidat.length} jour${joursCandidat.length > 1 ? 's' : ''} détecté${joursCandidat.length > 1 ? 's' : ''}`
              : 'Collez une grille ci-dessus pour activer l’ajout.'}
          </span>
        </div>
        {joursCandidat.length > 0 && apercuTable(joursCandidat)}
      </div>

      {/* Grille committée (au format Excel) */}
      {jours.length > 0 && (
        <div style={s.carte}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={s.titreSection}>
              {capitaliser(nom)} <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>· {jours.length} jour{jours.length > 1 ? 's' : ''}{sousTitreGrille ? ` · ${sousTitreGrille}` : ''}</span>
            </div>
            <button type="button" onClick={onEffacer} style={{ marginLeft: 'auto', padding: '5px 11px', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer', border: '0.5px solid var(--color-danger)', background: 'var(--color-bg)', color: 'var(--color-danger)' }}>
              Remplacer / Effacer
            </button>
          </div>
          {apercuTable(jours)}
        </div>
      )}
    </>
  )
}
