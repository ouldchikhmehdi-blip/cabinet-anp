import { useState } from 'react'

const CATEGORIES = [
  'Rétrocession fixe',
  'Rétrocession variable',
  'Remboursement de frais associé',
  'Remplaçant IADE',
  'Remplaçant MAR',
  'Salarié CDI',
  'Salarié CDD',
  "Dépense d'exploitation",
  'Autre',
]

const CATEGORIES_ASSOCIE = [
  'Rétrocession fixe',
  'Rétrocession variable',
  'Remboursement de frais associé',
]

const initQueue = [
  { id: 1, nom: 'MARTIN SOPHIE', date: '15/03/2024', montant: 1347, detail: 'Compte associé connu · Somme non ronde — vérification requise', alert: true, categoriesDisponibles: CATEGORIES_ASSOCIE },
  { id: 2, nom: 'BENALI KARIM', date: '08/06/2024', montant: 2400, detail: 'Compte inconnu · Aucune règle existante', alert: false, categoriesDisponibles: CATEGORIES },
  { id: 3, nom: 'DUPONT CLAIRE', date: '22/09/2024', montant: 1000, detail: 'Compte inconnu · Aucune règle existante', alert: false, categoriesDisponibles: CATEGORIES },
]

const initRegles = [
  { id: 1, nom: 'BERNARD THOMAS', iban: 'FR76 3000 4000 0300 0000 1234', depuis: 'jan. 2023', categorie: 'Remplaçant IADE' },
  { id: 2, nom: 'GARCIA PEDRO', iban: 'FR76 3000 4000 0300 0000 5678', depuis: 'mar. 2023', categorie: 'Remplaçant MAR' },
  { id: 3, nom: 'MARTIN SOPHIE', iban: 'FR76 3000 4000 0300 0000 9012', depuis: 'jan. 2022', categorie: 'Associé' },
  { id: 4, nom: 'MOREAU OCÉANE', iban: 'FR76 3000 4000 0300 0000 3456', depuis: 'sep. 2022', categorie: 'Salarié CDI' },
  { id: 5, nom: 'EDF ENTREPRISES', iban: 'FR76 3000 4000 0300 0000 7890', depuis: 'jan. 2022', categorie: 'Dépense · Énergie' },
]

const catColor = (cat) => {
  if (cat.includes('IADE')) return { background: '#FAEEDA', color: '#633806' }
  if (cat.includes('MAR')) return { background: '#FAECE7', color: '#712B13' }
  if (cat.includes('Associé') || cat.includes('Rétrocession')) return { background: '#EEEDFE', color: '#3C3489' }
  if (cat.includes('CDI') || cat.includes('CDD')) return { background: '#E1F5EE', color: '#085041' }
  return { background: '#F1EFE8', color: '#444441' }
}

const fmtEur = v => Math.round(v).toLocaleString('fr-FR') + ' €'

export default function ReglesVirements() {
  const [queue, setQueue] = useState(initQueue)
  const [regles, setRegles] = useState(initRegles)
  const [selections, setSelections] = useState({})

  const handleSelect = (id, val) => setSelections(prev => ({ ...prev, [id]: val }))

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

  const cardStyle = {
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  }

  const selectStyle = {
    fontSize: 11, padding: '4px 6px',
    borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    minWidth: 180,
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
      </div>

      {queue.length === 0 ? (
        <div style={{ ...cardStyle, padding: '20px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          Aucun virement en attente ✓
        </div>
      ) : (
        <div style={cardStyle}>
          {queue.map((item, idx) => (
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
              <select style={selectStyle} value={selections[item.id] || ''} onChange={e => handleSelect(item.id, e.target.value)}>
                <option value="">— Choisir une catégorie —</option>
                {item.categoriesDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                onClick={() => handleValider(item)}
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
      </div>

      <div style={cardStyle}>
        {regles.map((r, idx) => (
          <div key={r.id} style={{
            padding: '10px 16px',
            borderBottom: idx < regles.length - 1 ? '0.5px solid var(--color-border)' : 'none',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{r.nom}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{r.iban} · depuis {r.depuis}</div>
            </div>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap', ...catColor(r.categorie) }}>
              {r.categorie}
            </span>
            <button onClick={() => handleSupprimer(r.id)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-md)', border: '0.5px solid #F09595', background: 'transparent', color: '#A32D2D', cursor: 'pointer' }}>
              Supprimer
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}