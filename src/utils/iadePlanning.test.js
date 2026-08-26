import { describe, it, expect } from 'vitest'
import {
  couleurPoste, decrire, bornesDuMois, colonnesDuMois,
  indexerParJour, texteCase, semaineISO, natureNote, libelleNote,
} from './iadePlanning'

const c = (jour, iade, rang, extra = {}) => ({
  jour, iade, rang, matin: null, apres_midi: null, poste: null, note: null, ...extra,
})

describe('description des jours', () => {
  it('nomme le jour sans dériver de fuseau', () => {
    // Un new Date('2026-09-01') interprété en UTC puis affiché en local peut
    // reculer d'un jour : la description doit rester sur le 1er.
    expect(decrire('2026-09-01')).toMatchObject({ jour: 1, mois: 9, libelleJour: 'Mardi' })
    expect(decrire('2026-01-01').libelleJour).toBe('Jeudi')
  })

  it('formate la date courte', () => {
    expect(decrire('2026-09-02').court).toBe('mer. 02/09')
  })
})

describe('bornes du mois', () => {
  it('couvre le mois entier, février compris', () => {
    expect(bornesDuMois(2026, 9)).toEqual({ debut: '2026-09-01', fin: '2026-09-30' })
    expect(bornesDuMois(2026, 2)).toEqual({ debut: '2026-02-01', fin: '2026-02-28' })
    expect(bornesDuMois(2024, 2).fin).toBe('2024-02-29')
  })
})

describe('colonnes du mois', () => {
  it('suit l\'ordre du fichier, pas l\'ordre alphabétique', () => {
    const cases = [c('2026-09-01', 'Cathy', 0), c('2026-09-01', 'Nicolas', 1), c('2026-09-01', 'Aline', 2)]
    expect(colonnesDuMois(cases)).toEqual(['Cathy', 'Nicolas', 'Aline'])
  })

  it('ne répète pas un agent présent tous les jours', () => {
    const cases = [c('2026-09-01', 'Cathy', 0), c('2026-09-02', 'Cathy', 0)]
    expect(colonnesDuMois(cases)).toEqual(['Cathy'])
  })
})

describe('index par jour', () => {
  it('rapproche les cases et les infos du jour', () => {
    const index = indexerParJour(
      [c('2026-09-01', 'Cathy', 0, { poste: 'B' })],
      [{ jour: '2026-09-01', vacances: true, remplacants: ['Patrice Colin'] }],
    )
    const j = index.get('2026-09-01')
    expect(j.infos.vacances).toBe(true)
    expect(j.infos.remplacants).toEqual(['Patrice Colin'])
    expect(j.cases.get('Cathy').poste).toBe('B')
  })

  it('garde un jour dont l\'entête manque plutôt que de le perdre', () => {
    const index = indexerParJour([c('2026-09-03', 'Cathy', 0)], [])
    expect(index.get('2026-09-03').infos).toMatchObject({ jour: '2026-09-03', vacances: false })
  })
})

describe('contenu d\'une case', () => {
  it('affiche OFF sur une journée de repos', () => {
    expect(texteCase({ kind: 'off', poste: 'OFF' })).toMatchObject({ haut: 'OFF', pleine: true })
  })

  it('sépare matin et après-midi sur une journée coupée', () => {
    expect(texteCase({ kind: 'split', matin: '08h-13h CPRE', apres_midi: '13h-18h B', poste: 'CPRE' }))
      .toEqual({ haut: '08h-13h CPRE', bas: '13h-18h B', pleine: false })
  })

  it('reste vide sans case', () => {
    expect(texteCase(undefined).haut).toBe('')
  })
})

describe('semaine ISO', () => {
  it('groupe les jours d\'une même semaine', () => {
    // Lundi 7 au vendredi 11 septembre 2026 : une seule et même semaine.
    const semaine = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'].map(semaineISO)
    expect(new Set(semaine).size).toBe(1)
  })

  it('change de numéro d\'un vendredi au lundi suivant', () => {
    expect(semaineISO('2026-09-11')).not.toBe(semaineISO('2026-09-14'))
  })

  it('reste cohérent au passage d\'année', () => {
    // Le 1er janvier 2026 est un jeudi : il appartient à la semaine 1.
    expect(semaineISO('2026-01-01')).toBe(1)
    // Le 31 décembre 2026 est un jeudi : semaine 53, pas la semaine 1 de 2027.
    expect(semaineISO('2026-12-31')).toBe(53)
  })
})

describe('nature et libellé d\'une note', () => {
  it('reconnaît un congé quel que soit l\'accent ou la casse', () => {
    // Le fichier Excel n'est pas régulier : « Congé », « Conge », « congés »
    // désignent tous la même chose.
    for (const note of ['Congé', 'conge', 'CONGÉS', ' Congé ']) {
      expect(natureNote(note)).toBe('conge')
      expect(libelleNote(note)).toBe('CONGÉ')
    }
  })

  it('range tout le reste en heures supplémentaires', () => {
    expect(natureNote('+10h')).toBe('hs')
    expect(natureNote('HS')).toBe('hs')
    expect(natureNote(null)).toBe(null)
    expect(natureNote('   ')).toBe(null)
  })

  it('aère le nombre d\'heures pour qu\'il ne se lise pas comme un horaire', () => {
    expect(libelleNote('+10h')).toBe('+10 h')
    expect(libelleNote('8h')).toBe('+8 h')
    expect(libelleNote('+2,5h')).toBe('+2.5 h')
    expect(libelleNote('HS')).toBe('HS')
    expect(libelleNote(null)).toBe('')
  })
})

describe('couleurs', () => {
  it('donne une couleur à chaque poste connu, rien aux autres', () => {
    expect(couleurPoste('A')).toBe('#3E7CB1')
    expect(couleurPoste('OFF')).toBe('#C9C7BF')
    expect(couleurPoste(null)).toBe(null)
    expect(couleurPoste('INCONNU')).toBe(null)
  })
})
