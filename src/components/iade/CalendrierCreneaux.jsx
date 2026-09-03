// ============================================================
// CalendrierCreneaux — le calendrier de saisie des créneaux en moins.
//
// L'information arrive par lot : un opérateur envoie ses absences (« je ne suis
// pas là les 12, 15, et du 20 au 22 »). On clique ses jours, on nomme la salle et
// l'opérateur une seule fois, et tout part ensemble. Maj + clic étend depuis le
// dernier jour cliqué.
//
// Les jours qui portent déjà un créneau fermé sont teintés et comptés : on voit
// tout de suite ce qui est déjà noté, et on ne le repose pas.
// ============================================================
import { grilleMois, INITIALES_JOURS } from '../../utils/iadeConges'
import { moisAnneeFR } from '../../utils/calendrier'
import { resume, momentCourt } from '../../utils/iadeCreneaux'

export default function CalendrierCreneaux({
  annee,
  mois,
  onNaviguer,
  selection = [],        // [iso] en cours de saisie
  dejaFermes = new Map(),// iso → [créneau déjà enregistré]
  onClicJour,
  monoJour = false,      // en correction : un seul jour à la fois
}) {
  const semaines = grilleMois(annee, mois)
  const choisis = new Set(selection)

  const boutonNav = {
    padding: '6px 12px', fontSize: 13, borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)', background: 'var(--color-bg)',
    color: 'var(--color-text-secondary)', cursor: 'pointer',
  }

  function styleCase({ jourInfo, choisi, fermes }) {
    const base = {
      minHeight: 44, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 1, padding: 2,
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-surface)',
      color: 'var(--color-text)',
      fontSize: 14, lineHeight: 1.1, cursor: 'pointer',
      appearance: 'none', WebkitTapHighlightColor: 'transparent',
    }
    if (choisi) {
      return {
        ...base, background: 'var(--color-primary)', borderColor: 'var(--color-primary)',
        color: '#fff', fontWeight: 600,
      }
    }
    if (fermes.length > 0) {
      return {
        ...base, background: 'var(--color-amber-light)',
        borderColor: 'var(--color-amber)', color: 'var(--color-amber)', fontWeight: 600,
      }
    }
    if (jourInfo.weekend || jourInfo.ferie) {
      return { ...base, background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }
    }
    return base
  }

  return (
    <div style={{ maxWidth: 460 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <button type="button" style={boutonNav} onClick={() => onNaviguer?.(-1)} aria-label="Mois précédent">‹</button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 600 }}>
          {moisAnneeFR(new Date(Date.UTC(annee, mois, 1)))}
        </div>
        <button type="button" style={boutonNav} onClick={() => onNaviguer?.(1)} aria-label="Mois suivant">›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {INITIALES_JOURS.map((initiale, i) => (
          <div key={i} style={{
            textAlign: 'center', fontSize: 11, fontWeight: 600,
            color: 'var(--color-text-tertiary)', paddingBottom: 2,
          }}>
            {initiale}
          </div>
        ))}

        {semaines.flat().map((jourInfo, i) => {
          if (!jourInfo) return <div key={`vide-${i}`} />

          const fermes = dejaFermes.get(jourInfo.iso) ?? []
          const choisi = choisis.has(jourInfo.iso)
          const titre = [
            fermes.length > 0 ? fermes.map(resume).join(' · ') : null,
            jourInfo.ferie ? `${jourInfo.nomFerie} (férié)` : null,
          ].filter(Boolean).join(' — ') || undefined

          return (
            <button
              key={jourInfo.iso}
              type="button"
              title={titre}
              aria-pressed={choisi}
              onClick={(e) => onClicJour?.(jourInfo.iso, { plage: e.shiftKey })}
              style={styleCase({ jourInfo, choisi, fermes })}
            >
              <span>{jourInfo.numero}</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.03em', minHeight: 11 }}>
                {fermes.length === 0
                  ? (jourInfo.ferie ? '•' : '')
                  : fermes.length === 1 ? momentCourt(fermes[0].moment).slice(0, 1).toUpperCase()
                    : `${fermes.length}×`}
              </span>
            </button>
          )
        })}
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12,
        marginTop: 10, fontSize: 11, color: 'var(--color-text-tertiary)',
      }}>
        <span><span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>▉</span> en cours de saisie</span>
        <span><span style={{ color: 'var(--color-amber)', fontWeight: 700 }}>▉</span> déjà fermé</span>
        <span>• jour férié</span>
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
        {monoJour
          ? 'Cliquez un autre jour pour déplacer ce créneau.'
          : <>Cliquez tous les jours annoncés par l'opérateur. <strong>Maj + clic</strong> étend depuis le dernier jour cliqué.</>}
      </div>
    </div>
  )
}
