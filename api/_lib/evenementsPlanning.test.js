import { describe, it, expect } from 'vitest'
import { evenementsDepuisPlanning } from './evenementsPlanning.js'

const l = (jour, extra = {}) => ({ jour, matin: null, apres_midi: null, note: null, ...extra })

describe('événements tirés du planning publié', () => {
  it('met une journée à l\'heure quand la plage est lisible', () => {
    expect(evenementsDepuisPlanning([l('2026-09-14', { matin: '8h-18h B' })])).toEqual([
      { d: '20260914', slot: 'm', ts: '0800', te: '1800', titre: 'Bloc B', desc: '8h-18h B' },
    ])
  })

  it('gère les minutes et les plages sans « h » de fin', () => {
    const [e] = evenementsDepuisPlanning([l('2026-09-14', { matin: '7h30-17h30 CPRE' })])
    expect(e).toMatchObject({ ts: '0730', te: '1730' })
    const [f] = evenementsDepuisPlanning([l('2026-09-14', { matin: '13-18h A' })])
    expect(f).toMatchObject({ ts: '1300', te: '1800', titre: 'Bloc A' })
  })

  it('met l\'heure dans le titre d\'une CPRE qui ne commence pas à 8 h (le jeudi, 7h30)', () => {
    // Dans les têtes, « CPRE = 8 h ». Le jeudi c'est 7h30 : l'agenda le plaçait
    // bien à 7h30 mais titrait « CPRE » comme les autres jours, et ça passait
    // inaperçu. Le titre est ce qu'on lit dans une vue mois : l'heure y va.
    const [e] = evenementsDepuisPlanning([l('2026-10-01', { matin: '7h30-17h30 CPRE' })])
    expect(e).toMatchObject({
      ts: '0730', te: '1730', titre: 'CPRE 7h30 !',
      desc: 'Début à 7h30 (et non 8h). 7h30-17h30 CPRE',
    })
    // Les autres CPRE gardent leur titre nu : 8h-18h le lundi, 08h-13h le mercredi.
    expect(evenementsDepuisPlanning([l('2026-09-28', { matin: '8h-18h CPRE' })])[0])
      .toMatchObject({ titre: 'CPRE', desc: '8h-18h CPRE' })
    expect(evenementsDepuisPlanning([l('2026-09-30', { matin: '08h-13h CPRE' })])[0])
      .toMatchObject({ titre: 'CPRE', desc: '08h-13h CPRE' })
    // Sans horaire (« CPRE » seul, le vendredi) : journée entière, titre nu.
    expect(evenementsDepuisPlanning([l('2026-10-02', { matin: 'CPRE', apres_midi: '13h-18h B' })])[0])
      .toMatchObject({ allday: true, titre: 'CPRE' })
    // Le Bloc A commence toujours à 7h30 : c'est l'habitude, pas une exception.
    expect(evenementsDepuisPlanning([l('2026-10-02', { matin: '7h30-17h30 A' })])[0])
      .toMatchObject({ titre: 'Bloc A' })
  })

  it('coupe la journée en deux quand matin et après-midi diffèrent', () => {
    const evts = evenementsDepuisPlanning([
      l('2026-09-14', { matin: '08h-13h CPRE', apres_midi: '13h-18h B' }),
    ])
    expect(evts.map(e => [e.slot, e.ts, e.te])).toEqual([
      ['m', '0800', '1300'], ['a', '1300', '1800'],
    ])
  })

  it('affiche le congé en journée entière, SANS le poste', () => {
    // Le poste du planning est celui que couvre le remplaçant : l'agent est absent.
    expect(evenementsDepuisPlanning([
      l('2026-09-14', { matin: '8h-18h B', note: 'Congé' }),
    ])).toEqual([
      { d: '20260914', slot: 'conge', allday: true, fin: '20260915', titre: 'Congé', desc: '' },
    ])
  })

  it('termine une journée entière le lendemain, changement de mois compris', () => {
    const [e] = evenementsDepuisPlanning([l('2026-09-30', { note: 'congé' })])
    expect(e.fin).toBe('20261001')
    const [f] = evenementsDepuisPlanning([l('2026-12-31', { note: 'Congé' })])
    expect(f.fin).toBe('20270101')
  })

  it('signale les heures sup dans la description', () => {
    const [e] = evenementsDepuisPlanning([l('2026-09-14', { matin: '8h-18h B', note: '+10h' })])
    expect(e.desc).toBe('8h-18h B  (HS +10h)')
  })

  it('ne produit rien pour un jour OFF ou vide', () => {
    expect(evenementsDepuisPlanning([
      l('2026-09-14', { matin: 'OFF' }),
      l('2026-09-15'),
      { matin: '8h-18h B' },          // ligne sans jour : ignorée
    ])).toEqual([])
  })

  it('garde une journée d\'heures sup sans poste', () => {
    // Ça arrive vraiment : « +10h » sur une journée marquée OFF. Sans cet
    // événement, une journée travaillée n'apparaîtrait nulle part.
    expect(evenementsDepuisPlanning([l('2026-09-02', { note: '+10h' })])).toEqual([
      { d: '20260902', slot: 'hs', allday: true, fin: '20260903', titre: 'Heures sup +10h', desc: '' },
    ])
  })

  it('bascule en journée entière quand l\'horaire n\'est pas lisible', () => {
    const [e] = evenementsDepuisPlanning([l('2026-09-14', { matin: 'Renfort' })])
    expect(e).toMatchObject({ allday: true, titre: 'Renfort', fin: '20260915' })
  })
})
