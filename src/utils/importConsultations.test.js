import { describe, it, expect } from 'vitest'
import { construireDetailImport } from './importConsultations'

// Store minimal : 1 spécialité à praticiens + 1 spécialité sans praticien.
const store = () => ({
  global:            { 2026: [100, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  teleconsultations: { 2026: [10, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  specialites: [
    {
      id: 'endoscopie', nom: 'Gastro', couleur: '#534AB7',
      praticiens: [
        { id: 'ayral',    nom: 'Dr Ayral',    valeurs: { 2026: [40, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
        { id: 'fedkovic', nom: 'Dr Fedkovic', valeurs: { 2026: [30, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
      ],
      valeurs: { 2026: [5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    },
    { id: 'pneumologie', nom: 'Pneumo', couleur: '#1D9E75', valeurs: {} },
  ],
})

describe('construireDetailImport', () => {
  it('compare mois par mois l’import à ce qui est déjà en base', () => {
    const agrege = {
      global:            { 2026: { 1: 250 } },   // février : 200 en base → 250
      teleconsultations: { 2026: { 1: 25 } },
      praticiens: { endoscopie: { ayral: { 2026: { 1: 70 } } } },
      specialites: {},
    }
    const d = construireDetailImport(agrege, store())

    expect(d.mois).toHaveLength(1)
    expect(d.mois[0]).toMatchObject({
      annee: 2026, mois: 1, label: 'Fév 2026',
      total: 250, tele: 25, ancienTotal: 200, ancienTele: 20,
    })
    expect(d.remplacements).toBe(1)
    expect(d.totalImport).toBe(250)
  })

  it('ne compte comme « remplacement » que les mois déjà remplis', () => {
    // Mars (index 2) est vide en base
    const agrege = { global: { 2026: { 2: 300 } }, teleconsultations: {}, praticiens: {}, specialites: {} }
    const d = construireDetailImport(agrege, store())
    expect(d.mois[0].ancienTotal).toBe(0)
    expect(d.remplacements).toBe(0)
  })

  it('marque « conservé » (importe null) un praticien absent du fichier', () => {
    const agrege = {
      global: { 2026: { 1: 250 } }, teleconsultations: {},
      praticiens: { endoscopie: { ayral: { 2026: { 1: 70 } } } },   // Fedkovic absent
      specialites: {},
    }
    const d = construireDetailImport(agrege, store())
    const gastro = d.groupes.find(g => g.id === 'endoscopie')

    expect(gastro.lignes.find(l => l.id === 'ayral')).toMatchObject({ importe: 70, actuel: 50 })
    expect(gastro.lignes.find(l => l.id === 'fedkovic')).toMatchObject({ importe: null, actuel: 60 })
  })

  it('sépare ventilé / téléconsultations / non ventilé sans double comptage', () => {
    const agrege = {
      global:            { 2026: { 1: 250 } },
      teleconsultations: { 2026: { 1: 25 } },
      praticiens:  { endoscopie: { ayral: { 2026: { 1: 100 } } } },
      specialites: { endoscopie: { 2026: { 1: 25 } } },
      // 250 = 25 (télé) + 100 (Ayral) + 25 (non attribué) + 100 (global/autre)
    }
    const d = construireDetailImport(agrege, store())

    expect(d.ventileImport).toBe(125)
    expect(d.teleImport).toBe(25)
    expect(d.nonVentile).toBe(100)
    expect(d.ventileImport + d.teleImport + d.nonVentile).toBe(d.totalImport)
  })

  it('agrège sur tous les mois de l’import et ignore les mois à zéro', () => {
    const agrege = {
      global: { 2026: { 0: 100, 1: 200, 3: 0 } }, teleconsultations: {},
      praticiens: {}, specialites: {},
    }
    const d = construireDetailImport(agrege, store())
    expect(d.mois.map(m => m.mois)).toEqual([0, 1])   // avril (3) à 0 → exclu
    expect(d.totalImport).toBe(300)
    expect(d.totalActuel).toBe(300)                    // 100 + 200 déjà en base
  })

  it('n’affiche pas les spécialités sans donnée ni avant ni après', () => {
    const agrege = { global: { 2026: { 1: 250 } }, teleconsultations: {}, praticiens: {}, specialites: {} }
    const d = construireDetailImport(agrege, store())
    expect(d.groupes.map(g => g.id)).not.toContain('pneumologie')
  })
})
