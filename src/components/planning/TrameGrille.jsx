// ============================================================
// TrameGrille — rendu d'une trame (semaine type) : jours en lignes × colonnes.
// Réutilisé par l'étape Trames (faiseur) et par les desiderata (associés).
// Une case repos (vide) s'affiche en cyan #00B0F0 (couleur « congé/repos », cf. exportCalendrier).
// Une cellule « de service » (col.service[jour] === true) est de garde/astreinte ce jour-là. La
// COULEUR dépend du JOUR (le type est fixe lun/mar/mer, §3 ; variable jeu/ven selon la base
// calendrier — non connu ici) : lun/mer → orange (astreinte), mar → jaune (garde), jeu/ven →
// gris neutre « de service » (le type viendra de la base calendrier au comptage).
// roles (optionnel) = { rea, vacances:[idx], avantWE, apresWE, remplacants:[{col,nom}] } → repères en-tête.
// onToggleService (optionnel, faiseur) = (colIndex, jour) => void : rend les cellules non-repos
// cliquables (bascule de service ↔ pas de service). Absent ⇒ LECTURE SEULE (aperçu, desiderata).
// ============================================================
import { JOURS, JOURS_LABEL } from '../../utils/trames'
import { TYPE_FIXE } from '../../utils/calendrier'

const REPOS_BG = '#00B0F0'
const GARDE_BG = '#FFFF00'     // jaune (= ARGB.garde)
const ASTREINTE_BG = '#FFC000' // orange (= ARGB.astreinte)
const SERVICE_BG = '#D9D9D9'   // gris neutre (= ARGB.weekend) — « de service », type selon la semaine

// Repères de colonnes spéciales (libellé court + couleur).
const ROLES_BADGE = [
  { cle: 'rea', court: 'Réa', couleur: '#0E7C66' },
  { cle: 'vacances', court: 'Vacances', couleur: '#2D6CB5' },
  { cle: 'avantWE', court: '→ avant WE', couleur: 'var(--color-primary-dark)' },
  { cle: 'apresWE', court: '↩ après WE', couleur: 'var(--color-primary-dark)' },
]
const COULEUR_REMPLACANT = '#B45309'

const s = {
  table: { borderCollapse: 'collapse', fontSize: 13 },
  thJour: {
    padding: '6px 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
    textAlign: 'left', borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap',
  },
  thCol: {
    padding: '6px 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
    textAlign: 'center', borderBottom: '0.5px solid var(--color-border)',
    borderLeft: '0.5px solid var(--color-border)', minWidth: 96,
  },
  tdJour: {
    padding: '5px 10px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
    borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap',
  },
  tdCell: {
    padding: '5px 8px', fontSize: 13, textAlign: 'center', color: 'var(--color-text)',
    borderBottom: '0.5px solid var(--color-border)', borderLeft: '0.5px solid var(--color-border)',
  },
  repos: { color: 'rgba(0,0,0,0.5)', fontStyle: 'italic', fontSize: 11.5 },
  badge: { fontSize: 10, fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap' },
  // Pastille G/A dans la cellule (lisible en N&B / daltonisme).
  pastille: { fontSize: 9, fontWeight: 700, color: 'rgba(0,0,0,0.55)', marginLeft: 4 },
  legende: { display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' },
  legPuce: { display: 'inline-block', width: 11, height: 11, borderRadius: 2, marginRight: 4, verticalAlign: 'middle', border: '0.5px solid var(--color-border)' },
  assoc: { fontSize: 12, fontWeight: 700, color: 'var(--color-primary-dark)', marginTop: 2 },
}

// colonnesVisibles (optionnel) : indices d'origine à afficher (les numéros C{i+1} sont conservés).
// Absent → toutes les colonnes (étape Trames du faiseur). Fourni → vue allégée (desiderata).
// associeParColonne (optionnel) : { colIndex: ini } → affiche l'associé attribué en en-tête (En semaine).
export default function TrameGrille({ colonnes = [], roles = null, colonnesVisibles = null, onToggleService = null, associeParColonne = null }) {
  const remplA = (i) => roles?.remplacants?.filter(r => r.col === i) ?? []
  // La colonne i porte-t-elle ce rôle ? `vacances` est un TABLEAU d'index (plusieurs colonnes possibles),
  // les autres rôles un index unique.
  const aLeRole = (cle, i) => (cle === 'vacances' ? (roles?.vacances ?? []).includes(i) : roles?.[cle] === i)
  const indices = colonnesVisibles ?? colonnes.map((_, i) => i)
  const aDuService = colonnes.some(c => JOURS.some(j => c?.service?.[j]))

  return (
    <>
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.thJour}>Jour</th>
          {indices.map(i => (
            <th key={i} style={s.thCol}>
              <div>C{i + 1}</div>
              {roles && ROLES_BADGE.filter(r => aLeRole(r.cle, i)).map(r => (
                <div key={r.cle} style={{ ...s.badge, color: r.couleur }}>{r.court}</div>
              ))}
              {remplA(i).map((r, k) => (
                <div key={`r${k}`} style={{ ...s.badge, color: COULEUR_REMPLACANT }}>{r.nom || 'Remplaçant'}</div>
              ))}
              {associeParColonne?.[i] && <div style={s.assoc}>{associeParColonne[i]}</div>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {JOURS.map((j, offset) => (
          <tr key={j}>
            <td style={s.tdJour}>{JOURS_LABEL[j]}</td>
            {indices.map(i => {
              const col = colonnes[i] ?? {}
              const repos = !(col[j] ?? '').trim()
              const deService = col.service?.[j] === true
              // Type fixe lun/mar/mer (§3) ; jeu/ven non figé ici (dépend de la base calendrier).
              const typeFixe = TYPE_FIXE[offset] ?? null
              const estRole = roles && (ROLES_BADGE.some(r => aLeRole(r.cle, i)) || remplA(i).length > 0)
              // Couleur de la cellule de service, dérivée du jour : mar→garde, lun/mer→astreinte,
              // jeu/ven→neutre (« de service », le type vient de la base calendrier).
              const fondService = typeFixe === 'G' ? GARDE_BG : typeFixe === 'A' ? ASTREINTE_BG : SERVICE_BG
              // Priorité de fond : repos (cyan) > de service (couleur du jour) > colonne de rôle > neutre.
              const background = repos
                ? REPOS_BG
                : deService
                  ? fondService
                  : (estRole ? 'var(--color-primary-light)' : 'transparent')
              const cliquable = onToggleService && !repos
              const pastille = deService ? (typeFixe ?? 'Sce') : null
              const titre = cliquable
                ? 'Cliquer : de service ↔ pas de service'
                : (deService && !typeFixe ? 'De service — garde ou astreinte selon la base calendrier' : undefined)
              return (
                <td
                  key={i}
                  style={{ ...s.tdCell, background, cursor: cliquable ? 'pointer' : undefined, userSelect: cliquable ? 'none' : undefined }}
                  onClick={cliquable ? () => onToggleService(i, j) : undefined}
                  title={titre}
                >
                  {repos
                    ? <span style={s.repos}>repos</span>
                    : <>{col[j]}{pastille && <span style={s.pastille}>{pastille}</span>}</>}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
    {aDuService && (
      <div style={s.legende}>
        <span><span style={{ ...s.legPuce, background: GARDE_BG }} />Garde (mardi)</span>
        <span><span style={{ ...s.legPuce, background: ASTREINTE_BG }} />Astreinte (lun/mer)</span>
        <span><span style={{ ...s.legPuce, background: SERVICE_BG }} />De service jeu/ven — type selon la base calendrier</span>
      </div>
    )}
    </>
  )
}
