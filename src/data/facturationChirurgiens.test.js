import { describe, it, expect } from 'vitest'
import { CHIRURGIENS, SPECIALITES, praticienDe, specialitesFacturation, libelleChirurgien } from './facturationChirurgiens'
import { CONSULT_SPECIALITES } from './mockData'

describe('CHIRURGIENS ↔ Consultations', () => {
  it('tout praticien rattaché à une spécialité de Consultations existe dans mockData', () => {
    const consult = Object.fromEntries(CONSULT_SPECIALITES.map(s => [s.id, new Set((s.praticiens || []).map(p => p.id))]))
    for (const [nom, p] of Object.entries(CHIRURGIENS)) {
      if (!consult[p.spec]) continue // spécialité propre à la facturation (bariatrique)
      expect(consult[p.spec].has(p.id), `${nom} → ${p.spec}/${p.id}`).toBe(true)
    }
    for (const p of Object.values(CHIRURGIENS)) expect(SPECIALITES.some(s => s.id === p.spec), p.spec).toBe(true)
  })
  it('retrouve un praticien depuis la clé du script, pas depuis un bucket', () => {
    expect(praticienDe('VERCAMBRE AUFORT Lucile')?.id).toBe('vercambre-aufort')
    expect(praticienDe('MEYER-BISCH Vincent')?.spec).toBe('neurochirurgie')
    expect(praticienDe('__consultations')).toBeNull()
    expect(praticienDe('INCONNU Paul')).toBeNull()
    expect(libelleChirurgien('GALLET DE SANTERRE Philippe')).toBe('Dr Gallet de Santerre')
  })
})

describe('specialitesFacturation', () => {
  const s = (v) => Array.from({ length: 12 }, (_, m) => (m === 0 ? v : 0))
  const specs = specialitesFacturation({
    2026: { 'NOGUES Laurent': s(100), 'DRAN Gregory': s(300), 'INCONNU Paul': s(7), __consultations: s(40), __sejour_inconnu: s(5) },
    2025: { 'NOGUES Laurent': s(50) },
  }, [2026, 2025])
  it('range les chirurgiens connus dans leur spécialité, triés par facturé', () => {
    const neuro = specs.find(x => x.id === 'neurochirurgie')
    expect(neuro.praticiens.map(p => p.id)).toEqual(['dran', 'nogues'])
    expect(neuro.praticiens[1].valeurs).toEqual({ 2026: s(100), 2025: s(50) })
  })
  it('liste les inconnus un par un dans « Autres » et les buckets présents en pseudo-spécialités', () => {
    expect(specs.find(x => x.id === 'autres').praticiens).toEqual([{ id: 'autre:INCONNU Paul', nom: 'Dr Inconnu', valeurs: { 2026: s(7) } }])
    expect(specs.filter(x => x.id.startsWith('__')).map(x => x.id)).toEqual(['__consultations', '__sejour_inconnu'])
    expect(specs.find(x => x.id === '__consultations').valeurs[2026]).toEqual(s(40))
  })
})
