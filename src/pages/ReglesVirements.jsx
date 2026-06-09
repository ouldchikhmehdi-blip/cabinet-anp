import { useState } from 'react'
import { fmtEur } from '../data/mockData'

const TAXONOMIE = [
  { groupe: 'Associés',    sous: ['Rétrocession fixe', 'Rétrocession variable', 'Remboursement de frais associé'] },
  { groupe: 'Remplaçants', sous: ['Remplaçant IADE', 'Remplaçant MAR'] },
  { groupe: 'Salariés',    sous: ['Salarié CDI', 'Salarié CDD'] },
  { groupe: 'Dépenses',    sous: ["Dépense d'exploitation", 'Énergie', 'Loyer', 'Assurances', 'Matériel médical'] },
  { groupe: 'Autre',       sous: ['Autre'] },
]

const TOUTES_SOUS = TAXONOMIE.flatMap(g => g.sous)
const CATEGORIES_ASSOCIE = ['Rétrocession fixe', 'Rétrocession variable', 'Remboursement de frais associé']

// Mappe une catégorie (libellé libre) vers son groupe
const groupeDe = (cat) => {
  if (cat.includes('IADE') || cat.includes('MAR') || cat.includes('Remplaçant')) return 'Remplaçants'
  if (cat.includes('Associé') || cat.includes('Rétrocession')) return 'Associés'
  if (cat.includes('CDI') || cat.includes('CDD') || cat.includes('Salarié')) return 'Salariés'
  if (cat.includes('Dépense') || cat.includes('Énergie') || cat.includes('Loyer') || cat.includes('Assurance') || cat.includes('Matériel')) return 'Dépenses'
  return 'Autre'
}

const initQueue = [
  { id: 1, nom: 'MARTIN SOPHIE', date: '15/03/2024', montant: 1347, detail: 'Compte associé connu · Somme non ronde — vérification requise', alert: true, categoriesDisponibles: CATEGORIES_ASSOCIE },
  { id: 2, nom: 'BENALI KARIM', date: '08/06/2024', montant: 2400, detail: 'Compte inconnu · Aucune règle existante', alert: false, categoriesDisponibles: TOUTES_SOUS },
  { id: 3, nom: 'DUPONT CLAIRE', date: '22/09/2024', montant: 1000, detail: 'Compte inconnu · Aucune règle existante', alert: false, categoriesDisponibles: TOUTES_SOUS },
]

const initRegles = [
  { id: 1, nom: 'BERNARD THOMAS', iban: 'FR76 3000 4000 0300 0000 1234', depuis: 'jan. 2023', categorie: 'Remplaçant IADE' },
  { id: 2, nom: 'GARCIA PEDRO', iban: 'FR76 3000 4000 0300 0000 5678', depuis: 'mar. 2023', categorie: 'Remplaçant MAR' },
  { id: 3, nom: 'MARTIN SOPHIE', iban: 'FR76 3000 4000 0300 0000 9012', depuis: 'jan. 2022', categorie: 'Rétrocession fixe' },
  { id: 4, nom: 'MOREAU OCÉANE', iban: 'FR76 3000 4000 0300 0000 3456', depuis: 'sep. 2022', categorie: 'Salarié CDI' },
  { id: 5, nom: 'EDF ENTREPRISES', iban: 'FR76 3000 4000 0300 0000 7890', depuis: 'jan. 2022', categorie: 'Énergie' },
]

const catColor = (cat) => {
  if (cat.includes('IADE')) return { background: '#FAEEDA', color: '#633806' }
  if (cat.includes('MAR')) return { background: '#FAECE7', color: '#712B13' }
  if (cat.includes('Associé') || cat.includes('Rétrocession')) return { background: '#EEEDFE', color: '#3C3489' }
  if (cat.includes('CDI') || cat.includes('CDD') || cat.includes('Salarié')) return { background: '#E1F5EE', color: '#085041' }
  return { background: '#F1EFE8', color: '#444441' }
}

export default function ReglesVirements() {
  const [queue, setQueue] = useState(initQueue)
  const [regles, setRegles] = useState(initRegles)
  const [selections, setSelections] = useState({})
  const [openCats, setOpenCats] = useState({})
  const [menuId, setMenuId] = useState(null)
  const [menuGroupe, setMenuGroupe] = useState(null)

  const handleSelect = (id, val) => {
    setSelections(prev => ({ ...prev, [id]: val }))
    setMenuId(null)
    setMenuGroupe(null)
  }

  const handleValider = (item) => {
    if (!selections[item.id]) return
    setQueue(prev => prev.filter(q => q.id !== item.id))
    setRegles(prev => [...prev, {
      id: Date.now(),
      nom: item.nom,
      iban: 'FR76 **** **** **** **** ****',
      depuis: 'maintenant',
      categorie: selections[item.id]
    }])
  }

  const handleSupprimer = (id) => setRegles(prev => prev.filter(r => r.id !== id))

  const toggleCat = (cat) => setOpenCats(prev => ({ ...prev, [cat]: !prev[cat] }))

  const openMenu = (id) => {
    setMenuId(prev => prev === id ? null : id)
    setMenuGroupe(null)
  }

  // Dictionnaire groupé : groupe -> { sousCategorie -> règles[] }
  const parGroupe = TAXONOMIE.map(g => g.groupe)
  if (!parGroupe.includes('Autre')) parGroupe.push('Autre')
  const dictionnaire = parGroupe.map(groupe => {
    const reglesGroupe = regles.filter(r => groupeDe(r.categorie) === groupe)
    const sousCats = {}
    reglesGroupe.forEach(r => {
      ;(sousCats[r.categorie] = sousCats[r.categorie] || []).push(r)
    })
    return { groupe, total: reglesGroupe.length, sousCats }
  }).filter(g => g.total > 0)

  const cardStyle = {
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  }

  const triggerStyle = (active) => ({
    fontSize: 11, padding: '5px 10px',
    borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)',
    cursor: 'pointer', minWidth: 200, textAlign: 'left',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Règles virements</h1>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
          Recalcul automatique rétroactif à la validation
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>FILE D'ATTENTE</span>
        {queue.length > 0 && (
          <span style={{ fontSize: 10, background: '#FAECE7', color: '#712B13', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>
            {queue.length} virement{queue.length > 1 ? 's' : ''} à classer
          </span>
        )}
      </div>

      {queue.length === 0 ? (
        <div style={{ ...cardStyle, padding: '20px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          Aucun virement en attente ✓
        </div>
      ) : (
        <div style={cardStyle}>
          {queue.map((item, idx) => {
            const sel = selections[item.id]
            const groupesDispo = TAXONOMIE
              .map(g => ({ ...g, sous: g.sous.filter(s => item.categoriesDisponibles.includes(s)) }))
              .filter(g => g.sous.length > 0)
            return (
              <div key={item.id} style={{
                padding: '12px 16px',
                borderBottom: idx < queue.length - 1 ? '0.5px solid var(--color-border)' : 'none',
                background: item.alert ? '#FAECE7' : 'var(--color-surface)',
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: item.alert ? '#D85A30' : '#888780' }} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{item.nom}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 1 }}>{item.date} · {item.detail}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: item.alert ? '#712B13' : 'var(--color-text)', marginRight: 8, whiteSpace: 'nowrap' }}>
                  {fmtEur(item.montant)}
                </div>

                {/* Menu 2 niveaux */}
                <div style={{ position: 'relative' }}>
                  <button style={triggerStyle(!!sel)} onClick={() => openMenu(item.id)}>
                    {sel
                      ? <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, ...catColor(sel) }}>{sel}</span>
                      : <span>— Choisir une catégorie —</span>}
                    <span style={{ fontSize: 9 }}>▾</span>
                  </button>

                  {menuId === item.id && (
                    <>
                      <div
                        onClick={() => { setMenuId(null); setMenuGroupe(null) }}
                        style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                      />
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 11,
                        minWidth: 220, maxHeight: 320, overflowY: 'auto',
                        background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)', boxShadow: '0 6px 20px rgba(0,0,0,0.12)', padding: 4,
                      }}>
                        {groupesDispo.map(g => {
                          const ouvert = menuGroupe === g.groupe
                          return (
                            <div key={g.groupe}>
                              <button
                                onClick={() => setMenuGroupe(ouvert ? null : g.groupe)}
                                style={{
                                  width: '100%', textAlign: 'left', cursor: 'pointer',
                                  fontSize: 12, fontWeight: 500, color: 'var(--color-text)',
                                  padding: '7px 10px', border: 'none', borderRadius: 6,
                                  background: ouvert ? 'var(--color-bg)' : 'transparent',
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                }}
                              >
                                {g.groupe}
                                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{ouvert ? '▾' : '▸'}</span>
                              </button>
                              {ouvert && g.sous.map(s => (
                                <button
                                  key={s}
                                  onClick={() => handleSelect(item.id, s)}
                                  style={{
                                    width: '100%', textAlign: 'left', cursor: 'pointer',
                                    fontSize: 12, color: 'var(--color-text-secondary)',
                                    padding: '6px 10px 6px 24px', border: 'none', borderRadius: 6,
                                    background: sel === s ? 'var(--color-primary-light)' : 'transparent',
                                  }}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={() => handleValider(item)}
                  disabled={!sel}
                  style={{
                    fontSize: 11, padding: '5px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '0.5px solid #1D9E75',
                    background: sel ? '#E1F5EE' : 'var(--color-bg)',
                    color: sel ? '#085041' : 'var(--color-text-tertiary)',
                    cursor: sel ? 'pointer' : 'default',
                  }}
                >
                  ✓ Valider
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ background: '#EEEDFE', border: '0.5px solid #AFA9EC', borderRadius: 'var(--radius-md)', padding: '8px 14px', fontSize: 12, color: '#3C3489', display: 'flex', alignItems: 'center', gap: 6 }}>
        ℹ Chaque validation mémorise la règle et recalcule tous les totaux rétroactivement.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>DICTIONNAIRE DE RÈGLES</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>— {regles.length} règle{regles.length > 1 ? 's' : ''} active{regles.length > 1 ? 's' : ''}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {dictionnaire.map(({ groupe, total, sousCats }) => (
          <div key={groupe}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, padding: '0 2px' }}>
              {groupe} · {total}
            </div>
            <div style={cardStyle}>
              {Object.entries(sousCats).map(([cat, list], i, arr) => {
                const ouvert = !!openCats[cat]
                return (
                  <div key={cat} style={{ borderBottom: i < arr.length - 1 ? '0.5px solid var(--color-border)' : 'none' }}>
                    <button
                      onClick={() => toggleCat(cat)}
                      style={{
                        width: '100%', textAlign: 'left', cursor: 'pointer',
                        padding: '10px 16px', border: 'none', background: 'transparent',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}
                    >
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', width: 8 }}>{ouvert ? '▾' : '▸'}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, ...catColor(cat) }}>{cat}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{list.length} règle{list.length > 1 ? 's' : ''}</span>
                    </button>
                    {ouvert && list.map(r => (
                      <div key={r.id} style={{
                        padding: '10px 16px 10px 34px',
                        borderTop: '0.5px solid var(--color-border)',
                        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                        background: 'var(--color-bg)',
                      }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{r.nom}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{r.iban} · depuis {r.depuis}</div>
                        </div>
                        <button onClick={() => handleSupprimer(r.id)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-md)', border: '0.5px solid #F09595', background: 'transparent', color: '#A32D2D', cursor: 'pointer' }}>
                          Supprimer
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
