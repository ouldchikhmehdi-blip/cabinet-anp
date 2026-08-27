// ============================================================
// CalendrierSaisie — le calendrier sur lequel un IADE pose ses jours.
//
// On choisit d'abord la nature du jour (congé payé / récupération de jour férié),
// puis on clique les jours voulus : un clic pose, un clic sur un jour déjà
// sélectionné dans la MÊME nature l'enlève, un clic dans l'autre nature le change.
// Chaque case porte l'abréviation du type (CP / RF) : la couleur ne suffit pas à
// distinguer les deux, notamment à l'impression ou pour un œil peu sensible aux
// nuances.
//
// Les jours déjà déposés (en attente ou validés) sont affichés mais verrouillés :
// on ne peut pas poser deux fois le même jour (index unique côté base).
// ============================================================
import { grilleMois, INITIALES_JOURS, courtType, libelleType, libelleTypeDetaille, libelleStatut, libelleFerie, typeConge, STATUTS } from '../../utils/iadeConges'
import { moisAnneeFR, formatISO } from '../../utils/calendrier'

export default function CalendrierSaisie({
  annee,
  mois,
  onNaviguer,
  typeActif,
  ferieActif = '',
  // iso → { type, ferie } : une récup porte le férié qu'elle récupère.
  selection = new Map(),
  dejaPoses = new Map(),
  onBasculerJour,
  lectureSeule = false,
  // Saisie suspendue tant qu'il manque un préalable (le férié d'une récup) :
  // les jours ne se cliquent pas, et l'écran dit pourquoi au lieu de laisser
  // l'agent cliquer dans le vide.
  bloque = false,
}) {
  const semaines = grilleMois(annee, mois)
  // Le passé n'est pas posable : une demande de congé porte sur des jours à venir.
  const aujourdhui = formatISO(new Date())

  const boutonNav = {
    padding: '6px 12px',
    fontSize: 13,
    borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  }

  function styleCase({ jourInfo, pose, choisi, passe }) {
    const base = {
      // Cases larges et hautes : elles se cliquent au doigt sur un téléphone.
      minHeight: 46,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
      padding: 2,
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-surface)',
      color: 'var(--color-text)',
      fontSize: 14,
      lineHeight: 1.1,
      cursor: 'pointer',
      appearance: 'none',
      WebkitTapHighlightColor: 'transparent',
    }

    if (pose) {
      const st = STATUTS[pose.statut]
      return { ...base, background: st?.fond, color: st?.couleur, borderColor: st?.couleur, cursor: 'not-allowed' }
    }
    if (choisi) {
      const t = typeConge(choisi.type)
      return { ...base, background: t?.couleur, color: '#fff', borderColor: t?.couleur, fontWeight: 600 }
    }
    if (passe) {
      return { ...base, background: 'var(--color-bg)', color: 'var(--color-text-tertiary)', cursor: 'not-allowed', opacity: 0.55 }
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
            textAlign: 'center',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-text-tertiary)',
            paddingBottom: 2,
          }}>
            {initiale}
          </div>
        ))}

        {semaines.flat().map((jourInfo, i) => {
          if (!jourInfo) return <div key={`vide-${i}`} />

          const pose   = dejaPoses.get(jourInfo.iso) ?? null
          const choisi = selection.get(jourInfo.iso) ?? null
          const passe  = jourInfo.iso < aujourdhui
          const inerte = lectureSeule || bloque || !!pose || passe

          const marque = pose ? courtType(pose.type_conge) : choisi ? courtType(choisi.type) : null

          const titre = pose
            ? `${libelleTypeDetaille(pose.type_conge, pose.ferie)} — ${libelleStatut(pose.statut).toLowerCase()}`
            : choisi
              ? libelleTypeDetaille(choisi.type, choisi.ferie)
              : passe
                ? 'Jour passé'
                : jourInfo.ferie
                  ? `${jourInfo.nomFerie} (férié)`
                  : undefined

          return (
            <button
              key={jourInfo.iso}
              type="button"
              title={titre}
              disabled={inerte}
              aria-pressed={!!choisi}
              onClick={() => onBasculerJour?.(jourInfo.iso)}
              style={styleCase({ jourInfo, pose, choisi, passe })}
            >
              <span>{jourInfo.numero}</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.03em', minHeight: 11 }}>
                {marque ?? (jourInfo.ferie ? '•' : '')}
              </span>
            </button>
          )
        })}
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12,
        marginTop: 10, fontSize: 11, color: 'var(--color-text-tertiary)',
      }}>
        <span><strong>CP</strong> congé payé</span>
        <span><strong>RF</strong> récup. jour férié</span>
        <span>• jour férié</span>
        <span>Cases grisées : jours passés, week-ends et fériés</span>
      </div>

      {typeActif && !lectureSeule && (
        <div style={{ marginTop: 6, fontSize: 12, color: bloque ? 'var(--color-amber, #b8860b)' : 'var(--color-text-secondary)' }}>
          {bloque
            ? <>Choisissez d'abord le <strong>jour férié récupéré</strong>, au-dessus : les jours se cliquent ensuite.</>
            : typeActif === 'recup_ferie'
              ? <>Un clic pose une <strong>récup. du {libelleFerie(ferieActif)}</strong> ; cliquez à nouveau pour l'enlever.</>
              : <>Un clic pose un jour de <strong>{libelleType(typeActif).toLowerCase()}</strong> ; cliquez à nouveau pour l'enlever.</>}
        </div>
      )}
    </div>
  )
}
