// ============================================================
// RecapPlanningColle — le récap tiré du planning collé, dans l'onglet
// « Synthèse comptable » de la gestion IADE.
//
// On colle tout le tableau d'un mois (depuis le fichier visuel du planning) et on
// obtient un récap : congés des IADE + couverture (remplaçant / HS), remplaçants
// des jours sans congé, heures sup. 100 % côté client — rien n'est envoyé au
// serveur, aucune donnée stockée.
//
// Il voisine avec `SyntheseMensuelle` parce que c'est le même geste : produire le
// récapitulatif d'un mois, à transmettre. Seule la source diffère — celui-ci lit
// le fichier du planning, l'autre ce qui a été validé dans le dashboard.
// ============================================================
import { useState } from 'react'
import { lignesDepuisTexte, genererRecapTexte } from '../../utils/planningColle'

function telecharger(texte, nomFichier) {
  const blob = new Blob([texte], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}

export default function RecapPlanningColle() {
  const [texte, setTexte] = useState('')
  const [recap, setRecap] = useState('')
  const [erreur, setErreur] = useState(null)

  function generer() {
    setErreur(null)
    setRecap('')
    try {
      const r = genererRecapTexte(lignesDepuisTexte(texte))
      setRecap(r)
    } catch (e) {
      setErreur(e.message || 'Impossible de lire le mois collé.')
    }
  }

  const carte = {
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: 20,
  }
  const bouton = {
    padding: '9px 18px',
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    fontSize: 14,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
        Copiez tout le tableau d'un mois depuis le fichier visuel du planning, collez-le ci-dessous,
        puis générez le récap : congés des IADE (avec le remplaçant ou les heures sup du même jour),
        remplaçants des jours sans congé, et heures sup. Tout se calcule dans votre navigateur.
      </p>

      <div style={carte}>
        <textarea
          value={texte}
          onChange={e => setTexte(e.target.value)}
          placeholder="Colle ici le mois entier (Ctrl+V)…"
          spellCheck={false}
          style={{
            width: '100%',
            minHeight: 180,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            padding: 12,
            border: '0.5px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
          <button onClick={generer} disabled={!texte.trim()} style={{ ...bouton, opacity: texte.trim() ? 1 : 0.5 }}>
            Générer le récap
          </button>
          {recap && (
            <button
              onClick={() => telecharger(recap, 'recap-planning.txt')}
              style={{
                ...bouton,
                background: 'var(--color-bg)',
                color: 'var(--color-primary)',
                border: '0.5px solid var(--color-primary)',
              }}
            >
              Télécharger .txt
            </button>
          )}
        </div>
        {erreur && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--color-danger, #c0392b)' }}>{erreur}</div>
        )}
      </div>

      {recap && (
        <div style={carte}>
          <pre style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--color-text)',
          }}>{recap}</pre>
        </div>
      )}
    </div>
  )
}
