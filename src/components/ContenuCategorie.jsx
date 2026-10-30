import { useState } from 'react'
import { reglesDeCategorie } from '../data/compta'
import { fmtEur, sum } from '../data/mockData'

const AUTRES = { manuel: 'Classées à la main', '': 'Sans règle' }

// Ce que contient une catégorie : les règles qui l'alimentent (comme dans « Règles virements »),
// avec, pour l'année principale et la période, le nombre de lignes et le total de chacune.
// Un clic sur une règle déplie les lignes du relevé qu'elle a classées.
// `sens` : 'debit' (Dépenses) ou 'credit' (remboursements reçus) ; seules ces lignes comptent.
export default function ContenuCategorie({ categorie, doc, transactions, annee, de, a, periode, cardStyle, sens = 'debit' }) {
  const [ouverte, setOuverte] = useState(null)
  const lignes = transactions.filter(t => t.categorie === categorie && (sens === 'credit' ? t.montant > 0 : t.montant < 0) && t.date.startsWith(`${annee}-`)
    && Number(t.date.slice(5, 7)) - 1 >= de && Number(t.date.slice(5, 7)) - 1 <= a)
  const regles = reglesDeCategorie(doc, categorie)
  const connues = new Set(regles.map(r => r.id))
  const autres = [...new Set(lignes.map(t => t.regle || '').filter(id => !connues.has(id)))]
    .map(id => ({ id, titre: AUTRES[id] ?? id, detail: id === 'manuel' ? 'catégorie posée à la main dans « Règles virements »' : '' }))
  const blocs = [...regles, ...autres].map(r => {
    const ls = lignes.filter(t => (t.regle || '') === r.id).sort((x, y) => x.date.localeCompare(y.date))
    return { ...r, lignes: ls, total: sum(ls.map(t => Math.abs(t.montant))) }
  })

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
        Ce que contient « {categorie} » · {blocs.length} règle{blocs.length > 1 ? 's' : ''} · {annee} — {periode}
      </div>
      {blocs.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Aucune règle ne mène à cette catégorie.</div>
      )}
      {blocs.map(r => {
        const open = ouverte === r.id
        return (
          <div key={r.id} style={{ borderTop: '0.5px solid var(--color-border)' }}>
            <button
              type="button"
              onClick={() => setOuverte(open ? null : r.id)}
              disabled={r.lignes.length === 0}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', background: 'none', border: 'none', textAlign: 'left', cursor: r.lignes.length ? 'pointer' : 'default', color: 'var(--color-text)' }}
            >
              <span style={{ fontSize: 10, width: 10, color: 'var(--color-text-tertiary)' }}>{r.lignes.length ? (open ? '▾' : '▸') : ''}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{r.titre}</span>
                {r.detail && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginLeft: 8 }}>{r.detail}</span>}
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>{r.id}</span>
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                {r.lignes.length} ligne{r.lignes.length > 1 ? 's' : ''}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, minWidth: 90, textAlign: 'right' }}>{fmtEur(r.total)}</span>
            </button>
            {open && (
              <div style={{ padding: '0 0 8px 22px' }}>
                {r.lignes.map(t => (
                  <div key={t.fitid} style={{ display: 'flex', gap: 10, fontSize: 11, padding: '3px 0', color: 'var(--color-text-secondary)' }}>
                    <span style={{ width: 72, flexShrink: 0 }}>{t.date.split('-').reverse().join('/')}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.libelle}>{t.tiers || t.libelle}</span>
                    <span style={{ minWidth: 90, textAlign: 'right', color: 'var(--color-text)' }}>{fmtEur(Math.abs(t.montant))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
