// ============================================================
// CalendrierRempla — le calendrier sur lequel la gestion désigne les jours où
// il faut un remplaçant.
//
// Un clic ouvre un besoin sur le jour ; un deuxième clic en ouvre un second
// (deux remplaçants le même jour) ; un troisième remet le jour à zéro — mais
// jamais un besoin déjà nommé ou pourvu, qui se retire à la main dans la liste.
// Maj + clic étend depuis le dernier jour cliqué : une semaine d'absence se pose
// en deux gestes.
//
// Les jours où un IADE est absent sont soulignés d'un liseré : c'est là qu'on a
// besoin de quelqu'un neuf fois sur dix, autant que l'œil y aille tout seul.
// ============================================================
import { grilleMois, INITIALES_JOURS } from '../../utils/iadeConges'
import { moisAnneeFR } from '../../utils/calendrier'

export default function CalendrierRempla({
  annee,
  mois,
  onNaviguer,
  besoins = new Map(),      // iso → [besoin]
  absences = new Map(),     // iso → [{ nom, statut }]
  onClicJour,
}) {
  const semaines = grilleMois(annee, mois)

  const boutonNav = {
    padding: '6px 12px', fontSize: 13, borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)', background: 'var(--color-bg)',
    color: 'var(--color-text-secondary)', cursor: 'pointer',
  }

  function styleCase({ jourInfo, liste, absent }) {
    const base = {
      minHeight: 46, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 1, padding: 2,
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-surface)',
      color: 'var(--color-text)',
      fontSize: 14, lineHeight: 1.1, cursor: 'pointer',
      appearance: 'none', WebkitTapHighlightColor: 'transparent',
      // Le liseré du bas dit « quelqu'un manque ce jour-là » sans voler la
      // couleur de fond, qui sert à l'état du remplacement.
      borderBottom: absent ? '3px solid var(--color-primary)' : '0.5px solid var(--color-border)',
    }

    if (liste.length > 0) {
      const tousPourvus = liste.every(b => b.statut === 'pourvu')
      const fond = tousPourvus ? 'var(--color-success)' : 'var(--color-amber)'
      return { ...base, background: fond, borderColor: fond, color: '#fff', fontWeight: 600 }
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

          const liste = besoins.get(jourInfo.iso) ?? []
          const absentsDuJour = absences.get(jourInfo.iso) ?? []
          const pourvus = liste.filter(b => b.statut === 'pourvu').length

          const titre = [
            liste.length > 0
              ? `${liste.length} remplaçant(s) demandé(s)${pourvus > 0 ? `, ${pourvus} pourvu(s)` : ''}`
              : null,
            absentsDuJour.length > 0
              ? `Absent(s) : ${absentsDuJour.map(a => a.nom).join(', ')}`
              : null,
            jourInfo.ferie ? `${jourInfo.nomFerie} (férié)` : null,
          ].filter(Boolean).join(' · ') || undefined

          return (
            <button
              key={jourInfo.iso}
              type="button"
              title={titre}
              aria-pressed={liste.length > 0}
              onClick={(e) => onClicJour?.(jourInfo.iso, { plage: e.shiftKey })}
              style={styleCase({ jourInfo, liste, absent: absentsDuJour.length > 0 })}
            >
              <span>{jourInfo.numero}</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.03em', minHeight: 11 }}>
                {liste.length === 0
                  ? (jourInfo.ferie ? '•' : '')
                  : pourvus === liste.length ? '✓'.repeat(liste.length)
                    : `${liste.length}✕`}
              </span>
            </button>
          )
        })}
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12,
        marginTop: 10, fontSize: 11, color: 'var(--color-text-tertiary)',
      }}>
        <span><span style={{ color: 'var(--color-amber)', fontWeight: 700 }}>▉</span> à pourvoir</span>
        <span><span style={{ color: 'var(--color-success)', fontWeight: 700 }}>▉</span> pourvu</span>
        <span><span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>▁</span> un IADE est absent ce jour-là</span>
        <span>• jour férié</span>
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
        Un clic ouvre une recherche de remplaçant, un deuxième en demande un
        <strong> second</strong> sur le même jour, un troisième efface le jour.
        <strong> Maj + clic</strong> étend depuis le dernier jour cliqué.
      </div>
    </div>
  )
}
