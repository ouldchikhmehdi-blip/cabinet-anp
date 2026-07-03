import { describe, it, expect } from 'vitest'
import { detecterAberrations } from './desiderataAberrants'
import { desiderataVide } from './desiderata'
import { numeroSemaineISO, parseISO } from './calendrier'

// Trame principale de test : 3 colonnes.
//   C0 : travaille le vendredi (poste), NON de service.
//   C1 : de service le vendredi (garde/astreinte).
//   C2 : repos le vendredi.
const TRAME = {
  colonnes: [
    { lun: 'SARM 1', mar: '', mer: '', jeu: '', ven: 'Bloc B', service: { ven: false } },
    { lun: '', mar: '', mer: '', jeu: '', ven: 'Garde', service: { ven: true } },
    { lun: 'SARM 2', mar: '', mer: '', jeu: '', ven: '', service: { ven: false } },
  ],
}

const VENDREDI_S1 = '2026-01-02' // vendredi, semaine ISO 1
const LUNDI_S2 = '2026-01-05'    // lundi, semaine ISO 2

function base(patch) {
  return { ...desiderataVide(), ...patch }
}

describe('detecterAberrations — jour off dans une semaine de vacances', () => {
  it('signale un jour off tombant dans une semaine demandée en vacances', () => {
    const sem = numeroSemaineISO(parseISO(LUNDI_S2))
    const d = base({ joursOffSouhaites: [LUNDI_S2], vacancesSouhaitees: [sem] })
    const ab = detecterAberrations(d, { tramePrincipale: TRAME, annee: 2026 })
    expect(ab.some(a => a.type === 'off-dans-vacances' && a.semaine === sem)).toBe(true)
  })

  it('ne signale rien si le jour off n’est pas dans une semaine de vacances', () => {
    const d = base({ joursOffSouhaites: [LUNDI_S2], vacancesSouhaitees: [] })
    expect(detecterAberrations(d, { tramePrincipale: TRAME, annee: 2026 })).toEqual([])
  })
})

describe('detecterAberrations — jour off le vendredi vs colonne choisie', () => {
  it('signale un off le vendredi quand la colonne choisie travaille le vendredi', () => {
    const d = base({ joursOffSouhaites: [VENDREDI_S1], colonnesSouhaitees: { 1: 0 } }) // C0 travaille le ven
    const ab = detecterAberrations(d, { tramePrincipale: TRAME, annee: 2026 })
    expect(ab.some(a => a.type === 'off-vendredi-colonne' && a.semaine === 1)).toBe(true)
  })

  it('ne signale rien si la colonne choisie est en repos le vendredi', () => {
    const d = base({ joursOffSouhaites: [VENDREDI_S1], colonnesSouhaitees: { 1: 2 } }) // C2 repos le ven
    expect(detecterAberrations(d, { tramePrincipale: TRAME, annee: 2026 })).toEqual([])
  })

  it('ne signale rien si aucune colonne n’est choisie pour cette semaine', () => {
    const d = base({ joursOffSouhaites: [VENDREDI_S1], colonnesSouhaitees: {} })
    expect(detecterAberrations(d, { tramePrincipale: TRAME, annee: 2026 })).toEqual([])
  })
})

describe('detecterAberrations — veille de week-end vs colonne de service le vendredi', () => {
  it('signale une veille indispo alors que la colonne choisie est de service le vendredi', () => {
    const d = base({ weekendsIndispo: [1], weekendsVeilleIndispo: [1], colonnesSouhaitees: { 1: 1 } }) // C1 de service ven
    const ab = detecterAberrations(d, { tramePrincipale: TRAME, annee: 2026 })
    expect(ab.some(a => a.type === 'veille-colonne-service' && a.semaine === 1)).toBe(true)
  })

  it('ne signale rien si la colonne choisie n’est pas de service le vendredi', () => {
    const d = base({ weekendsIndispo: [1], weekendsVeilleIndispo: [1], colonnesSouhaitees: { 1: 0 } }) // C0 travaille mais pas de service
    expect(detecterAberrations(d, { tramePrincipale: TRAME, annee: 2026 })).toEqual([])
  })
})

describe('detecterAberrations — cas neutres', () => {
  it('desiderata vide → aucune aberration', () => {
    expect(detecterAberrations(desiderataVide(), { tramePrincipale: TRAME, annee: 2026 })).toEqual([])
  })

  it('sans trame principale, les règles de colonne sont inactives (pas de faux positif)', () => {
    const d = base({ joursOffSouhaites: [VENDREDI_S1], colonnesSouhaitees: { 1: 0 } })
    expect(detecterAberrations(d, { tramePrincipale: null, annee: 2026 })).toEqual([])
  })
})
