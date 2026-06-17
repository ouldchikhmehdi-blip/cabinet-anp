import { useState } from 'react'
import { ASSOCIES } from '../../data/associes'
import {
  PARAMS_REF, compteursVides, analyserCollagePlanning, VERSION_CREF,
} from '../../utils/compteursRef'

// ============================================================
// CompteursReference — panneau « Compteurs de référence (cumul à ce stade) » de l'année.
// Le faiseur colle son planning réel (1ʳᵉ partie + été + Noël) ; l'outil compte les paramètres par
// associé (double comptage croisé : numéros collés + recomptage couleurs), signale les cases douteuses,
// et le faiseur valide un tableau éditable avant enregistrement (cf. PLANNING.md §13, §16).
//
// Props : { annee, valeur, onEnregistrer(data), onSupprimer(), enregistrement }
//   - valeur : objet { compteurs, importeLe, inclutNoel } enregistré, ou null.
//   - onEnregistrer / onSupprimer : callbacks async fournis par PlanningSuivi.
// ============================================================
export default function CompteursReference({ annee, valeur, onEnregistrer, onSupprimer, enregistrement = false }) {
  const [ouvert, setOuvert] = useState(false)
  const [texte, setTexte] = useState('')
  const [analyse, setAnalyse] = useState(null) // { compteurs, doutes, parse } du dernier collage
  const [edit, setEdit] = useState(() => valeur?.compteurs ?? compteursVides())
  const [inclutNoel, setInclutNoel] = useState(valeur?.inclutNoel ?? false)
  const [msg, setMsg] = useState(null)

  // Resynchronise le tableau éditable quand la valeur enregistrée change (chargement / après save).
  // Pattern « état dérivé d'une prop » sans effet (évite react-hooks/set-state-in-effect).
  const [refValeur, setRefValeur] = useState(valeur)
  if (valeur !== refValeur) {
    setRefValeur(valeur)
    setEdit(valeur?.compteurs ?? compteursVides())
    setInclutNoel(valeur?.inclutNoel ?? false)
    setAnalyse(null)
  }

  const doutesSet = new Set((analyse?.doutes ?? []).map(d => `${d.ini}|${d.param}`))

  function coller(e) {
    const html = e.clipboardData?.getData('text/html') ?? ''
    const brut = e.clipboardData?.getData('text/plain') ?? ''
    if (!brut) return
    e.preventDefault()
    setTexte(brut)
    setMsg(null)
    const res = analyserCollagePlanning(brut, html, annee)
    setAnalyse(res)
    setEdit(res.compteurs) // pré-remplissage du tableau, modifiable ensuite
  }

  function modifierCellule(ini, param, val) {
    const n = val === '' ? 0 : Math.max(0, Math.round(Number(val) || 0))
    setEdit(prev => ({ ...prev, [ini]: { ...prev[ini], [param]: n } }))
  }

  async function enregistrer() {
    setMsg(null)
    await onEnregistrer({
      v: VERSION_CREF,
      importeLe: new Date().toISOString(),
      inclutNoel,
      compteurs: edit,
    })
    setMsg('Compteurs de référence enregistrés.')
    setTexte('')
    setAnalyse(null)
    setTimeout(() => setMsg(null), 4000)
  }

  const aDejaEnregistre = !!valeur?.importeLe
  const parse = analyse?.parse
  const doutes = analyse?.doutes ?? []

  const styles = {
    th: { padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'center', borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap' },
    thParam: { padding: '6px 8px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)', textAlign: 'left', borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap' },
    td: { padding: '3px 4px', textAlign: 'center', borderBottom: '0.5px solid var(--color-border)' },
    input: (doute) => ({
      width: 46, padding: '4px 4px', fontSize: 13, textAlign: 'center',
      border: `1px solid ${doute ? 'var(--color-amber)' : 'var(--color-border)'}`,
      borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    }),
  }

  return (
    <div style={{
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 24,
    }} className="no-print">
      <button
        type="button"
        onClick={() => setOuvert(o => !o)}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left', display: 'block' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{ouvert ? '▾' : '▸'}</span>
          Compteurs de référence (cumul à ce stade) — {annee}
          {aDejaEnregistre && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-success)' }}>● enregistrés</span>}
        </span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
          Collez l'export « En semaine » définitif (1ᵉʳ janvier → fin de l'été + Noël) pour fixer le
          cumul par associé, socle de construction de la suite.
        </span>
      </button>

      {ouvert && (
        <div style={{ marginTop: 16 }}>
          {msg && <div style={{ fontSize: 12, color: 'var(--color-success)', marginBottom: 12 }}>{msg}</div>}

          {/* Rappel Noël — bien visible */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            border: '1px solid var(--color-amber)', color: 'var(--color-amber)',
            borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 14, fontSize: 13, fontWeight: 500,
          }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
            <span style={{ color: 'var(--color-text)' }}>
              <strong>Collez l'export « En semaine » DÉFINITIF</strong> (postes détaillés + compteurs
              <em> G1, A1, Réa2, NC&nbsp;G&nbsp;3…</em>), <strong>pas</strong> un brouillon antérieur. Et
              <strong> n'oubliez pas Noël</strong> : tout le 1ᵉʳ janvier → fin de l'été <strong>ET les 2
              dernières semaines de Noël</strong>, sinon le cumul sera faux. Cochez la case une fois Noël inclus.
            </span>
          </div>

          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
            Dans Excel, sélectionnez le bloc <strong>en-tête compris</strong> (la ligne avec les initiales
            des associés) et la <strong>colonne des dates</strong>, puis collez ci-dessous (Ctrl+V). Les
            <strong> fonds de couleur</strong> (jaune = garde, orange = astreinte, bleu = vacances, vert =
            férié) et les <strong>numéros</strong> collés aux postes servent au double comptage.
          </p>
          <textarea
            value={texte}
            onChange={e => setTexte(e.target.value)}
            onPaste={coller}
            placeholder="Collez ici l'export « En semaine » définitif (1ᵉʳ janvier → fin de l'été + Noël) copié depuis Excel…"
            style={{
              width: '100%', minHeight: 90, padding: '10px 12px', fontSize: 13, fontFamily: 'monospace',
              border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
            }}
          />

          {parse && (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '10px 0' }}>
              Planning lu : <strong>{parse.lignes.length}</strong> jours daté(s).{' '}
              {parse.enteteTrouvee
                ? <>En-tête détecté : {parse.associes.length}/{ASSOCIES.length} associés ({parse.associes.join(', ')}).</>
                : <span style={{ color: 'var(--color-amber)' }}>En-tête (initiales) non détecté : les colonnes n'ont pas pu être associées automatiquement — complétez le tableau à la main.</span>}
            </div>
          )}

          {/* Tableau éditable paramètres × associés */}
          <div style={{ overflowX: 'auto', marginTop: 6 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...styles.thParam, textAlign: 'left' }}>Paramètre</th>
                  {ASSOCIES.map(ini => <th key={ini} style={styles.th}>{ini}</th>)}
                </tr>
              </thead>
              <tbody>
                {PARAMS_REF.map(([param, label]) => (
                  <tr key={param}>
                    <td style={styles.thParam}>{label}</td>
                    {ASSOCIES.map(ini => {
                      const doute = doutesSet.has(`${ini}|${param}`)
                      return (
                        <td key={ini} style={styles.td}>
                          <input
                            type="number"
                            min="0"
                            value={edit?.[ini]?.[param] ?? 0}
                            onChange={e => modifierCellule(ini, param, e.target.value)}
                            style={styles.input(doute)}
                            title={doute ? 'Comptages divergents : à vérifier' : undefined}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cases à vérifier (divergences entre les deux méthodes de comptage) */}
          {doutes.length > 0 && (
            <div style={{ marginTop: 14, border: '0.5px solid var(--color-amber)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-amber)', marginBottom: 8 }}>
                ⚠️ {doutes.length} case{doutes.length > 1 ? 's' : ''} à vérifier (les deux comptages divergent)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {doutes.map((d, i) => (
                  <div key={`${d.ini}-${d.param}-${i}`} style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    <strong style={{ color: 'var(--color-text)' }}>{d.ini} · {d.label}</strong>{' '}
                    — numéro lu : <strong>{d.parNumero ?? '—'}</strong>, recompté : <strong>{d.parOccurrences}</strong>
                    {d.dates.length > 0 && <span style={{ color: 'var(--color-text-tertiary)' }}> · {d.dates.join(' · ')}</span>}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
                Corrigez la valeur retenue directement dans le tableau ci-dessus (cases bordées d'orange).
              </div>
            </div>
          )}

          {/* Confirmation Noël + enregistrement */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text)' }}>
              <input type="checkbox" checked={inclutNoel} onChange={e => setInclutNoel(e.target.checked)} />
              Les 2 semaines de Noël sont incluses dans ce cumul
            </label>
            <button
              type="button"
              onClick={enregistrer}
              disabled={enregistrement}
              style={{
                padding: '9px 16px', background: 'var(--color-primary)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500,
                opacity: enregistrement ? 0.6 : 1,
              }}
            >
              {enregistrement ? 'Enregistrement…' : 'Enregistrer la référence'}
            </button>
            {aDejaEnregistre && (
              <button
                type="button"
                onClick={onSupprimer}
                style={{
                  padding: '5px 10px', fontSize: 12, borderRadius: 'var(--radius-md)',
                  border: '0.5px solid var(--color-danger)', background: 'transparent', color: 'var(--color-danger)',
                }}
              >
                Supprimer la référence
              </button>
            )}
            {!inclutNoel && (
              <span style={{ fontSize: 12, color: 'var(--color-amber)' }}>Noël non confirmé : le cumul risque d'être incomplet.</span>
            )}
          </div>

          {aDejaEnregistre && valeur?.importeLe && (
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 10 }}>
              Dernier enregistrement : {new Date(valeur.importeLe).toLocaleString('fr-FR')}
              {valeur.inclutNoel ? ' · Noël inclus' : ' · Noël non confirmé'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
