import { useState, useEffect, useMemo } from 'react'
import {
  numeroSemaineISO, lundiDeSemaineISO, formatISO, moisAnneeFR,
  blocsVacancesScolaires, joursFeriesFR,
} from '../utils/calendrier'
import { ASSOCIES } from '../data/associes'
import { normaliser } from '../utils/desiderata'
import { listerRecueils, chargerTousDesiderata, chargerProfilsAvecInitiales } from '../utils/desiderataApi'
import { chargerCalendrier } from '../utils/calendrierApi'
import { chargerTrames } from '../utils/tramesApi'
import RecapVacancesScolaires from '../components/planning/RecapVacancesScolaires'
import TrameGrille from '../components/planning/TrameGrille'

// ============================================================
// PlanningAffiche — vue calendrier mensuelle DYNAMIQUE des desiderata de tous les associés
// (PLANNING.md « Ouverture du planning »). Ouverte en NOUVEL ONGLET plein écran (sans sidebar)
// depuis PlanningSuivi, pour les tiers 1 et 3 (pas l'été). Params URL : ?recueil=<id>&annee=<n>.
// Report à la bonne date : week-ends indispo (+ veille vendredi), jours off, souhaits de colonne
// (lun→ven), vacances souhaitées / non souhaitées / scolaires. Chaque associé et chaque calque sont
// activables/désactivables. Repères TOUJOURS affichés : jours fériés (couleur + libellé) et
// surbrillance période scolaire. Panneaux à ouvrir au besoin : chaque trame (semaine type) par son
// nom — principale en tête (★) — et résumé des vacances scolaires (badge bleu). Lecture seule.
// ============================================================

const JOUR_MS = 24 * 60 * 60 * 1000
const JOURS_ENTETE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const BLEU_SCOLAIRE = '#E3EEF9' // teinte « vacances scolaires » (cohérente avec le bleu des sélecteurs)

// Couleur par associé (8) — distinctes, lisibles en thème CLAIR comme SOMBRE.
// ⚠️ Clés = initiales : à mettre à jour lors d'un remplacement d'associé
//    (cf. PLANNING.md « Remplacer un associé / changer une initiale »).
const COULEUR_ASSOCIE = {
  EH: '#3B82C4', MP: '#1D9E75', RC: '#E8912A', FXD: '#C2476B',
  BA: '#8B5CF6', FF: '#0E9AA5', YC: '#D8593A', MOC: '#6B7BD6',
}
// Couleur de repli : une initiale sans entrée dédiée (ex. nouvel associé pas
// encore ajouté ci-dessus) reste affichée correctement, jamais « undefined ».
const COULEUR_DEFAUT = '#64748B'
const coul = (ini) => COULEUR_ASSOCIE[ini] ?? COULEUR_DEFAUT

// Calques de desiderata (chacun activable). L'ordre fixe l'affichage de la barre de contrôle.
const CALQUES = [
  { id: 'weekends', label: 'Week-ends indispo' },
  { id: 'joursOff', label: 'Jours off' },
  { id: 'colonnes', label: 'Souhaits de colonne' },
  { id: 'vacSouhait', label: 'Vacances souhaitées' },
  { id: 'vacScol', label: 'Vacances scolaires (souhaits)' },
  { id: 'vacRefus', label: 'Vacances non souhaitées' },
]
const CALQUES_TOUS = Object.fromEntries(CALQUES.map(c => [c.id, true]))
const CALQUES_AUCUN = Object.fromEntries(CALQUES.map(c => [c.id, false]))

// Libellé court de la catégorie d'une entrée (affiché à côté des initiales).
function glyphe(e) {
  switch (e.kind) {
    case 'we': return 'WE'
    case 'veille': return '∅ G/A'
    case 'off': return 'off'
    case 'col': return `C${e.col + 1}`
    case 'vacSouhait': return 'vac'
    case 'vacRefus': return '✕vac'
    case 'vacScol': return e.periode === 'toussaint' ? 'Touss.' : e.periode === 'fevrier' ? 'Fév.' : 'Pâq.'
    default: return ''
  }
}

function titreEntree(e) {
  switch (e.kind) {
    case 'we': return `${e.ini} — week-end indisponible`
    case 'veille': return `${e.ini} — pas de garde/astreinte le vendredi (veille du week-end indisponible)`
    case 'off': return `${e.ini} — jour off souhaité`
    case 'col': return `${e.ini} — souhait de colonne C${e.col + 1} (colonne particulière)`
    case 'vacSouhait': return `${e.ini} — semaine de vacances souhaitée`
    case 'vacRefus': return `${e.ini} — semaine SANS vacances (refusée)`
    case 'vacScol': return `${e.ini} — vacances scolaires souhaitées (${glyphe(e)})`
    default: return e.ini
  }
}

// Libellé court d'un jour férié (« Lundi de Pentecôte » → « Pentecôte »).
const ferieCourt = (nom) => (nom ?? '').replace(/^Lundi de /, '')

export default function PlanningAffiche() {
  const params = new URLSearchParams(window.location.search)
  const recueilId = params.get('recueil')
  const annee = Number(params.get('annee'))

  const [recueil, setRecueil] = useState(null)
  const [desiderataParAssocie, setDesiderataParAssocie] = useState({})
  const [vacancesScolaires, setVacancesScolaires] = useState([])
  const [trames, setTrames] = useState([])
  const [principaleId, setPrincipaleId] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)

  // Contrôles dynamiques.
  const [moisIndex, setMoisIndex] = useState(0)
  const [associesVisibles, setAssociesVisibles] = useState(() => new Set(ASSOCIES))
  const [calques, setCalques] = useState(() => ({ ...CALQUES_TOUS }))
  const [trameVisibleId, setTrameVisibleId] = useState(null)
  const [voirRecapScolaire, setVoirRecapScolaire] = useState(false)

  // ── Chargement ──
  useEffect(() => {
    let annule = false
    Promise.all([listerRecueils(annee), chargerTousDesiderata(recueilId), chargerProfilsAvecInitiales(), chargerCalendrier(annee), chargerTrames(annee)])
      .then(([recueils, desideratas, profils, calendrier, tramesData]) => {
        if (annule) return
        const r = recueils.find(x => x.id === recueilId) ?? null
        setRecueil(r)
        const parUser = {}
        for (const p of profils) parUser[p.id] = p.initiales
        const map = {}
        for (const row of desideratas) {
          const ini = parUser[row.user_id]
          if (ini) map[ini] = normaliser(row.data)
        }
        setDesiderataParAssocie(map)
        setVacancesScolaires(calendrier?.vacancesScolaires ?? [])
        setTrames(tramesData?.trames ?? [])
        setPrincipaleId(tramesData?.principaleId ?? null)
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger les desiderata de cette période.') })
      .finally(() => { if (!annule) setChargement(false) })
    return () => { annule = true }
  }, [recueilId, annee])

  const scolairesSet = useMemo(() => new Set(vacancesScolaires), [vacancesScolaires])

  // ── Report des desiderata à la bonne date : Map<iso, entrée[]> (toutes catégories, tous associés) ──
  const entreesParJour = useMemo(() => {
    const map = new Map()
    const ajouter = (iso, e) => { (map.get(iso) ?? map.set(iso, []).get(iso)).push(e) }
    const lundi = (w) => lundiDeSemaineISO(annee, w)
    const isoOffset = (w, off) => formatISO(new Date(lundi(w).getTime() + off * JOUR_MS))
    const blocs = blocsVacancesScolaires(annee, vacancesScolaires)
    const semainesPref = (bloc, sem) => {
      if (!bloc?.length) return []
      if (sem === 's1') return [bloc[0]]
      if (sem === 's2') return bloc.length > 1 ? [bloc[1]] : [bloc[0]]
      return bloc // 'indifferent' (ou null) → tout le bloc
    }

    for (const ini of ASSOCIES) {
      const d = desiderataParAssocie[ini]
      if (!d) continue
      // Week-ends indisponibles (+ veille vendredi).
      for (const w of (d.weekendsIndispo ?? [])) {
        ajouter(isoOffset(w, 5), { ini, calque: 'weekends', kind: 'we' }) // samedi
        ajouter(isoOffset(w, 6), { ini, calque: 'weekends', kind: 'we' }) // dimanche
        if ((d.weekendsVeilleIndispo ?? []).includes(w)) {
          ajouter(isoOffset(w, 4), { ini, calque: 'weekends', kind: 'veille' }) // vendredi
        }
      }
      // Jours off souhaités (date exacte).
      for (const iso of (d.joursOffSouhaites ?? [])) ajouter(iso, { ini, calque: 'joursOff', kind: 'off' })
      // Souhaits de colonne (lun→ven de la semaine).
      for (const [sem, col] of Object.entries(d.colonnesSouhaitees ?? {})) {
        const w = Number(sem)
        for (let off = 0; off <= 4; off++) ajouter(isoOffset(w, off), { ini, calque: 'colonnes', kind: 'col', col: Number(col) })
      }
      // Vacances souhaitées / non souhaitées (lun→dim de la semaine) — calques distincts.
      for (const w of (d.vacancesSouhaitees ?? [])) for (let off = 0; off <= 6; off++) ajouter(isoOffset(w, off), { ini, calque: 'vacSouhait', kind: 'vacSouhait' })
      for (const w of (d.vacancesRefusees ?? [])) for (let off = 0; off <= 6; off++) ajouter(isoOffset(w, off), { ini, calque: 'vacRefus', kind: 'vacRefus' })
      // Préférence vacances scolaires (février / Pâques) + Toussaint (lun→ven).
      const ajoutScol = (periode, weeks) => {
        for (const w of weeks) for (let off = 0; off <= 4; off++) ajouter(isoOffset(w, off), { ini, calque: 'vacScol', kind: 'vacScol', periode })
      }
      if (d.preferenceVacancesScolaires === 'fevrier') ajoutScol('fevrier', semainesPref(blocs.fevrier, d.prefVacancesSemaine))
      else if (d.preferenceVacancesScolaires === 'paques') ajoutScol('paques', semainesPref(blocs.paques, d.prefVacancesSemaine))
      if (d.toussaintSouhaitee === true) ajoutScol('toussaint', semainesPref(blocs.toussaint, d.toussaintSemaine))
    }
    return map
  }, [desiderataParAssocie, annee, vacancesScolaires])

  // ── Mois couverts par la période (pour la navigation ‹ › et les badges) ──
  const mois = useMemo(() => {
    if (!recueil) return []
    const debut = lundiDeSemaineISO(annee, recueil.semaine_debut)
    const fin = new Date(lundiDeSemaineISO(annee, recueil.semaine_fin).getTime() + 6 * JOUR_MS)
    const liste = []
    for (let y = debut.getUTCFullYear(), m = debut.getUTCMonth();
      y < fin.getUTCFullYear() || (y === fin.getUTCFullYear() && m <= fin.getUTCMonth());) {
      liste.push({ y, m })
      m++; if (m > 11) { m = 0; y++ }
    }
    return liste
  }, [recueil, annee])

  const moisCourant = mois[Math.min(moisIndex, Math.max(0, mois.length - 1))] ?? null

  // ── Jours fériés (nom par ISO) de l'année ──
  const feriesParIso = useMemo(() => {
    const m = new Map()
    for (const f of joursFeriesFR(annee)) m.set(f.iso, f.nom)
    return m
  }, [annee])

  // ── Grille du mois courant : semaines complètes (lundi → dimanche), débordements grisés ──
  const semainesGrille = useMemo(() => {
    if (!moisCourant) return []
    const { y, m } = moisCourant
    const premier = new Date(Date.UTC(y, m, 1))
    const decalage = (premier.getUTCDay() + 6) % 7 // lundi = 0
    const debut = new Date(premier.getTime() - decalage * JOUR_MS)
    const dernier = new Date(Date.UTC(y, m + 1, 0))
    const decalageFin = (dernier.getUTCDay() + 6) % 7
    const nbJours = decalage + dernier.getUTCDate() + (6 - decalageFin)
    const semaines = []
    for (let i = 0; i < nbJours; i += 7) {
      const ligne = []
      for (let j = 0; j < 7; j++) {
        const date = new Date(debut.getTime() + (i + j) * JOUR_MS)
        ligne.push({ date, iso: formatISO(date), dansMois: date.getUTCMonth() === m && date.getUTCFullYear() === y })
      }
      semaines.push(ligne)
    }
    return semaines
  }, [moisCourant])

  const toggleAssocie = (ini) => setAssociesVisibles(prev => {
    const s = new Set(prev)
    if (s.has(ini)) s.delete(ini); else s.add(ini)
    return s
  })
  const toggleCalque = (id) => setCalques(prev => ({ ...prev, [id]: !prev[id] }))

  // Associé unique sélectionné → son texte libre (commentaire) affiché à côté du titre.
  const seulAssocie = associesVisibles.size === 1 ? [...associesVisibles][0] : null

  // Trames ouvrables dans le panneau : principale en tête, puis les autres ; chacune affichable d'un clic.
  const tramesAffichees = useMemo(() => {
    const p = trames.find(t => t.id === principaleId)
    const autres = trames.filter(t => t.id !== principaleId)
    return p ? [p, ...autres] : autres
  }, [trames, principaleId])
  const nomTrame = (t, i) => (t.nom?.trim() || `Trame ${i + 1}`)
  const trameVisible = tramesAffichees.find(t => t.id === trameVisibleId) ?? null

  // ── Styles ──
  const s = {
    page: { minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', padding: '16px 20px 32px' },
    barre: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 10 },
    titre: { fontSize: 18, fontWeight: 700 },
    sousTitre: { fontSize: 12, color: 'var(--color-text-secondary)' },
    fleche: (actif) => ({
      border: '0.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)',
      borderRadius: 'var(--radius-md)', width: 34, height: 30, fontSize: 16, cursor: actif ? 'pointer' : 'default',
      opacity: actif ? 1 : 0.4,
    }),
    badges: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
    badge: (actif) => ({
      fontSize: 11, padding: '3px 10px', borderRadius: 999, cursor: 'pointer', userSelect: 'none',
      border: `0.5px solid ${actif ? 'var(--color-text-tertiary)' : 'var(--color-border)'}`,
      background: actif ? 'var(--color-text)' : 'var(--color-surface)',
      color: actif ? 'var(--color-bg)' : 'var(--color-text-secondary)',
      fontWeight: actif ? 600 : 400,
    }),
    libre: (ini) => ({
      display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 12px',
      borderRadius: 'var(--radius-md)', border: `1px solid ${coul(ini)}`,
      background: coul(ini) + '14', flex: '1 1 280px', minWidth: 0,
    }),
    libreIni: (ini) => ({ fontSize: 13, fontWeight: 700, color: coul(ini), whiteSpace: 'nowrap' }),
    // Une seule ligne (ellipsis) pour ne pas faire varier la hauteur de la barre ; texte complet en infobulle.
    libreTxt: { fontSize: 13, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    libreVide: { fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic' },
    controles: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 },
    groupe: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
    legendeTitre: { fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 4, alignSelf: 'center', minWidth: 64 },
    mini: {
      fontSize: 11, padding: '3px 9px', borderRadius: 999, cursor: 'pointer', userSelect: 'none',
      border: '0.5px dashed var(--color-text-tertiary)', background: 'transparent', color: 'var(--color-text-secondary)',
    },
    chipAssoc: (ini, actif) => ({
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600,
      borderRadius: 999, cursor: 'pointer', userSelect: 'none',
      border: `1px solid ${coul(ini)}`,
      background: actif ? coul(ini) + '22' : 'transparent',
      color: actif ? coul(ini) : 'var(--color-text-tertiary)',
      opacity: actif ? 1 : 0.5,
    }),
    chip: (actif) => ({
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12,
      borderRadius: 999, cursor: 'pointer', userSelect: 'none',
      border: '0.5px solid var(--color-border)',
      background: actif ? 'var(--color-text)' : 'transparent',
      color: actif ? 'var(--color-bg)' : 'var(--color-text-tertiary)',
      opacity: actif ? 1 : 0.6,
    }),
    // Chip « vacances scolaires » : visuel bleu dédié (cohérent avec le bleu scolaire), volontairement distinct des autres chips.
    chipBleu: (actif) => ({
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12,
      borderRadius: 999, cursor: 'pointer', userSelect: 'none',
      border: '0.5px solid #2D6CB5',
      background: actif ? '#2D6CB5' : 'transparent',
      color: actif ? '#fff' : '#2D6CB5',
    }),
    panneau: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '12px 16px', marginBottom: 14, overflowX: 'auto',
    },
    grille: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'var(--color-border)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' },
    entete: { background: 'var(--color-surface)', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', padding: '6px 0' },
    cellule: (dansMois, fond) => ({
      background: fond, minHeight: 96, padding: '4px 5px', display: 'flex', flexDirection: 'column', gap: 3,
      opacity: dansMois ? 1 : 0.45,
    }),
    enteteJour: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
    ferieTxt: { fontSize: 9, fontWeight: 700, color: 'var(--color-amber)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' },
    numJour: (weekend) => ({ fontSize: 11, fontWeight: 600, color: weekend ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)' }),
    puce: (ini, refus) => ({
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 6px', fontSize: 10.5, fontWeight: 600,
      borderRadius: 6, border: `0.5px solid ${coul(ini)}`, background: coul(ini) + '22',
      color: coul(ini), lineHeight: 1.5, whiteSpace: 'nowrap',
      textDecoration: refus ? 'line-through' : 'none',
    }),
    glyphe: { fontSize: 9, fontWeight: 500, opacity: 0.85 },
  }

  if (chargement) return <div style={s.page}>Chargement…</div>
  if (erreur) return <div style={{ ...s.page, color: 'var(--color-danger)' }}>{erreur}</div>
  if (!recueil) return <div style={s.page}>Période introuvable.</div>

  return (
    <div style={s.page}>
      <div style={s.barre}>
        <div>
          <div style={s.titre}>🗓️ Vue desiderata — {recueil.nom}</div>
          <div style={s.sousTitre}>{annee} · S{recueil.semaine_debut} → S{recueil.semaine_fin}</div>
        </div>
        {/* Texte libre de l'associé seul sélectionné : à côté du titre, pour ne pas décaler les contrôles. */}
        {seulAssocie && (
          <div style={s.libre(seulAssocie)}>
            <span style={s.libreIni(seulAssocie)}>{seulAssocie} — texte libre :</span>
            {(desiderataParAssocie[seulAssocie]?.commentaire ?? '').trim()
              ? <span style={s.libreTxt} title={desiderataParAssocie[seulAssocie].commentaire}>{desiderataParAssocie[seulAssocie].commentaire}</span>
              : <span style={s.libreVide}>aucun commentaire</span>}
          </div>
        )}
      </div>

      {/* Navigation mensuelle : flèches ‹ › collées aux badges (saut direct à un mois) */}
      <div style={s.badges}>
        <button type="button" style={s.fleche(moisIndex > 0)} disabled={moisIndex <= 0} onClick={() => setMoisIndex(i => Math.max(0, i - 1))} aria-label="Mois précédent">‹</button>
        <button type="button" style={s.fleche(moisIndex < mois.length - 1)} disabled={moisIndex >= mois.length - 1} onClick={() => setMoisIndex(i => Math.min(mois.length - 1, i + 1))} aria-label="Mois suivant">›</button>
        {mois.map((mm, i) => (
          <span key={`${mm.y}-${mm.m}`} style={s.badge(i === moisIndex)} onClick={() => setMoisIndex(i)}>
            {moisAnneeFR(new Date(Date.UTC(mm.y, mm.m, 1)))}
          </span>
        ))}
      </div>

      <div style={s.controles}>
        <div style={s.groupe}>
          <span style={s.legendeTitre}>Associés</span>
          <span style={s.mini} onClick={() => setAssociesVisibles(new Set(ASSOCIES))}>Tout afficher</span>
          <span style={s.mini} onClick={() => setAssociesVisibles(new Set())}>Tout masquer</span>
          {ASSOCIES.map(ini => (
            <span key={ini} style={s.chipAssoc(ini, associesVisibles.has(ini))} onClick={() => toggleAssocie(ini)} title="Afficher / masquer cet associé">{ini}</span>
          ))}
        </div>
        <div style={s.groupe}>
          <span style={s.legendeTitre}>Calques</span>
          <span style={s.mini} onClick={() => setCalques({ ...CALQUES_AUCUN })}>Tout masquer</span>
          {CALQUES.map(c => (
            <span key={c.id} style={s.chip(calques[c.id])} onClick={() => toggleCalque(c.id)} title="Afficher / masquer ce type de desiderata">{c.label}</span>
          ))}
        </div>
        <div style={s.groupe}>
          <span style={s.legendeTitre}>Panneaux</span>
          {tramesAffichees.map((t, i) => (
            <span
              key={t.id ?? i}
              style={s.chip(trameVisibleId === t.id)}
              onClick={() => setTrameVisibleId(id => (id === t.id ? null : t.id))}
              title={t.id === principaleId ? 'Trame principale (semaine type)' : 'Afficher cette trame (semaine type)'}
            >
              {t.id === principaleId ? '★ ' : ''}{nomTrame(t, i)}
            </span>
          ))}
          <span style={s.chipBleu(voirRecapScolaire)} onClick={() => setVoirRecapScolaire(v => !v)} title="Résumé des souhaits de vacances scolaires de tous les associés">📚 Résumé vac. scolaires</span>
        </div>
      </div>

      {trameVisible && (
        <div style={s.panneau}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            {trameVisible.id === principaleId ? '★ ' : ''}{trameVisible.nom?.trim() || 'Trame'}{trameVisible.id === principaleId ? ' (principale)' : ''}
          </div>
          <TrameGrille colonnes={trameVisible.colonnes} roles={trameVisible} />
        </div>
      )}

      {voirRecapScolaire && (
        <div style={s.panneau}>
          <RecapVacancesScolaires desiderataParAssocie={desiderataParAssocie} scolairesSet={scolairesSet} />
        </div>
      )}

      <div style={s.grille}>
        {JOURS_ENTETE.map((j, i) => <div key={`e${i}`} style={s.entete}>{j}</div>)}
        {semainesGrille.flatMap((ligne) => ligne.map(({ date, iso, dansMois }) => {
          const jourSem = date.getUTCDay()
          const weekend = jourSem === 0 || jourSem === 6
          // Jours fériés + surbrillance période scolaire : toujours affichés (repères automatiques).
          const ferie = feriesParIso.has(iso)
          const scolaire = scolairesSet.has(numeroSemaineISO(date))
          // Priorité de fond : férié > scolaire > week-end/débordement > normal.
          const fond = !dansMois ? 'var(--color-bg)'
            : ferie ? 'var(--color-amber-light)'
              : scolaire ? BLEU_SCOLAIRE
                : weekend ? 'var(--color-bg)' : 'var(--color-surface)'
          const entrees = (entreesParJour.get(iso) ?? [])
            .filter(e => associesVisibles.has(e.ini) && calques[e.calque])
          return (
            <div key={iso} style={s.cellule(dansMois, fond)} title={ferie ? feriesParIso.get(iso) : undefined}>
              <div style={s.enteteJour}>
                {dansMois && ferie ? <span style={s.ferieTxt}>{ferieCourt(feriesParIso.get(iso))}</span> : <span />}
                <span style={s.numJour(weekend)}>{date.getUTCDate()}</span>
              </div>
              {dansMois && entrees.map((e, k) => (
                <span key={k} style={s.puce(e.ini, e.kind === 'vacRefus')} title={titreEntree(e)}>
                  {e.ini}<span style={s.glyphe}>{glyphe(e)}</span>
                </span>
              ))}
            </div>
          )
        }))}
      </div>
    </div>
  )
}
