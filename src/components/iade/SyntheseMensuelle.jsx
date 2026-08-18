// ============================================================
// SyntheseMensuelle — l'export mensuel destiné à la comptable.
//
// On choisit un mois, on obtient un texte brut prêt à coller dans un e-mail :
// pour chaque agent, ses jours validés détaillés par nature (congé payé /
// récupération de jour férié).
//
// Seuls les jours VALIDÉS y figurent : un jour en attente n'est pas un congé
// accordé, l'envoyer en paie serait une erreur. Les jours encore en attente sur
// le mois sont signalés à part, pour qu'on les traite avant d'envoyer.
//
// Composant à part et sans mémoïsation manuelle : gardé dans IadeGestion, ce
// bloc empêchait le compilateur React d'optimiser toute la page.
// ============================================================
import { useState, useMemo } from 'react'
import { syntheseMensuelle } from '../../utils/iadeConges'
import { MOIS_FR, formatISO } from '../../utils/calendrier'

export default function SyntheseMensuelle({ jours = [], agents = [], annee }) {
  const maintenant = new Date()
  const [mois, setMois]   = useState(maintenant.getMonth())
  const [copie, setCopie] = useState(false)
  const [erreur, setErreur] = useState(null)

  const synthese = useMemo(
    () => syntheseMensuelle({ jours, agents, annee, mois, genereLe: formatISO(new Date()) }),
    [jours, agents, annee, mois]
  )

  async function copier() {
    setErreur(null)
    try {
      await navigator.clipboard.writeText(synthese.texte)
      setCopie(true)
      setTimeout(() => setCopie(false), 2500)
    } catch {
      // Presse-papiers refusé (navigateur ancien, page non sécurisée) : le texte
      // reste visible et sélectionnable, on le dit plutôt que d'échouer en silence.
      setErreur('Copie automatique refusée par le navigateur : sélectionnez le texte ci-dessous et copiez-le à la main.')
    }
  }

  const champ = {
    padding: '6px 10px', fontSize: 13,
    border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
  }

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Mois&nbsp;:
          <select
            value={mois}
            onChange={e => setMois(Number(e.target.value))}
            style={{ ...champ, marginLeft: 8 }}
          >
            {MOIS_FR.map((m, i) => (
              <option key={m} value={i}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
            ))}
          </select>
        </label>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {annee} — l'année se choisit en haut de page.
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {copie && <span style={{ fontSize: 12, color: 'var(--color-success)' }}>✓ Copié</span>}
          <button
            type="button"
            onClick={copier}
            style={{
              padding: '8px 16px',
              background: 'var(--color-primary)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-md)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Copier le texte
          </button>
        </div>
      </div>

      {erreur && (
        <div style={{
          fontSize: 12, color: 'var(--color-danger)', background: 'var(--color-danger-light)',
          borderRadius: 8, padding: '8px 12px', marginBottom: 10,
        }}>
          {erreur}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
        {synthese.valides === 0
          ? 'Aucun congé validé sur ce mois. '
          : `${synthese.valides} jour(s) validé(s) pour ${synthese.nbAgents} agent(s). `}
        Seuls les jours <strong>validés</strong> figurent dans le texte : un jour en attente
        n'est pas un congé accordé.
      </div>

      {synthese.enAttente > 0 && (
        <div style={{
          fontSize: 12, color: 'var(--color-amber)', background: 'var(--color-amber-light)',
          borderRadius: 8, padding: '8px 12px', marginBottom: 10,
        }}>
          {synthese.enAttente} jour(s) de ce mois sont <strong>encore en attente</strong> de
          votre décision : ils n'apparaissent pas ci-dessous. Traitez-les avant d'envoyer.
        </div>
      )}

      <textarea
        readOnly
        value={synthese.texte}
        rows={14}
        aria-label="Synthèse mensuelle à copier"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '12px 14px',
          // Chasse fixe : les colonnes de dates restent alignées une fois collées
          // dans un e-mail.
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.6,
          color: 'var(--color-text)',
          background: 'var(--color-bg)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          resize: 'vertical',
        }}
      />
    </div>
  )
}
