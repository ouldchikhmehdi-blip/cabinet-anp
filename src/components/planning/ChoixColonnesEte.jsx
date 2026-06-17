// ============================================================
// ChoixColonnesEte.jsx — saisie associé : choix des colonnes de la grille d'été.
// L'associé voit la grille (référence) et, par colonne, choisit un niveau de préférence :
// ⭐ Prioritaire (ordonnées 1er/2e/3e…), 👍 Possible, 🚫 À éviter, ou sans avis.
// Raccourcis « Toutes possibles » / « Réinitialiser ». Met à jour data.colonnesEte via onChange.
// ============================================================
import TrameEteGrille from './TrameEteGrille'
import {
  NIVEAUX_COLONNE, niveauColonne, rangPriorite, appliquerNiveau,
  monter, descendre, toutesPossibles, reinitialiserPref,
} from '../../utils/trameEte'

export default function ChoixColonnesEte({ trameEte, valeur, onChange, lectureSeule = false }) {
  const colonnes = trameEte?.colonnes ?? []
  const lignes = trameEte?.lignes ?? []

  const niveauParColonne = {}
  const rangParColonne = {}
  for (const c of colonnes) {
    niveauParColonne[c.key] = niveauColonne(valeur, c.key)
    const rg = rangPriorite(valeur, c.key)
    if (rg != null) rangParColonne[c.key] = rg
  }

  // Clic sur un en-tête : fait défiler le niveau (sans avis → prioritaire → possible → à éviter → …).
  const ORDRE = ['', 'prioritaire', 'possible', 'refus']
  function cyclerColonne(key) {
    const actuel = niveauColonne(valeur, key)
    const suivant = ORDRE[(ORDRE.indexOf(actuel) + 1) % ORDRE.length]
    onChange(appliquerNiveau(valeur, key, suivant))
  }

  if (colonnes.length === 0 || lignes.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
        La trame d'été n'est pas encore disponible.
      </div>
    )
  }

  const btn = (actif, accent) => ({
    padding: '4px 9px', fontSize: 12, fontWeight: actif ? 600 : 400, cursor: 'pointer',
    borderRadius: 'var(--radius-md)', border: `0.5px solid ${actif ? accent : 'var(--color-border)'}`,
    background: actif ? accent : 'transparent', color: actif ? '#fff' : 'var(--color-text-secondary)',
  })
  const ACCENT = { prioritaire: 'var(--color-success)', possible: '#2D6CB5', refus: 'var(--color-danger)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TrameEteGrille
        colonnes={colonnes}
        lignes={lignes}
        niveauParColonne={niveauParColonne}
        rangParColonne={rangParColonne}
        onSelectColonne={lectureSeule ? null : cyclerColonne}
      />

      {!lectureSeule && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onChange(toutesPossibles(valeur, colonnes))}
              style={{ ...btn(false, '#2D6CB5'), color: 'var(--color-text)' }}>
              👍 Toutes possibles
            </button>
            <button type="button" onClick={() => onChange(reinitialiserPref())}
              style={{ ...btn(false, 'var(--color-danger)'), color: 'var(--color-text)' }}>
              ↺ Réinitialiser
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {colonnes.map(c => {
              const niveau = niveauColonne(valeur, c.key)
              const rang = rangPriorite(valeur, c.key)
              return (
                <div key={c.key} style={{
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '6px 10px',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', minWidth: 70 }}>
                    Colonne {c.label}
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                    {NIVEAUX_COLONNE.map(n => (
                      <button key={n.val} type="button"
                        onClick={() => onChange(appliquerNiveau(valeur, c.key, niveau === n.val ? '' : n.val))}
                        style={btn(niveau === n.val, ACCENT[n.val])}>
                        {n.icone} {n.lib}
                      </button>
                    ))}
                  </div>
                  {niveau === 'prioritaire' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 600 }}>{rang}ᵉ choix</span>
                      <button type="button" onClick={() => onChange(monter(valeur, c.key))} title="Monter"
                        style={{ ...btn(false, 'var(--color-border)'), padding: '2px 7px' }}>↑</button>
                      <button type="button" onClick={() => onChange(descendre(valeur, c.key))} title="Descendre"
                        style={{ ...btn(false, 'var(--color-border)'), padding: '2px 7px' }}>↓</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
