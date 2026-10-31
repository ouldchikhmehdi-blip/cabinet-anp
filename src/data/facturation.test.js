// Séries de facturation sur des agrégats INVENTÉS (montants ronds).
import { describe, it, expect } from 'vitest'
import { calculerSeriesFact } from './facturation'

const m = (annee, mois, extra = {}) => ({ annee, mois, associe: 'AAAA000', etablissement: 'MIL', facture_total: 1000, facture_dh: 100, facture_amo: 0, facture_amc: 0, facture_pat: 0, regle_total: 800, regle_conv: 500, regle_dh: 300, redevance_ttc: 80, ...extra })

describe('calculerSeriesFact', () => {
  it('additionne associés et établissements par mois, et marque les mois importés', () => {
    const S = calculerSeriesFact([m(2026, 1), m(2026, 1, { associe: 'BBBB000', facture_total: 500.5 }), m(2026, 3, { etablissement: 'CLE' })], [])
    expect(S.ANNEES).toEqual([2026, 2025])
    expect(S.FACTURE[2026].slice(0, 3)).toEqual([1500.5, 0, 1000])
    expect(S.REGLE[2026][0]).toBe(1600)
    expect(S.REDEVANCE[2026][2]).toBe(80)
    expect(S.DH[2026][0]).toBe(200)
    expect(S.RENSEIGNE[2026].slice(0, 3)).toEqual([true, false, true])
    expect(S.moisActuel(2026)).toBe(2)
    expect(S.moisActuel(2025)).toBe(-1)
    expect(S.FACTURE[2025]).toEqual(Array(12).fill(0))
  })
  it('range le facturé par chirurgien et bucket', () => {
    const S = calculerSeriesFact([], [
      { annee: 2026, mois: 2, chirurgien: 'NOGUES Laurent', montant: 300 },
      { annee: 2026, mois: 2, chirurgien: '__consultations', montant: 40 },
      { annee: 2025, mois: 12, chirurgien: 'NOGUES Laurent', montant: 10 },
    ])
    expect(S.ANNEES).toEqual([2026, 2025])
    expect(S.PAR_CHIRURGIEN[2026]['NOGUES Laurent'][1]).toBe(300)
    expect(S.PAR_CHIRURGIEN[2026].__consultations[1]).toBe(40)
    expect(S.PAR_CHIRURGIEN[2025]['NOGUES Laurent'][11]).toBe(10)
    expect(S.moisActuel(2026)).toBe(1)
  })
  it('sans donnée : deux années vides, rien ne plante', () => {
    const S = calculerSeriesFact()
    expect(S.ANNEES).toHaveLength(2)
    expect(S.moisActuel(S.ANNEES[0])).toBe(-1)
  })
})
