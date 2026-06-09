import { useState, useEffect } from 'react'
import { fmtEur } from '../data/mockData'
import { TAXONOMIE, TOUTES_SOUS, CATEGORIES_ASSOCIE, groupeDe, catColor } from '../data/categories'
import { charger, sauver } from '../utils/stockage'
import SelecteurCategorie from '../components/SelecteurCategorie'

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

export default function ReglesVirements() {
  const [queue, setQueue] = useState(() => charger('sarm:queue', initQueue))
  const [regles, setRegles] = useState(() => charger('sarm:regles', initRegles))
  const [selections, setSelections] = useState({})
  const [openCats, setOpenCats] = useState({})
  const [dragItem, setDragItem] = useState(null)
  const [dropCat, setDropCat] = useState(null)
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const [nom, setNom] = useState('')
  const [iban, setIban] = useState('')
  const [cat, setCat] = useState('')

  useEffect(() => sauver('sarm:queue', queue), [queue])
  useEffect(() => sauver('sarm:regles', regles), [regles])

  const handleSelect = (id, val) => setSelections(prev => ({ ...prev, [id]: val }))

  // Classe un virement (file → dictionnaire) : utilisé par Valider ET par le glisser-déposer
  const classer = (item, categorie) => {
    if (!item || !categorie) return
    setQueue(prev => prev.filter(q => q.id !== item.id))
    setRegles(prev => [...prev, {
      id: Date.now(),
      nom: item.nom,
      iban: 'FR76 **** **** **** **** ****',
      depuis: 'maintenant',
      categorie,
    }])
    setDragItem(null)
    setDropCat(null)
  }

  const handleSupprimer = (id) => setRegles(prev => prev.filter(r => r.id !== id))

  const toggleCat = (c) => setOpenCats(prev => ({ ...prev, [c]: !prev[c] }))

  const ajouterRegle = () => {
    if (!nom.trim() || !cat) return
    setRegles(prev => [...prev, {
      id: Date.now(),
      nom: nom.trim().toUpperCase(),
      iban: iban.trim() || 'FR76 **** **** **** **** ****',
      depuis: 'maintenant',
      categorie: cat,
    }])
    setNom(''); setIban(''); setCat(''); setAjoutOuvert(false)
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

  const champStyle = {
    fontSize: 12, padding: '6px 8px',
    borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
  }

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
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
          Astuce : glissez un virement vers une catégorie ci-dessous ↓
        </span>
      </div>

      {queue.length === 0 ? (
        <div style={{ ...cardStyle, padding: '20px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          Aucun virement en attente ✓
        </div>
      ) : (
        <div style={cardStyle}>
          {queue.map((item, idx) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => setDragItem(item)}
              onDragEnd={() => { setDragItem(null); setDropCat(null) }}
              style={{
                padding: '12px 16px',
                borderBottom: idx < queue.length - 1 ? '0.5px solid var(--color-border)' : 'none',
                background: item.alert ? '#FAECE7' : 'var(--color-surface)',
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                cursor: 'grab',
                opacity: dragItem && dragItem.id === item.id ? 0.5 : 1,
              }}
            >
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, cursor: 'grab' }} title="Glisser pour classer">⋮⋮</span>
              <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: item.alert ? '#D85A30' : '#888780' }} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{item.nom}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 1 }}>{item.date} · {item.detail}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: item.alert ? '#712B13' : 'var(--color-text)', marginRight: 8, whiteSpace: 'nowrap' }}>
                {fmtEur(item.montant)}
              </div>
              <SelecteurCategorie
                value={selections[item.id]}
                onChange={v => handleSelect(item.id, v)}
                categoriesDisponibles={item.categoriesDisponibles}
              />
              <button
                onClick={() => classer(item, selections[item.id])}
                disabled={!selections[item.id]}
                style={{
                  fontSize: 11, padding: '5px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '0.5px solid #1D9E75',
                  background: selections[item.id] ? '#E1F5EE' : 'var(--color-bg)',
                  color: selections[item.id] ? '#085041' : 'var(--color-text-tertiary)',
                  cursor: selections[item.id] ? 'pointer' : 'default',
                }}
              >
                ✓ Valider
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: '#EEEDFE', border: '0.5px solid #AFA9EC', borderRadius: 'var(--radius-md)', padding: '8px 14px', fontSize: 12, color: '#3C3489', display: 'flex', alignItems: 'center', gap: 6 }}>
        ℹ Chaque validation mémorise la règle et recalcule tous les totaux rétroactivement.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>DICTIONNAIRE DE RÈGLES</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>— {regles.length} règle{regles.length > 1 ? 's' : ''} active{regles.length > 1 ? 's' : ''}</span>
        <button
          onClick={() => setAjoutOuvert(o => !o)}
          style={{
            marginLeft: 'auto', fontSize: 11, padding: '4px 10px',
            borderRadius: 'var(--radius-md)', border: '0.5px solid var(--color-border)',
            background: ajoutOuvert ? 'var(--color-primary-light)' : 'var(--color-surface)',
            color: ajoutOuvert ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)', cursor: 'pointer',
          }}
        >
          + Ajouter une règle
        </button>
      </div>

      {ajoutOuvert && (
        <div style={{ ...cardStyle, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input style={{ ...champStyle, flex: 1, minWidth: 160 }} placeholder="Nom (ex. NOUVEL ASSOCIÉ)" value={nom} onChange={e => setNom(e.target.value)} />
          <input style={{ ...champStyle, flex: 1, minWidth: 180 }} placeholder="IBAN (optionnel)" value={iban} onChange={e => setIban(e.target.value)} />
          <SelecteurCategorie value={cat} onChange={setCat} />
          <button
            onClick={ajouterRegle}
            disabled={!nom.trim() || !cat}
            style={{
              fontSize: 11, padding: '6px 14px', borderRadius: 'var(--radius-md)',
              border: '0.5px solid #1D9E75',
              background: (nom.trim() && cat) ? '#E1F5EE' : 'var(--color-bg)',
              color: (nom.trim() && cat) ? '#085041' : 'var(--color-text-tertiary)',
              cursor: (nom.trim() && cat) ? 'pointer' : 'default',
            }}
          >
            Ajouter la règle
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {dictionnaire.map(({ groupe, total, sousCats }) => (
          <div key={groupe}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, padding: '0 2px' }}>
              {groupe} · {total}
            </div>
            <div style={cardStyle}>
              {Object.entries(sousCats).map(([c, list], i, arr) => {
                const ouvert = !!openCats[c]
                const estCible = dropCat === c
                return (
                  <div key={c} style={{ borderBottom: i < arr.length - 1 ? '0.5px solid var(--color-border)' : 'none' }}>
                    <button
                      onClick={() => toggleCat(c)}
                      onDragOver={(e) => { if (dragItem) { e.preventDefault(); setDropCat(c) } }}
                      onDragLeave={() => setDropCat(prev => prev === c ? null : prev)}
                      onDrop={(e) => { e.preventDefault(); classer(dragItem, c) }}
                      style={{
                        width: '100%', textAlign: 'left',
                        cursor: 'pointer',
                        padding: '10px 16px',
                        border: estCible ? '1px dashed var(--color-primary)' : '1px solid transparent',
                        background: estCible ? 'var(--color-primary-light)' : 'transparent',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}
                    >
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', width: 8 }}>{ouvert ? '▾' : '▸'}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, ...catColor(c) }}>{c}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                        {estCible ? 'Déposer ici…' : `${list.length} règle${list.length > 1 ? 's' : ''}`}
                      </span>
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
