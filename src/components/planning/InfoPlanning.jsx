import { useState } from 'react'

/**
 * InfoPlanning — encadré repliable expliquant à l'associé comment se construit
 * le planning : ce qui est automatique vs ce que fait le faiseur (cf. PLANNING.md §13).
 */
export default function InfoPlanning() {
  const [ouvert, setOuvert] = useState(true)

  const s = {
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', marginBottom: 20, overflow: 'hidden',
    },
    entete: {
      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 8, padding: '14px 20px', background: 'transparent', border: 'none',
      fontSize: 14, fontWeight: 600, color: 'var(--color-text)', textAlign: 'left',
    },
    corps: { padding: '0 20px 18px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 },
    sousTitre: { fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginTop: 14, marginBottom: 4 },
    intro: {
      fontSize: 13, color: 'var(--color-text)', background: 'var(--color-primary-light)',
      borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 10,
    },
    liste: { margin: '0 0 0 18px', padding: 0 },
  }

  return (
    <div style={s.carte} className="no-print">
      <button type="button" style={s.entete} onClick={() => setOuvert(v => !v)} aria-expanded={ouvert}>
        <span>Comment se construit le planning ?</span>
        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>{ouvert ? '▲ Masquer' : '▼ Afficher'}</span>
      </button>

      {ouvert && (
        <div style={s.corps}>
          <div style={s.intro}>
            Cet outil est une <strong>aide, pas un robot</strong>. Il ne décide jamais à votre place :
            le faiseur de planning garde la main sur le résultat final.
          </div>

          <div style={s.sousTitre}>Ce que l'outil fait automatiquement</div>
          <ul style={s.liste}>
            <li>rassemble les desiderata de tous les associés ;</li>
            <li>choisit la <strong>trame</strong> de chaque semaine (repli automatique vers une trame à plus de colonnes vacances quand plusieurs associés sont en congé la même semaine) ;</li>
            <li>répartit les associés sur les colonnes (les rôles Réa, Vacances et avant/après week-end sont déjà fixés par les étapes précédentes) ;</li>
            <li>tient à jour les compteurs (gardes de semaine, astreinte / garde du vendredi, réa, week-ends, récup jours fériés…) par personne et par période ;</li>
            <li>signale les déséquilibres et les points à <strong>arbitrer</strong> (bloquants) ou à <strong>surveiller</strong> (gardes rapprochées, ponts, souhait non appliqué…).</li>
          </ul>

          <div style={s.sousTitre}>Les règles d'équilibre et d'équité (étape « En semaine »)</div>
          <ul style={s.liste}>
            <li><strong>Gardes de semaine d'abord</strong> : les gardes de semaine (mardi, et jeudi s'il est de garde) sont réparties au plus juste entre tous — c'est la priorité n°1.</li>
            <li>L'outil équilibre <strong>aussi</strong>, à <strong>±1 près</strong> : l'<strong>astreinte du vendredi</strong>, la <strong>garde du vendredi</strong> et les <strong>récup de jours fériés</strong>.</li>
            <li><strong>Espacement</strong> : il vise au moins <strong>une semaine</strong> entre deux gardes d'une même personne et évite les gardes rapprochées.</li>
            <li><strong>Équité des demandes</strong> : quand une garde rapprochée est inévitable et qu'il faut trancher, elle est attribuée en priorité à celui qui a formulé le <strong>plus de souhaits</strong> (jours off, vacances, week-ends indisponibles, colonnes) — pour protéger ceux qui n'ont rien demandé de particulier.</li>
            <li>il respecte les <strong>souhaits de colonne</strong> (sur la trame principale) et favorise les <strong>jours off</strong> demandés quand c'est possible ;</li>
            <li>le bouton <strong>« Améliorer l'espacement »</strong> lance un 2ᵉ passage qui réduit encore les gardes rapprochées <em>sans</em> dégrader les équilibres ci-dessus ni toucher aux cases verrouillées ;</li>
            <li>le calcul est <strong>déterministe</strong> (mêmes données → même proposition) et les cases <strong>verrouillées (cadenas)</strong> sont toujours conservées telles quelles.</li>
          </ul>

          <div style={s.sousTitre}>Ce que fait le faiseur de planning (un humain)</div>
          <ul style={s.liste}>
            <li>définit la structure (semaines type, rotation garde/astreinte avec l'autre groupe, vacances scolaires, fériés) ;</li>
            <li>place les gardes, astreintes, vacances et postes en tenant compte des desiderata, des quotas et de l'équité entre tous ;</li>
            <li>tranche les arbitrages quand tout n'est pas compatible, et valide chaque étape.</li>
          </ul>

          <div style={s.sousTitre}>Vos desiderata</div>
          <ul style={s.liste}>
            <li>sont <strong>facultatifs</strong> (« rien à signaler » est une réponse valable) ;</li>
            <li>sont <strong>privés</strong> : seul le faiseur de planning peut les consulter ;</li>
            <li>sont pris en compte <strong>autant que possible</strong>, sans garantie (les contraintes d'équipe priment).</li>
          </ul>
        </div>
      )}
    </div>
  )
}
