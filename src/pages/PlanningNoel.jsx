// ============================================================
// PlanningNoel — étape « Noël » : la grille des ~15 jours de Noël, FOURNIE TELLE QUELLE.
// Le faiseur colle depuis Excel (dates en 1ʳᵉ colonne, 8 associés en colonnes, cases colorées) ;
// l'outil DÉTECTE gardes / astreintes (vendredi) / récup JF / semaines de réa et les intègre au
// bilan annuel « Réalisé à ce stade » (cf. PlanningSemaines, sans double comptage sur ces semaines).
// Des badges aux initiales affichent au clic le texte « Fêtes de fin d'année » de chaque associé.
// (cf. PLANNING.md §10 ; noel.js pour le modèle/détection.)
// ============================================================
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ANNEES } from '../utils/calendrier'
import { ANNEE_DEFAUT, normaliser } from '../utils/desiderata'
import { ASSOCIES } from '../data/associes'
import { listerRecueils, chargerTousDesiderata, chargerProfilsAvecInitiales } from '../utils/desiderataApi'
import { chargerNoel, sauverNoel } from '../utils/noelApi'
import { normaliserNoel, bilanNoel } from '../utils/noel'
import { chargerWeekends } from '../utils/weekendsApi'
import { chargerRea } from '../utils/reaApi'
import { chargerVacances } from '../utils/vacancesApi'
import { chargerCalendrier } from '../utils/calendrierApi'
import { exporterCalendrierExcel } from '../utils/exportCalendrier'
import { compteursAmont } from '../utils/grilleSemaine'
import BlocImposeColle from '../components/planning/BlocImposeColle'

const LIGNES_RECAP = [
  ['gWeekend', 'G week-end'],
  ['gVendredi', 'G vendredi'],
  ['aVendredi', 'A vendredi'],
  ['gardeSemaine', 'Gardes de semaine'],
  ['rea', 'Réa'],
  ['recupJF', 'Récup jours fériés'],
  ['vacances', 'Semaines de vacances'],
]

export default function PlanningNoel({ annee: anneeProp, onChangeAnnee, onStatut, onRegisterSave } = {}) {
  const { session, profile } = useAuth()
  const estFaiseur = profile?.is_faiseur === true

  const [anneeInterne, setAnneeInterne] = useState(ANNEE_DEFAUT)
  const annee = anneeProp ?? anneeInterne
  const setAnnee = onChangeAnnee ?? setAnneeInterne

  const [recueils, setRecueils] = useState([])
  const [recueilId, setRecueilId] = useState(null)
  const [profils, setProfils] = useState([])
  const [desideratas, setDesideratas] = useState([])
  const [data, setData] = useState(null) // { v, colle, jours } (grille committée)
  // État annuel : base calendrier + week-ends/réa/vacances → export Noël = calendrier ANNÉE ENTIÈRE
  // finissant par le bloc Noël (les compteurs continués sont calculés dans construireClasseur).
  const [calendrier, setCalendrier] = useState(null)
  const [weekendsAnnee, setWeekendsAnnee] = useState(null)
  const [reaAnnee, setReaAnnee] = useState(null)
  const [vacAnnee, setVacAnnee] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [enregistre, setEnregistre] = useState(false)
  const [exportEnCours, setExportEnCours] = useState(false)
  const [ouvert, setOuvert] = useState(null) // initiales de l'associé dont on montre le texte Noël

  // Recueils « normaux » + profils.
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    Promise.all([listerRecueils(annee), chargerProfilsAvecInitiales()])
      .then(([rs, ps]) => {
        if (annule) return
        const normaux = rs.filter(r => r.type !== 'ete')
        setRecueils(normaux)
        setRecueilId(prev => (normaux.some(r => r.id === prev) ? prev : (normaux[0]?.id ?? null)))
        setProfils(ps)
      })
      .catch(() => { if (!annule) setErreur('Impossible de charger les recueils.') })
    return () => { annule = true }
  }, [annee, estFaiseur])

  // Grille de Noël de l'année.
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    chargerNoel(annee)
      .then(d => { if (!annule) { setData(d); onStatut?.('vierge') } })
      .catch(() => { if (!annule) setErreur('Impossible de charger la grille de Noël.') })
    return () => { annule = true }
  }, [annee, estFaiseur, onStatut])

  // État annuel des week-ends / réa / vacances : sert à calculer le socle PRÉ-Noël (totaux hors Noël),
  // pour que les cases de Noël affichent un n° qui CONTINUE le cumul de l'année.
  useEffect(() => {
    if (!estFaiseur) return
    let annule = false
    Promise.all([chargerCalendrier(annee), chargerWeekends(annee), chargerRea(annee), chargerVacances(annee)])
      .then(([c, w, r, v]) => { if (!annule) { setCalendrier(c); setWeekendsAnnee(w); setReaAnnee(r); setVacAnnee(v) } })
      .catch(() => { /* silencieux : sans ces données, l'export Noël reste possible mais incomplet */ })
    return () => { annule = true }
  }, [annee, estFaiseur])

  // Desiderata du recueil sélectionné (pour le texte « Fêtes de fin d'année » des badges).
  useEffect(() => {
    if (!estFaiseur || !recueilId) return
    let annule = false
    chargerTousDesiderata(recueilId)
      .then(rows => { if (!annule) setDesideratas(rows) })
      .catch(() => {})
    return () => { annule = true }
  }, [recueilId, estFaiseur])

  // Texte Noël par associé (initiales → texte).
  const noelParAssocie = useMemo(() => {
    const parUser = {}
    for (const p of profils) parUser[p.id] = p.initiales
    const m = {}
    for (const row of desideratas) {
      const ini = parUser[row.user_id]
      if (ini) m[ini] = (normaliser(row.data).noel ?? '').trim()
    }
    return m
  }, [profils, desideratas])

  const jours = useMemo(() => {
    const js = (data?.jours ?? []).slice()
    js.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0))
    return js
  }, [data])

  const recap = useMemo(() => (data ? bilanNoel(data, annee) : null), [data, annee])

  // Figer / effacer la grille (callbacks du composant de collage partagé BlocImposeColle).
  function ajouterGrille(grille) {
    setEnregistre(false); onStatut?.('modifie')
    setData(grille)
  }
  function effacerGrille() {
    if (!window.confirm('Effacer la grille de Noël de cette année ?')) return
    setEnregistre(false); onStatut?.('modifie')
    setData(normaliserNoel({ colle: '', jours: [] }))
  }

  async function enregistrer() {
    setErreur(null)
    try {
      await sauverNoel(annee, data, session.user.id)
      setEnregistre(true); onStatut?.('enregistre')
      setTimeout(() => setEnregistre(false), 3000)
      return true
    } catch {
      setErreur('Enregistrement impossible (réservé au faiseur).')
      return false
    }
  }

  // Permet au parent (assistant) de déclencher cet enregistrement avant un changement d'étape.
  useEffect(() => { onRegisterSave?.(enregistrer) })

  // Export Excel : calendrier de l'année entière (dates continues) finissant par le bloc Noël.
  async function exporter() {
    if (!data) return
    if (!calendrier) { setErreur('Base calendrier non chargée : réessayez dans un instant.'); return }
    setErreur(null); setExportEnCours(true)
    try {
      // Calendrier ANNÉE ENTIÈRE (dates continues + week-ends/vacances/réa) finissant par le bloc Noël.
      // Les compteurs (année-à-date) et le prolongement dans Noël sont calculés dans construireClasseur.
      await exporterCalendrierExcel(
        annee, calendrier, null,
        weekendsAnnee?.affectations, vacAnnee?.vacances, reaAnnee?.rea,
        null, null, null, null, null, null,
        compteursAmont(annee, { weekendAff: weekendsAnnee?.affectations, vacanciers: vacAnnee?.vacances, reaAff: reaAnnee?.rea }),
        data,
      )
    } catch {
      setErreur('Export Excel impossible.')
    } finally {
      setExportEnCours(false)
    }
  }

  // ── Styles ──
  const s = {
    select: {
      padding: '8px 12px', fontSize: 14, border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
    },
    bouton: {
      padding: '10px 20px', background: 'var(--color-primary)', color: '#fff', border: 'none',
      borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500,
    },
    carte: {
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 24,
    },
    titreSection: { fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 },
    aide: { fontSize: 12.5, color: 'var(--color-text-secondary)', marginBottom: 12, lineHeight: 1.5 },
    recapTh: { padding: '4px 10px', fontSize: 12, fontWeight: 700, color: 'var(--color-text)', textAlign: 'center', borderBottom: '0.5px solid var(--color-border)', whiteSpace: 'nowrap' },
    recapTdLabel: { padding: '4px 10px', fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', borderBottom: '0.5px solid var(--color-border)' },
    recapTd: { padding: '4px 10px', fontSize: 12.5, textAlign: 'center', color: 'var(--color-text)', borderBottom: '0.5px solid var(--color-border)' },
    badge: (actif, aTexte) => ({
      padding: '5px 11px', fontSize: 13, fontWeight: 600, borderRadius: 999, cursor: 'pointer',
      border: `0.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-border)'}`,
      background: actif ? 'var(--color-primary)' : 'var(--color-bg)',
      color: actif ? '#fff' : aTexte ? 'var(--color-text)' : 'var(--color-text-tertiary)',
    }),
  }

  if (!estFaiseur) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Noël</h1>
        <div style={{ ...s.carte, color: 'var(--color-text-secondary)', fontSize: 14, padding: 24 }}>
          Cette page est réservée au faiseur de planning.
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Noël {annee}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        La rotation des ~15 jours de Noël est <strong>fournie telle quelle</strong> (pas calculée par l'outil).
        Collez la grille depuis Excel (<strong>dates en 1ʳᵉ colonne</strong>, les <strong>8 associés en
        colonnes</strong>, cases <strong>jaune = garde</strong> / <strong>orange = astreinte</strong>) : l'outil
        détecte gardes, astreintes du vendredi, récup jours fériés et semaines de réa, et les <strong>ajoute au
        bilan annuel</strong> « Réalisé à ce stade ».
      </p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Année</label>
          <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={s.select}>
            {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Période (desiderata des badges)</label>
          <select value={recueilId ?? ''} onChange={e => setRecueilId(e.target.value || null)} style={s.select} disabled={recueils.length === 0}>
            {recueils.length === 0 && <option value="">Aucun recueil</option>}
            {recueils.map(r => <option key={r.id} value={r.id}>{r.nom} · S{r.semaine_debut}→S{r.semaine_fin}</option>)}
          </select>
        </div>
        <button type="button" onClick={enregistrer} disabled={data === null} style={{ ...s.bouton, padding: '8px 14px', fontSize: 13, opacity: data === null ? 0.5 : 1 }}>
          Enregistrer
        </button>
        <button
          type="button"
          onClick={exporter}
          disabled={data === null || exportEnCours}
          style={{ ...s.bouton, padding: '8px 14px', fontSize: 13, background: 'transparent', color: 'var(--color-primary)', border: '0.5px solid var(--color-primary)', opacity: (data === null || exportEnCours) ? 0.6 : 1 }}
          title="Génère un fichier Excel : la grille de Noël + le tableau « Réalisé à ce stade » (gardes/astreintes de Noël)"
        >
          {exportEnCours ? 'Export…' : '⬇ Exporter en Excel'}
        </button>
        {enregistre && <span style={{ fontSize: 13, color: 'var(--color-success)', alignSelf: 'center' }}>Enregistré ✓</span>}
      </div>

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          {erreur}
        </div>
      )}

      {data === null ? (
        <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Chargement…</div>
      ) : (
        <>
          {/* Badges desiderata « Fêtes de fin d'année » */}
          <div style={s.carte}>
            <div style={s.titreSection}>Souhaits des associés pour les fêtes de fin d'année</div>
            <p style={s.aide}>Cliquez une initiale pour afficher le texte que l'associé a rédigé (recliquez pour masquer).</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ASSOCIES.map(ini => {
                const aTexte = !!noelParAssocie[ini]
                return (
                  <button key={ini} type="button" onClick={() => setOuvert(o => (o === ini ? null : ini))} style={s.badge(ouvert === ini, aTexte)} title={aTexte ? 'Voir le souhait de fin d’année' : 'Aucun texte saisi'}>
                    {ini}{aTexte ? '' : ' ·'}
                  </button>
                )
              })}
            </div>
            {ouvert && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--color-bg)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary-dark)', marginBottom: 4 }}>{ouvert} — Fêtes de fin d'année</div>
                <div style={{ fontSize: 13, color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>
                  {noelParAssocie[ouvert] || <span style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>Aucun souhait saisi.</span>}
                </div>
              </div>
            )}
          </div>

          {/* Collage + aperçu (composant partagé avec le panneau Toussaint de l'onglet Vacances) */}
          <BlocImposeColle
            annee={annee}
            data={data}
            nom="grille de Noël"
            sousTitreGrille="apparaît telle quelle dans l'export Excel"
            onAjouter={ajouterGrille}
            onEffacer={effacerGrille}
            aide={(
              <p style={s.aide}>
                Sélectionnez dans Excel le bloc complet : <strong>ligne d'en-tête</strong> (les initiales des
                associés), <strong>colonne des dates</strong> à gauche (incluez les <strong>week-ends de garde
                avant et après</strong> les 15 jours), et les cases colorées, puis collez ci-dessous (Ctrl+V). Les
                fonds <strong>jaune (garde)</strong> et <strong>orange (astreinte)</strong> sont lus automatiquement ;
                une case vide = repos. Vérifiez l'aperçu, puis <strong>Ajouter</strong>.
              </p>
            )}
          />

          {/* Récap détecté par associé */}
          {recap && jours.length > 0 && (
            <div style={{ ...s.carte, overflowX: 'auto' }}>
              <div style={{ ...s.titreSection, marginBottom: 8 }}>Détecté pour Noël (ajouté au bilan annuel)</div>
              <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ ...s.recapTdLabel, fontWeight: 700 }}>&nbsp;</th>
                    {ASSOCIES.map(ini => <th key={ini} style={s.recapTh}>{ini}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {LIGNES_RECAP.map(([cle, label]) => (
                    <tr key={cle}>
                      <td style={s.recapTdLabel}>{label}</td>
                      {ASSOCIES.map(ini => <td key={ini} style={s.recapTd}>{recap.parAssocie[ini]?.[cle] ?? 0}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
