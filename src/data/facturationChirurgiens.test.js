import { describe, it, expect } from 'vitest'
import { CHIRURGIENS, SPECIALITES, praticienDe, specialitesFacturation, libelleChirurgien, clesSelection, decrireCle, feuillesActes } from './facturationChirurgiens'
import { CONSULT_SPECIALITES } from './mockData'

describe('CHIRURGIENS ↔ Consultations', () => {
  it('tout praticien rattaché à une spécialité de Consultations existe dans mockData', () => {
    const consult = Object.fromEntries(CONSULT_SPECIALITES.map(s => [s.id, new Set((s.praticiens || []).map(p => p.id))]))
    for (const [nom, p] of Object.entries(CHIRURGIENS)) {
      if (p.bucket) { expect(consult[p.spec], `${nom} → bucket de ${p.spec}`).toBeDefined(); continue }
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
    2026: { 'NOGUES Laurent': s(100), 'DRAN Gregory': s(300), 'INCONNU Paul': s(7), 'LEON Piera': s(20), 'WARTHMANN Paul': s(30), 'AYRAL Jean': s(60), __consultations: s(40), __sejour_inconnu: s(5), __spec_viscerale: s(9), __spec_endoscopie: s(4) },
    2025: { 'NOGUES Laurent': s(50) },
  }, [2026, 2025])
  it('range les chirurgiens connus dans leur spécialité, triés par facturé', () => {
    const neuro = specs.find(x => x.id === 'neurochirurgie')
    expect(neuro.praticiens.map(p => p.id)).toEqual(['dran', 'nogues'])
    expect(neuro.praticiens[1].valeurs).toEqual({ 2026: s(100), 2025: s(50) })
  })
  it('sait quelles clés du script sont derrière une spécialité, un praticien ou un bucket', () => {
    const gastro = specs.find(x => x.id === 'endoscopie')
    expect(clesSelection(gastro).sort()).toEqual(['AYRAL Jean', 'LEON Piera', 'WARTHMANN Paul', '__spec_endoscopie'])
    expect(clesSelection(gastro, ['ayral'])).toEqual(['AYRAL Jean'])
    expect(clesSelection(specs.find(x => x.id === 'neurochirurgie')).sort()).toEqual(['DRAN Gregory', 'NOGUES Laurent'])
    expect(clesSelection(specs.find(x => x.id === 'autres'))).toEqual(['INCONNU Paul'])
    expect(clesSelection(specs.find(x => x.id === '__consultations'))).toEqual(['__consultations'])
  })
  it('compte un YYYY400 sans praticien identifié dans le total de sa spécialité', () => {
    expect(specs.find(x => x.id === 'viscerale').valeurs[2026]).toEqual(s(9))
    expect(specs.some(x => x.id === '__spec_viscerale')).toBe(false)
  })
  it('compte la chirurgie bariatrique dans le bucket de Gastro, sans praticien', () => {
    const gastro = specs.find(x => x.id === 'endoscopie')
    expect(gastro.praticiens.map(p => p.id)).toEqual(['ayral'])
    expect(gastro.valeurs[2026]).toEqual(s(54))
    expect(specs.some(x => x.id === 'bariatrique')).toBe(false)
  })
  it('liste les inconnus un par un dans « Autres » et les buckets présents en pseudo-spécialités', () => {
    expect(specs.find(x => x.id === 'autres').praticiens).toEqual([{ id: 'autre:INCONNU Paul', nom: 'Dr Inconnu', valeurs: { 2026: s(7) }, cles: ['INCONNU Paul'] }])
    expect(specs.filter(x => x.id.startsWith('__')).map(x => x.id)).toEqual(['__consultations', '__sejour_inconnu'])
    expect(specs.find(x => x.id === '__consultations').valeurs[2026]).toEqual(s(40))
  })
})

describe('export des actes', () => {
  const acte = (annee, mois, chirurgien, total) => ({ annee, mois, associe: 'TEST010', etablissement: 'MIL', ligne: 1, chirurgien, sejour: 'H1', date_acte: `${annee}-0${mois}-02`, date_facture: `${annee}-0${mois}-10`, code: 'LDFA003', coef: '1', dh: 0, amo: total, amc: 0, pat: 0, total, motif: '' })
  it('décrit une clé : praticien, total sans praticien, bucket, non classé', () => {
    expect(decrireCle('NOGUES Laurent')).toEqual({ specialite: 'Neurochirurgie', praticien: 'Dr Nogues' })
    expect(decrireCle('__spec_viscerale')).toEqual({ specialite: 'Chirurgie viscérale', praticien: '(sans praticien identifié)' })
    expect(decrireCle('__reanimation').specialite).toBe('Réanimation / USC')
    expect(decrireCle('INCONNU Paul')).toEqual({ specialite: 'Autres chirurgiens (à classer)', praticien: 'Dr Inconnu' })
  })
  it('fait une feuille par année, la plus récente d\'abord, avec une ligne TOTAL', () => {
    const f = feuillesActes([acte(2025, 3, 'NOGUES Laurent', 100), acte(2026, 1, 'NOGUES Laurent', 40), acte(2026, 2, 'DRAN Gregory', 60)], [2025, 2026])
    expect(f.map(x => x.nom)).toEqual(['Actes 2026', 'Actes 2025'])
    expect(f[0].lignes[0]).toMatchObject({ Mois: 'Janvier', 'Date acte': '02/01/2026', 'N° séjour': 'H1', Praticien: 'Dr Nogues', 'Mt Total': 40 })
    expect(f[0].lignes.at(-1)).toMatchObject({ Mois: 'TOTAL', 'N° séjour': '2 actes', 'Mt Total': 100 })
    expect(Object.keys(f[0].lignes[0])).not.toContain('Nom')
  })
})
