import { describe, it, expect } from 'vitest'
import { momentSelonTrameA, operateursTrameA, semaineTypeA, nomCanoniqueA } from './iadeBlocA'

// Semaine du lundi 7 au vendredi 11 septembre 2026.
const SEMAINE = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']

describe('la trame du bloc A — CPRE', () => {
  it('lundi et jeudi la journée, mardi, mercredi et vendredi le matin', () => {
    expect(SEMAINE.map(j => momentSelonTrameA('CPRE', j)?.moment))
      .toEqual(['journee', 'matin', 'matin', 'journee', 'matin'])
  })

  it('reconnaît le nom quelle que soit la casse', () => {
    expect(momentSelonTrameA('cpre', '2026-09-07')).toMatchObject({ moment: 'journee', source: 'trame' })
  })

  it('ne dit rien le week-end, ni pour un nom qu\'elle ne connaît pas', () => {
    expect(momentSelonTrameA('CPRE', '2026-09-12')).toBeNull()
    expect(momentSelonTrameA('Dr Martin', '2026-09-07')).toBeNull()
  })

  it('propose CPRE à la frappe et décrit sa semaine', () => {
    expect(operateursTrameA()).toContain('CPRE')
    expect(semaineTypeA('CPRE').map(j => `${j.label} ${j.moment}`))
      .toEqual(['lundi journee', 'mardi matin', 'mercredi matin', 'jeudi journee', 'vendredi matin'])
  })
})

// Semaine 46 (paire) : 9 → 13 novembre 2026 ; semaine 47 (impaire) : 16 → 20.
const PAIRE = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']
const IMPAIRE = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']
const jours = (nom, semaine) => semaine.map(j => momentSelonTrameA(nom, j)?.moment ?? '-')

describe('la trame du bloc A — opérateurs', () => {
  it('Flamein : lundi, mardi ; jeudi les semaines paires, vendredi les impaires', () => {
    expect(jours('Flamein', PAIRE)).toEqual(['journee', 'journee', '-', 'journee', '-'])
    expect(jours('Flamein', IMPAIRE)).toEqual(['journee', 'journee', '-', '-', 'journee'])
  })

  it('Malgoire : lundi après-midi, jeudi les semaines impaires, tous les vendredis', () => {
    expect(jours('Malgoire', PAIRE)).toEqual(['apres_midi', '-', '-', '-', 'journee'])
    expect(jours('Malgoire', IMPAIRE)).toEqual(['apres_midi', '-', '-', 'journee', 'journee'])
  })

  it('Pissas : mercredi ; jeudi les semaines impaires, vendredi les paires', () => {
    expect(jours('Pissas', PAIRE)).toEqual(['-', '-', 'journee', '-', 'journee'])
    expect(jours('Pissas', IMPAIRE)).toEqual(['-', '-', 'journee', 'journee', '-'])
  })

  it('les opérateurs sans alternance', () => {
    for (const semaine of [PAIRE, IMPAIRE]) {
      expect(jours('Nogues', semaine)).toEqual(['journee', '-', '-', 'journee', '-'])
      expect(jours('Rolland', semaine)).toEqual(['journee', '-', 'journee', '-', '-'])
      expect(jours('Meyer-Bisch', semaine)).toEqual(['-', 'journee', 'journee', '-', '-'])
      expect(jours('Dran', semaine)).toEqual(['-', 'journee', '-', '-', 'journee'])
    }
  })

  it('reconnaît les orthographes saisies en base', () => {
    expect(momentSelonTrameA('flamein', '2026-11-09')?.moment).toBe('journee')
    expect(momentSelonTrameA('meyer bish', '2026-11-10')?.moment).toBe('journee')
    expect(momentSelonTrameA('Meyer Bisch', '2026-11-10')?.moment).toBe('journee')
    expect(nomCanoniqueA('meyer bish')).toBe('Meyer-Bisch')
    expect(nomCanoniqueA('Dr Martin')).toBe('Dr Martin')
  })

  it('décrit la semaine type avec la parité', () => {
    expect(semaineTypeA('Flamein').map(j => `${j.label} ${j.moment}${j.alterne ? ' ' + j.alterne : ''}`))
      .toEqual(['lundi journee', 'mardi journee', 'jeudi journee paires', 'vendredi journee impaires'])
  })
})
