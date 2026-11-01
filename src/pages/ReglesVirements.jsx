import { useMemo, useRef, useState } from 'react'
import { fmtEur } from '../data/mockData'
import { TAXONOMIE, CATEGORIES_ASSOCIE, CATEGORIES_CHOISISSABLES, groupeDe, catColor } from '../data/categories'
import SelecteurCategorie from '../components/SelecteurCategorie'
import EtatCompta from '../components/EtatCompta'
import { useCompta, majComptaLocale, rechargerCompta } from '../data/compta'
import { sauverDocRegles, classerManuellement, reclasserTout, importerReleve } from '../data/comptaApi'
import { verifierRegles, A_ARBITRER } from '../../compta/moteur.js'

// ---- Petites aides ----

const LISTES = [
  { cle: 'iade_cdi', titre: 'IADE en CDI', aide: 'motif SALAIRE + ce nom → Salaire IADE CDI' },
  { cle: 'iade_cdd', titre: 'IADE remplaçants (CDD)', aide: 'motif SALAIRE + ce nom → Remplaçant IADE (CDD)' },
  { cle: 'mar_remplacants', titre: 'Remplaçants MAR', aide: 'motif REMPLA + ce nom → Remplaçant MAR' },
]

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)
const dateFr = (iso) => iso.split('-').reverse().join('/')

// Nom probable d'une personne dans un motif « SALAIRE X » / « REMPLA DR X »
function nomDansMotif(libelle) {
  const m = libelle.match(/\/MOTIF\s*(.*?)(?:\s*\/BEN|$)/i)
  if (!m) return ''
  return m[1].replace(/\b(SALAIRES?|SALAIR|REMPLA|RMPLA|REMPLACANT|REMPLACEMENT|SDF|DR|MR|MME|M)\b/gi, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
}

const cardStyle = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }
const champStyle = { fontSize: 12, padding: '6px 8px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }
const boutonStyle = (actif, couleur = '#1D9E75', fond = '#E1F5EE', texte = '#085041') => ({
  fontSize: 11, padding: '5px 12px', borderRadius: 'var(--radius-md)', border: `0.5px solid ${actif ? couleur : 'var(--color-border)'}`,
  background: actif ? fond : 'var(--color-bg)', color: actif ? texte : 'var(--color-text-tertiary)', cursor: actif ? 'pointer' : 'default',
})
const sousTitre = { fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }
const pastille = (cat) => <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, ...catColor(cat) }}>{cat}</span>

// ---- Page ----

// `lectureSeule` : associés non administrateurs. Ils voient tout (file d'attente, alertes,
// dictionnaire) mais aucun contrôle de modification n'est affiché ; la base refuse de toute
// façon l'écriture aux non-admins (policies is_admin() sur compta_*).
export default function ReglesVirements({ lectureSeule = false }) {
  const etat = useCompta()
  const { doc, transactions } = etat
  const [message, setMessage] = useState('')
  const [occupe, setOccupe] = useState(false)
  const fichierRef = useRef(null)
  const reglesRef = useRef(null)

  const aArbitrer = useMemo(() => transactions.filter(t => t.categorie === A_ARBITRER).sort((a, b) => b.date.localeCompare(a.date)), [transactions])
  const enAlerte = useMemo(() => transactions.filter(t => t.alerte && t.categorie !== A_ARBITRER).sort((a, b) => b.date.localeCompare(a.date)), [transactions])

  // Toute modification du dictionnaire : sauvegarde, reclassement des lignes non manuelles, rechargement
  const appliquerDoc = async (nouveauDoc, quoi) => {
    const pb = verifierRegles(nouveauDoc)
    if (pb.length) { setMessage(`Dictionnaire refusé : ${pb.join(' ; ')}`); return }
    setOccupe(true)
    try {
      await sauverDocRegles(nouveauDoc)
      const n = await reclasserTout(nouveauDoc, transactions)
      await rechargerCompta()
      setMessage(`${quoi} · ${n} ligne${n > 1 ? 's' : ''} reclassée${n > 1 ? 's' : ''}`)
    } catch (e) {
      setMessage(`Échec : ${e.message || e}`)
    } finally {
      setOccupe(false)
    }
  }

  const classerLigne = async (t, categorie, associe) => {
    setOccupe(true)
    try {
      await classerManuellement(t.fitid, { groupe: groupeDe(categorie), categorie, associe: associe || '' })
      majComptaLocale({ transactions: transactions.map(x => x.fitid === t.fitid ? { ...x, groupe: groupeDe(categorie), categorie, associe: associe || '', regle: 'manuel', alerte: '', manuel: true } : x) })
      setMessage(`Ligne du ${dateFr(t.date)} classée « ${categorie} » (cette ligne seulement)`)
    } catch (e) {
      setMessage(`Échec : ${e.message || e}`)
    } finally {
      setOccupe(false)
    }
  }

  const regleSurTiers = (t, categorie, associe) => {
    const credit = t.montant > 0
    const regle = {
      id: `${slug(t.tiers)}-${slug(categorie)}`,
      quand: credit ? { sens: 'credit', tiers: `^${echapper(t.tiers)}` } : (/\/BEN/.test(t.libelle) ? { sens: 'debit', beneficiaire: `^${echapper(t.tiers)}` } : { sens: 'debit', tiers: `^${echapper(t.tiers)}` }),
      categorie,
      ...(associe ? { associe } : {}),
    }
    const regles = doc.regles.filter(r => r.id !== regle.id)
    // Une règle posée depuis la file passe AVANT les règles « à arbitrer » génériques
    const premiereArbitrer = regles.findIndex(r => r.categorie === A_ARBITRER)
    if (premiereArbitrer >= 0) regles.splice(premiereArbitrer, 0, regle); else regles.push(regle)
    return appliquerDoc({ ...doc, regles }, `Règle « ${regle.id} » ajoutée`)
  }

  const ajouterNom = (cle, nom) => {
    const n = nom.trim().toUpperCase()
    if (!n || (doc[cle] || []).includes(n)) return
    return appliquerDoc({ ...doc, [cle]: [...(doc[cle] || []), n] }, `${n} ajouté à ${cle}`)
  }
  const retirerNom = (cle, nom) => appliquerDoc({ ...doc, [cle]: doc[cle].filter(x => x !== nom) }, `${nom} retiré de ${cle}`)
  const supprimerRegle = (id) => appliquerDoc({ ...doc, regles: doc.regles.filter(r => r.id !== id) }, `Règle « ${id} » supprimée`)
  const ajouterRegle = (regle) => {
    const regles = doc.regles.filter(r => r.id !== regle.id)
    const premiereArbitrer = regles.findIndex(r => r.categorie === A_ARBITRER)
    if (premiereArbitrer >= 0) regles.splice(premiereArbitrer, 0, regle); else regles.push(regle)
    return appliquerDoc({ ...doc, regles }, `Règle « ${regle.id} » ajoutée`)
  }

  const confirmerAlerte = async (t) => {
    setOccupe(true)
    try {
      await classerManuellement(t.fitid, { groupe: t.groupe, categorie: t.categorie, associe: t.associe })
      majComptaLocale({ transactions: transactions.map(x => x.fitid === t.fitid ? { ...x, alerte: '', manuel: true, regle: 'manuel' } : x) })
      setMessage(`Ligne du ${dateFr(t.date)} confirmée`)
    } catch (e) {
      setMessage(`Échec : ${e.message || e}`)
    } finally {
      setOccupe(false)
    }
  }

  const importerFichier = async (fichier) => {
    if (!fichier || !doc) return
    setOccupe(true)
    try {
      // OFX BNP en Latin-1, CSV en UTF-8 : UTF-8 si valide, sinon Latin-1
      const brut = await fichier.arrayBuffer()
      let texte
      try { texte = new TextDecoder('utf-8', { fatal: true }).decode(brut) } catch { texte = new TextDecoder('latin1').decode(brut) }
      const r = await importerReleve(texte, fichier.name, doc, transactions)
      await rechargerCompta()
      setMessage(`${fichier.name} (${r.format === 'ofx' ? 'OFX' : 'CSV BNP'}) : ${r.total} lignes lues, ${r.nouvelles} nouvelles ajoutées, ${r.doublons} déjà en base (doublons ignorés${r.enrichies ? `, dont ${r.enrichies} au libellé complété` : ''})${r.manuellesPreservees ? `, ${r.manuellesPreservees} classées à la main laissées telles quelles` : ''}, ${r.aArbitrer} nouvelle${r.aArbitrer > 1 ? 's' : ''} à arbitrer${r.solde ? ` · solde au ${dateFr(r.solde.date)} enregistré` : ''}`)
    } catch (e) {
      setMessage(`Import refusé : ${e.message || e}`)
    } finally {
      setOccupe(false)
      if (fichierRef.current) fichierRef.current.value = ''
    }
  }

  const importerDictionnaire = async (fichier) => {
    if (!fichier) return
    try {
      const nouveau = JSON.parse(await fichier.text())
      await appliquerDoc(nouveau, `Dictionnaire ${fichier.name} chargé`)
    } catch (e) {
      setMessage(`Dictionnaire illisible : ${e.message || e}`)
    } finally {
      if (reglesRef.current) reglesRef.current.value = ''
    }
  }

  const exporterDictionnaire = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'regles.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Règles virements</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!lectureSeule && (
            <>
              <input ref={fichierRef} type="file" accept=".ofx,.OFX,.csv,.CSV" style={{ display: 'none' }} onChange={e => importerFichier(e.target.files?.[0])} />
              <button disabled={occupe || !doc} onClick={() => fichierRef.current?.click()} style={boutonStyle(!occupe && !!doc)}>Importer un relevé (OFX ou CSV BNP)</button>
              <input ref={reglesRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => importerDictionnaire(e.target.files?.[0])} />
              <button disabled={occupe} onClick={() => reglesRef.current?.click()} style={boutonStyle(!occupe, 'var(--color-border)', 'var(--color-surface)', 'var(--color-text-secondary)')}>Charger regles.json</button>
            </>
          )}
          <button disabled={!doc} onClick={exporterDictionnaire} style={boutonStyle(!!doc, 'var(--color-border)', 'var(--color-surface)', 'var(--color-text-secondary)')}>Exporter regles.json</button>
        </div>
      </div>

      <EtatCompta etat={etat} />
      {lectureSeule && (
        <div style={{ background: 'var(--color-bg)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px 14px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Consultation seule : les règles, le classement des lignes et l'import des relevés sont réservés aux administrateurs.
        </div>
      )}
      {message && (
        <div style={{ background: '#EEEDFE', border: '0.5px solid #AFA9EC', borderRadius: 'var(--radius-md)', padding: '8px 14px', fontSize: 12, color: '#3C3489' }}>
          {occupe ? '⏳ ' : 'ℹ '}{message}
        </div>
      )}

      {etat.statut === 'pret' && !doc && lectureSeule && (
        <div style={{ ...cardStyle, padding: 16, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Aucun dictionnaire de règles en base pour l'instant.
        </div>
      )}
      {etat.statut === 'pret' && !doc && !lectureSeule && (
        <div style={{ ...cardStyle, padding: 16, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Aucun dictionnaire de règles en base. Chargez le fichier <code>compta/regles.json</code> du dépôt avec le bouton
          « Charger regles.json », ou lancez <code>node compta/importer.js … --regles-locales</code> depuis le mini PC.
        </div>
      )}

      {doc && (
        <>
          <FileAttente lignes={aArbitrer} doc={doc} occupe={occupe} lectureSeule={lectureSeule} onLigne={classerLigne} onRegle={regleSurTiers} onNom={ajouterNom} />
          <Alertes lignes={enAlerte} occupe={occupe} lectureSeule={lectureSeule} onConfirmer={confirmerAlerte} />
          <Dictionnaire doc={doc} occupe={occupe} lectureSeule={lectureSeule} transactions={transactions} onAjouterNom={ajouterNom} onRetirerNom={retirerNom} onAjouterRegle={ajouterRegle} onSupprimerRegle={supprimerRegle} />
        </>
      )}
    </div>
  )
}

// ---- File d'attente ----

function FileAttente({ lignes, doc, occupe, lectureSeule, onLigne, onRegle, onNom }) {
  const [choix, setChoix] = useState({}) // fitid → { categorie, associe, nom, liste }
  const maj = (id, patch) => setChoix(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }))
  const [visibles, setVisibles] = useState(40)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={sousTitre}>FILE D'ATTENTE</span>
        {lignes.length > 0 && (
          <span style={{ fontSize: 10, background: '#FAECE7', color: '#712B13', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>
            {lignes.length} ligne{lignes.length > 1 ? 's' : ''} à arbitrer
          </span>
        )}
        {!lectureSeule && (
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
            « Cette ligne » = classement manuel ; « Règle sur ce tiers » = toutes les lignes de ce tiers, maintenant et à l'avenir
          </span>
        )}
      </div>

      {lignes.length === 0 ? (
        <div style={{ ...cardStyle, padding: 20, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>Aucune ligne en attente ✓</div>
      ) : (
        <div style={cardStyle}>
          {lignes.slice(0, visibles).map((t, idx) => {
            const c = choix[t.fitid] || {}
            const besoinAssocie = c.categorie && CATEGORIES_ASSOCIE.includes(c.categorie)
            const pret = !!c.categorie && (!besoinAssocie || !!c.associe)
            const nomDevine = (t.regle === 'salaire' || t.regle === 'rempla') ? nomDansMotif(t.libelle) : ''
            return (
              <div key={t.fitid} style={{ padding: '10px 16px', borderBottom: idx < Math.min(visibles, lignes.length) - 1 ? '0.5px solid var(--color-border)' : 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.tiers || t.libelle}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 1 }}>{dateFr(t.date)} · {t.type}{t.alerte ? ` · ${t.alerte}` : ''}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 1, wordBreak: 'break-all' }}>{t.libelle}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: t.montant < 0 ? 'var(--color-text)' : '#085041', whiteSpace: 'nowrap' }}>{fmtEur(t.montant)}</div>
                  {!lectureSeule && (
                    <>
                      <SelecteurCategorie value={c.categorie} onChange={v => maj(t.fitid, { categorie: v })} categoriesDisponibles={CATEGORIES_CHOISISSABLES} />
                      {besoinAssocie && (
                        <select style={champStyle} value={c.associe || ''} onChange={e => maj(t.fitid, { associe: e.target.value })}>
                          <option value="">Associé…</option>
                          {Object.keys(doc.associes).map(ini => <option key={ini} value={ini}>{ini}</option>)}
                        </select>
                      )}
                      <button disabled={!pret || occupe} onClick={() => onLigne(t, c.categorie, c.associe)} style={boutonStyle(pret && !occupe)}>Cette ligne</button>
                      <button disabled={!pret || occupe} onClick={() => onRegle(t, c.categorie, c.associe)} style={boutonStyle(pret && !occupe, '#534AB7', '#EEEDFE', '#3C3489')}>Règle sur ce tiers</button>
                    </>
                  )}
                </div>
                {nomDevine && !lectureSeule && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    Nom inconnu du dictionnaire :
                    <input style={{ ...champStyle, width: 180 }} value={c.nom ?? nomDevine} onChange={e => maj(t.fitid, { nom: e.target.value })} />
                    <select style={champStyle} value={c.liste || (t.regle === 'rempla' ? 'mar_remplacants' : 'iade_cdd')} onChange={e => maj(t.fitid, { liste: e.target.value })}>
                      {LISTES.map(l => <option key={l.cle} value={l.cle}>{l.titre}</option>)}
                    </select>
                    <button disabled={occupe} onClick={() => onNom(c.liste || (t.regle === 'rempla' ? 'mar_remplacants' : 'iade_cdd'), c.nom ?? nomDevine)} style={boutonStyle(!occupe, '#534AB7', '#EEEDFE', '#3C3489')}>Ajouter à la liste</button>
                  </div>
                )}
              </div>
            )
          })}
          {lignes.length > visibles && (
            <button onClick={() => setVisibles(v => v + 40)} style={{ ...boutonStyle(true, 'var(--color-border)', 'var(--color-bg)', 'var(--color-text-secondary)'), width: '100%', borderRadius: 0 }}>
              Afficher les {Math.min(40, lignes.length - visibles)} suivantes ({lignes.length - visibles} restantes)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Lignes classées mais à vérifier ----

function Alertes({ lignes, occupe, lectureSeule, onConfirmer }) {
  const [ouvert, setOuvert] = useState(false)
  if (lignes.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button onClick={() => setOuvert(o => !o)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
        <span style={sousTitre}>{ouvert ? '▾' : '▸'} CLASSÉES MAIS À VÉRIFIER</span>
        <span style={{ fontSize: 10, background: '#FAEEDA', color: '#633806', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>{lignes.length}</span>
      </button>
      {ouvert && (
        <div style={cardStyle}>
          {lignes.map((t, idx) => (
            <div key={t.fitid} style={{ padding: '10px 16px', borderBottom: idx < lignes.length - 1 ? '0.5px solid var(--color-border)' : 'none', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{t.tiers}</div>
                <div style={{ fontSize: 11, color: '#633806', marginTop: 1 }}>{dateFr(t.date)} · {t.alerte}</div>
              </div>
              {pastille(t.categorie)}
              {t.associe && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{t.associe}</span>}
              <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{fmtEur(t.montant)}</div>
              {!lectureSeule && <button disabled={occupe} onClick={() => onConfirmer(t)} style={boutonStyle(!occupe)}>Confirmer</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Dictionnaire ----

function Dictionnaire({ doc, occupe, lectureSeule, transactions, onAjouterNom, onRetirerNom, onAjouterRegle, onSupprimerRegle }) {
  const [ajouts, setAjouts] = useState({})
  const [openCats, setOpenCats] = useState({})
  const [formOuvert, setFormOuvert] = useState(false)
  const [f, setF] = useState({ id: '', champ: 'tiers', motif: '', sens: 'debit', categorie: '', associe: '' })

  const usage = useMemo(() => {
    const u = {}
    for (const t of transactions) if (t.regle) u[t.regle] = (u[t.regle] || 0) + 1
    return u
  }, [transactions])

  const parGroupe = TAXONOMIE.map(g => {
    const regles = doc.regles.filter(r => groupeDe(r.categorie) === g.groupe)
    const sous = {}
    regles.forEach(r => { (sous[r.categorie] ||= []).push(r) })
    return { groupe: g.groupe, total: regles.length, sous }
  }).filter(g => g.total > 0)

  const pretF = f.id.trim() && f.motif.trim() && f.categorie && (!CATEGORIES_ASSOCIE.includes(f.categorie) || f.associe)
  const soumettre = () => {
    onAjouterRegle({ id: slug(f.id), quand: { sens: f.sens, [f.champ]: f.motif.trim() }, categorie: f.categorie, ...(f.associe ? { associe: f.associe } : {}) })
    setF({ id: '', champ: 'tiers', motif: '', sens: 'debit', categorie: '', associe: '' })
    setFormOuvert(false)
  }

  const resume = (r) => Object.entries(r.quand).map(([k, v]) => `${k} : ${v}`).join(' · ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={sousTitre}>DICTIONNAIRE DE RÈGLES</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>— {doc.regles.length} règle{doc.regles.length > 1 ? 's' : ''} explicite{doc.regles.length > 1 ? 's' : ''} · {LISTES.reduce((s, l) => s + (doc[l.cle]?.length || 0), 0)} noms</span>
        {!lectureSeule && (
          <button onClick={() => setFormOuvert(o => !o)} style={{ ...boutonStyle(true, 'var(--color-border)', formOuvert ? 'var(--color-primary-light)' : 'var(--color-surface)', formOuvert ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)'), marginLeft: 'auto' }}>
            + Règle explicite
          </button>
        )}
      </div>

      {formOuvert && !lectureSeule && (
        <div style={{ ...cardStyle, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input style={{ ...champStyle, width: 160 }} placeholder="Identifiant (ex. loyer-sci)" value={f.id} onChange={e => setF({ ...f, id: e.target.value })} />
          <select style={champStyle} value={f.sens} onChange={e => setF({ ...f, sens: e.target.value })}>
            <option value="debit">Débit</option><option value="credit">Crédit</option>
          </select>
          <select style={champStyle} value={f.champ} onChange={e => setF({ ...f, champ: e.target.value })}>
            <option value="tiers">Tiers</option><option value="beneficiaire">Bénéficiaire</option><option value="memo">Libellé entier</option>
          </select>
          <input style={{ ...champStyle, flex: 1, minWidth: 200 }} placeholder="Motif (regex, insensible à la casse) ex. ^SCI DU PARC" value={f.motif} onChange={e => setF({ ...f, motif: e.target.value })} />
          <SelecteurCategorie value={f.categorie} onChange={v => setF({ ...f, categorie: v })} categoriesDisponibles={CATEGORIES_CHOISISSABLES} />
          {CATEGORIES_ASSOCIE.includes(f.categorie) && (
            <select style={champStyle} value={f.associe} onChange={e => setF({ ...f, associe: e.target.value })}>
              <option value="">Associé…</option>
              {Object.keys(doc.associes).map(ini => <option key={ini} value={ini}>{ini}</option>)}
            </select>
          )}
          <button disabled={!pretF || occupe} onClick={soumettre} style={boutonStyle(pretF && !occupe)}>Ajouter la règle</button>
        </div>
      )}

      {/* Listes de noms */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
        {LISTES.map(l => (
          <div key={l.cle} style={{ ...cardStyle, padding: '10px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>{l.titre} <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>· {doc[l.cle]?.length || 0}</span></div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>{l.aide}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {(doc[l.cle] || []).map(n => (
                <span key={n} style={{ fontSize: 11, padding: '2px 4px 2px 8px', borderRadius: 10, background: 'var(--color-bg)', border: '0.5px solid var(--color-border)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {n}
                  {!lectureSeule && <button disabled={occupe} title="Retirer" onClick={() => onRetirerNom(l.cle, n)} style={{ border: 'none', background: 'transparent', color: '#A32D2D', cursor: 'pointer', fontSize: 11, padding: '0 4px' }}>×</button>}
                </span>
              ))}
            </div>
            {!lectureSeule && <div style={{ display: 'flex', gap: 6 }}>
              <input style={{ ...champStyle, flex: 1 }} placeholder="NOM tel qu'il apparaît à la banque" value={ajouts[l.cle] || ''} onChange={e => setAjouts({ ...ajouts, [l.cle]: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && ajouts[l.cle]?.trim()) { onAjouterNom(l.cle, ajouts[l.cle]); setAjouts({ ...ajouts, [l.cle]: '' }) } }} />
              <button disabled={occupe || !ajouts[l.cle]?.trim()} onClick={() => { onAjouterNom(l.cle, ajouts[l.cle]); setAjouts({ ...ajouts, [l.cle]: '' }) }} style={boutonStyle(!occupe && !!ajouts[l.cle]?.trim())}>Ajouter</button>
            </div>}
          </div>
        ))}
        <div style={{ ...cardStyle, padding: '10px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>Associés <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>· {Object.keys(doc.associes).length}</span></div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>initiales → nom tel qu'il apparaît à la banque (regex). Se modifie dans regles.json.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(doc.associes).map(([ini, pat]) => (
              <span key={ini} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#EEEDFE', color: '#3C3489' }}>{ini} · {pat}</span>
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 8 }}>Commerçants carte (vie du groupe) : {doc.commercants_carte}</div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Tiers payant ≤ {doc.tiers_payant_montant_max} € : {doc.caisses_tiers_payant?.slice(0, 60)}…</div>
        </div>
      </div>

      {/* Règles explicites par groupe / catégorie */}
      {parGroupe.map(({ groupe, total, sous }) => (
        <div key={groupe}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, padding: '0 2px' }}>{groupe} · {total}</div>
          <div style={cardStyle}>
            {Object.entries(sous).map(([c, list], i, arr) => {
              const ouvert = !!openCats[c]
              return (
                <div key={c} style={{ borderBottom: i < arr.length - 1 ? '0.5px solid var(--color-border)' : 'none' }}>
                  <button onClick={() => setOpenCats(p => ({ ...p, [c]: !p[c] }))} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', padding: '10px 16px', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', width: 8 }}>{ouvert ? '▾' : '▸'}</span>
                    {pastille(c)}
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{list.length} règle{list.length > 1 ? 's' : ''}</span>
                  </button>
                  {ouvert && list.map(r => (
                    <div key={r.id} style={{ padding: '8px 16px 8px 34px', borderTop: '0.5px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--color-bg)' }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{r.id}{r.associe ? ` · ${r.associe}` : ''}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{resume(r)}{r.alerte ? ` · alerte : ${r.alerte}` : ''}</div>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{usage[r.id] || 0} ligne{(usage[r.id] || 0) > 1 ? 's' : ''}</span>
                      {!lectureSeule && <button disabled={occupe} onClick={() => onSupprimerRegle(r.id)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-md)', border: '0.5px solid #F09595', background: 'transparent', color: '#A32D2D', cursor: 'pointer' }}>Supprimer</button>}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
