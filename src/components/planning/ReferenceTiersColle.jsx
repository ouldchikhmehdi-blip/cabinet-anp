// ============================================================
// ReferenceTiersColle — UI de collage de la « référence tiers 1+2 » (planning fait à la main).
// On ne RECONNAÎT rien (≠ BlocImposeColle/Noël) : on capture le texte + la couleur de fond brute de
// chaque cellule (referenceGrille.js) et on les reproduit telles quelles. Le parent gère l'enregistrement.
//
// Props :
//   data            — référence committée { v, colle, lignes:[[{t,c}]] } (source de l'aperçu du bas) ;
//   onAjouter(ref)  — appelé avec la grille normalisée à figer ;
//   onEffacer()     — vider la référence committée.
// ============================================================
import { useState } from 'react'
import { parserCollageReference, referenceVide, referenceNonVide } from '../../utils/referenceGrille'

const ENCRE = 'rgba(0,0,0,0.85)'
const BORD = 'rgba(0,0,0,0.18)'

export default function ReferenceTiersColle({ data, onAjouter, onEffacer }) {
  const [texteCandidat, setTexteCandidat] = useState('')
  const [candidat, setCandidat] = useState(null) // { v, colle, lignes } | null

  function majTexteCandidat(valeur) {
    setTexteCandidat(valeur)
    setCandidat(parserCollageReference(valeur, '')) // saisie clavier : sans couleurs
  }
  function collerDepuisExcel(e) {
    const html = e.clipboardData?.getData('text/html') ?? ''
    if (!html) return // sans HTML, onChange gère le texte brut (sans couleurs)
    e.preventDefault()
    const texte = e.clipboardData.getData('text/plain')
    setTexteCandidat(texte)
    setCandidat(parserCollageReference(texte, html))
  }
  function ajouter() {
    if (!referenceNonVide(candidat)) return
    onAjouter?.(candidat)
    setTexteCandidat(''); setCandidat(null)
  }

  const nbLignesCandidat = candidat?.lignes?.length ?? 0
  const committe = referenceNonVide(data) ? data : referenceVide()

  // ── Styles ──
  const s = {
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 16,
    },
    titreSection: { fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 },
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
    table: { borderCollapse: 'collapse', fontSize: 12, background: '#fff', color: ENCRE },
    td: { padding: '4px 7px', textAlign: 'center', color: ENCRE, border: `0.5px solid ${BORD}`, whiteSpace: 'nowrap' },
  }

  // Aperçu fidèle : reproduit chaque cellule avec sa couleur de fond brute (ou blanc).
  const apercuTable = (lignes) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={s.table}>
        <tbody>
          {lignes.map((ligne, i) => (
            <tr key={i}>
              {ligne.map((cell, j) => (
                <td key={j} style={{ ...s.td, background: cell.c ?? '#fff' }}>{cell.t}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      {/* Coller la référence puis « Ajouter » */}
      <div style={s.carte}>
        <div style={s.titreSection}>Coller le planning des tiers 1 et 2 depuis Excel</div>
        <p style={s.aide}>
          Sélectionnez dans Excel tout votre planning manuel (janvier → fin d'été) et collez-le ci-dessous
          (Ctrl+V). Il est repris <strong>tel quel</strong>, <strong>avec ses couleurs</strong> : rien n'est
          interprété ni recalculé. Il apparaîtra <strong>en référence, en haut</strong> de l'export du 3ᵉ tiers,
          le calendrier de la rentrée venant en dessous.
        </p>
        <textarea
          value={texteCandidat}
          onChange={e => majTexteCandidat(e.target.value)}
          onPaste={collerDepuisExcel}
          placeholder="Collez ici votre planning des tiers 1 et 2 copié depuis Excel…"
          style={s.textarea}
        />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
          <button
            type="button"
            onClick={ajouter}
            disabled={nbLignesCandidat === 0}
            style={{ ...s.bouton, opacity: nbLignesCandidat === 0 ? 0.5 : 1, cursor: nbLignesCandidat === 0 ? 'default' : 'pointer' }}
          >
            + Ajouter la référence
          </button>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {nbLignesCandidat > 0
              ? `${nbLignesCandidat} ligne${nbLignesCandidat > 1 ? 's' : ''} détectée${nbLignesCandidat > 1 ? 's' : ''}`
              : 'Collez une grille ci-dessus pour activer l’ajout.'}
          </span>
        </div>
        {nbLignesCandidat > 0 && apercuTable(candidat.lignes)}
      </div>

      {/* Référence committée */}
      {committe.lignes.length > 0 && (
        <div style={s.carte}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={s.titreSection}>
              Référence tiers 1+2 <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>· {committe.lignes.length} ligne{committe.lignes.length > 1 ? 's' : ''} · reprise telle quelle à l'export</span>
            </div>
            <button type="button" onClick={onEffacer} style={{ marginLeft: 'auto', padding: '5px 11px', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer', border: '0.5px solid var(--color-danger)', background: 'var(--color-bg)', color: 'var(--color-danger)' }}>
              Remplacer / Effacer
            </button>
          </div>
          {apercuTable(committe.lignes)}
        </div>
      )}
    </>
  )
}
