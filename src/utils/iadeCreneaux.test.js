import { describe, it, expect } from 'vitest'
import {
  MOMENTS, SECTEURS, libelleMoment, momentCourt, resume, indexerParJour,
  operateursConnus, compterDemiJournees, verifierCreneau,
  bilanBlocB, segmentsBilanB, texteBilanB,
  basculerJour, groupesConsecutifs, resumeJours, verifierLot, MAX_JOURS_LOT,
  habitudes, momentsDuLot,
  lundiDe, decalerJours, joursOuvres, bilanSemaine,
} from './iadeCreneaux'

// Dans les deux blocs, une ligne = un opérateur absent, un jour, un moment.
const a = (jour, moment, absent) => ({
  id: `A-${jour}-${moment}-${absent}`, jour, moment, secteur: 'A', salle: 'Bloc A', absent,
})
const b = (jour, moment, absent) => ({
  id: `B-${jour}-${moment}-${absent}`, jour, moment, secteur: 'B', salle: 'Bloc B', absent,
})

describe('moments et blocs', () => {
  it('couvre la journée et les deux demi-journées', () => {
    expect(MOMENTS.map(m => m.id)).toEqual(['journee', 'matin', 'apres_midi'])
    expect(libelleMoment('apres_midi')).toBe('Après-midi')
    expect(momentCourt('journee')).toBe('Journée')
  })

  it('connaît les deux blocs', () => {
    expect(SECTEURS.map(s => s.id)).toEqual(['A', 'B'])
  })
})

describe('résumé d\'un créneau', () => {
  it('nomme l\'opérateur, et ne précise le moment que pour une demi-journée', () => {
    expect(resume(a('2026-09-14', 'journee', 'Dr Martin'))).toBe('Dr Martin')
    expect(resume(a('2026-09-14', 'matin', 'Dr Martin'))).toBe('Dr Martin — matin')
    expect(resume(b('2026-09-14', 'apres_midi', 'Dr Dran'))).toBe('Dr Dran — après-midi')
    expect(resume(null)).toBe('')
  })
})

describe('index par jour', () => {
  it('classe la journée entière avant le matin, puis l\'après-midi', () => {
    const index = indexerParJour([
      a('2026-09-14', 'apres_midi', 'Dr Nc'),
      b('2026-09-14', 'journee', 'Dr Dran'),
      a('2026-09-14', 'matin', 'Dr Cpre'),
    ])
    expect(index.get('2026-09-14').map(x => x.moment)).toEqual(['journee', 'matin', 'apres_midi'])
  })

  it('trie par nom à moment égal', () => {
    const index = indexerParJour([b('2026-09-14', 'matin', 'Dr Pissas'), a('2026-09-14', 'matin', 'Dr Cpre')])
    expect(index.get('2026-09-14').map(x => x.absent)).toEqual(['Dr Cpre', 'Dr Pissas'])
  })
})

describe('bilan du bloc B — combien de salles en moins', () => {
  it('compte une salle par opérateur, le matin et l\'après-midi', () => {
    const bilan = bilanBlocB([b('2026-10-20', 'matin', 'Dr Dran'), b('2026-10-20', 'matin', 'Dr Flamein')])
    expect(bilan).toMatchObject({ matin: 2, apresMidi: 0, journee: 0, seulMatin: 2 })
    expect(segmentsBilanB(bilan)).toEqual(['−2 salles le matin'])
  })

  it('une salle en moins le matin ET une l\'après-midi, c\'est une salle en moins la journée', () => {
    // Deux personnes différentes, mais une seule salle qui manque du matin au soir.
    const bilan = bilanBlocB([b('2026-10-20', 'matin', 'Dr Dran'), b('2026-10-20', 'apres_midi', 'Dr Pissas')])
    expect(bilan).toMatchObject({ matin: 1, apresMidi: 1, journee: 1, seulMatin: 0, seulApresMidi: 0 })
    expect(segmentsBilanB(bilan)).toEqual(['−1 salle la journée'])
  })

  it('dit la journée d\'abord, puis ce qui dépasse sur une demi-journée', () => {
    const bilan = bilanBlocB([
      b('2026-10-20', 'matin', 'Dr Dran'),
      b('2026-10-20', 'matin', 'Dr Flamein'),
      b('2026-10-20', 'apres_midi', 'Dr Pissas'),
    ])
    expect(bilan).toMatchObject({ journee: 1, seulMatin: 1, seulApresMidi: 0 })
    expect(segmentsBilanB(bilan)).toEqual(['−1 salle la journée', '−1 salle le matin'])
    expect(texteBilanB(bilan)).toBe('−1 salle la journée / −1 salle le matin')
  })

  it('compte une journée entière pour le matin ET l\'après-midi', () => {
    expect(segmentsBilanB(bilanBlocB([b('2026-10-20', 'journee', 'Dr Dran'), b('2026-10-20', 'journee', 'Dr Flamein')])))
      .toEqual(['−2 salles la journée'])
    expect(segmentsBilanB(bilanBlocB([b('2026-10-20', 'journee', 'Dr Dran'), b('2026-10-20', 'apres_midi', 'Dr Pissas')])))
      .toEqual(['−1 salle la journée', '−1 salle l\'après-midi'])
  })

  it('ignore le bloc A et reste muet sans ligne', () => {
    expect(bilanBlocB([a('2026-10-20', 'matin', 'Dr Cpre')]).lignes).toEqual([])
    expect(segmentsBilanB(bilanBlocB([]))).toEqual([])
    expect(texteBilanB(null)).toBe('')
  })
})

describe('vue d\'une semaine', () => {
  it('trouve le lundi, un dimanche compris dans la semaine qui s\'achève', () => {
    expect(lundiDe('2026-10-14')).toBe('2026-10-12')   // mercredi
    expect(lundiDe('2026-10-12')).toBe('2026-10-12')   // lundi
    expect(lundiDe('2026-10-18')).toBe('2026-10-12')   // dimanche
    expect(lundiDe('2026-11-02')).toBe('2026-11-02')
  })

  it('décale sans dérive de fuseau, changement de mois compris', () => {
    expect(decalerJours('2026-10-30', 3)).toBe('2026-11-02')
    expect(decalerJours('2026-11-02', -7)).toBe('2026-10-26')
    expect(joursOuvres('2026-10-12')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'])
  })

  it('donne pour chaque jour qui manque et combien de salles en moins au bloc B', () => {
    const { jours, demiJourneesB } = bilanSemaine([
      b('2026-10-12', 'matin', 'Espérance'),
      b('2026-10-13', 'matin', 'Espérance'),
      a('2026-10-16', 'journee', 'dran'),
    ], '2026-10-12')
    expect(jours.map(j => j.iso)).toEqual(joursOuvres('2026-10-12'))
    expect(jours[0].bilanB.lignes.map(c => c.absent)).toEqual(['Espérance'])
    expect(jours[4].blocA.map(c => c.absent)).toEqual(['dran'])
    expect(jours[4].bilanB.lignes).toEqual([])
    expect(demiJourneesB).toBe(2)
  })
})

describe('aides à la saisie', () => {
  it('propose les opérateurs déjà nommés sans doublon de casse, tous blocs confondus', () => {
    expect(operateursConnus([
      b('2026-09-14', 'matin', 'Dr Dran'),
      b('2026-09-15', 'matin', 'dr dran'),
      a('2026-09-16', 'matin', 'Dr Martin'),
    ])).toEqual(['Dr Dran', 'Dr Martin'])
  })
})

describe('compte des demi-journées', () => {
  it('compte une journée entière pour deux', () => {
    expect(compterDemiJournees([a('2026-09-14', 'journee', 'Dr Nc'), b('2026-09-15', 'matin', 'Dr Dran')])).toBe(3)
    expect(compterDemiJournees([])).toBe(0)
  })
})

describe('contrôle de saisie', () => {
  it('exige un jour, un moment, un bloc et un opérateur', () => {
    expect(verifierCreneau({ jour: '', moment: 'matin', secteur: 'A', absent: 'Dr X' })).toMatch(/jour/)
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'soir', secteur: 'A', absent: 'Dr X' })).toMatch(/journée/)
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'C', absent: 'Dr X' })).toMatch(/bloc A ou le bloc B/)
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'A', absent: ' ' })).toMatch(/opérateur/)
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'B', absent: 'Dr Dran' })).toBe(null)
  })

  const existants = [b('2026-09-14', 'matin', 'Dr Dran')]

  it('accepte deux opérateurs le même matin — c\'est deux salles en moins', () => {
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'B', absent: 'Dr Flamein' }, existants))
      .toBe(null)
  })

  it('refuse deux fois le même opérateur sur le même moment', () => {
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'B', absent: 'dr dran' }, existants))
      .toMatch(/déjà noté absent/)
  })

  it('refuse une journée entière quand une demi-journée est déjà posée', () => {
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'journee', secteur: 'B', absent: 'Dr Dran' }, existants))
      .toMatch(/retirez-la/)
  })

  it('refuse une demi-journée déjà comprise dans une journée entière', () => {
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'A', absent: 'Dr Martin' },
      [a('2026-09-14', 'journee', 'Dr Martin')])).toMatch(/comprise dedans/)
  })

  it('ne se bloque pas sur la ligne qu\'on est en train de corriger', () => {
    expect(verifierCreneau({ ...existants[0], moment: 'matin' }, existants)).toBe(null)
  })

  it('ne confond pas le même nom dans les deux blocs', () => {
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'A', absent: 'Dr Dran' }, existants))
      .toBe(null)
  })
})

describe('sélection de plusieurs jours', () => {
  it('ajoute puis retire un jour au clic', () => {
    expect(basculerJour([], '2026-10-12')).toEqual(['2026-10-12'])
    expect(basculerJour(['2026-10-12'], '2026-10-12')).toEqual([])
  })

  it('garde la sélection triée quel que soit l\'ordre des clics', () => {
    let sel = basculerJour([], '2026-10-15')
    sel = basculerJour(sel, '2026-10-12')
    expect(sel).toEqual(['2026-10-12', '2026-10-15'])
  })

  it('étend depuis le dernier jour cliqué avec Maj, dans les deux sens', () => {
    expect(basculerJour(['2026-10-20'], '2026-10-22', { plage: true, ancre: '2026-10-20' }))
      .toEqual(['2026-10-20', '2026-10-21', '2026-10-22'])
    expect(basculerJour(['2026-10-22'], '2026-10-20', { plage: true, ancre: '2026-10-22' }))
      .toEqual(['2026-10-20', '2026-10-21', '2026-10-22'])
  })

  it('borne une plage aberrante', () => {
    expect(basculerJour([], '2026-12-31', { plage: true, ancre: '2026-01-01' })).toHaveLength(MAX_JOURS_LOT)
  })
})

describe('lecture d\'une sélection', () => {
  it('groupe les jours qui se suivent', () => {
    expect(groupesConsecutifs(['2026-10-12', '2026-10-20', '2026-10-21', '2026-10-22']))
      .toEqual([
        { debut: '2026-10-12', fin: '2026-10-12', nb: 1 },
        { debut: '2026-10-20', fin: '2026-10-22', nb: 3 },
      ])
  })

  it('se relit en clair avant enregistrement', () => {
    expect(resumeJours(['2026-10-12', '2026-10-20', '2026-10-21']))
      .toBe('12/10/2026, du 20/10/2026 au 21/10/2026')
    expect(resumeJours([])).toBe('')
  })
})

describe('contrôle d\'un lot', () => {
  const saisie = { moment: 'matin', secteur: 'A', absent: 'Dr Dran' }

  it('refuse un lot vide', () => {
    expect(verifierLot({ jours: [], ...saisie }).message).toMatch(/au moins un jour/)
  })

  it('ne dit qu\'une fois ce qui manque à tout le lot', () => {
    const r = verifierLot({ jours: ['2026-10-12', '2026-10-13'], ...saisie, absent: '' })
    expect(r.message).toMatch(/opérateur/)
    expect(r.aPoser).toEqual([])
  })

  it('accepte tous les jours quand rien ne gêne', () => {
    const r = verifierLot({ jours: ['2026-10-13', '2026-10-12'], ...saisie })
    expect(r.message).toBe(null)
    expect(r.aPoser.map(e => e.jour)).toEqual(['2026-10-12', '2026-10-13'])
    expect(r.refus).toEqual([])
  })

  it('laisse de côté les jours déjà notés sans faire échouer le reste', () => {
    const r = verifierLot({ jours: ['2026-10-12', '2026-10-13'], ...saisie }, [a('2026-10-12', 'matin', 'Dr Dran')])
    expect(r.message).toBe(null)
    expect(r.aPoser.map(e => e.jour)).toEqual(['2026-10-13'])
    expect(r.refus.map(x => x.jour)).toEqual(['2026-10-12'])
  })

  it('bloque quand plus rien ne reste à poser', () => {
    const r = verifierLot({ jours: ['2026-10-12'], ...saisie }, [a('2026-10-12', 'matin', 'Dr Dran')])
    expect(r.aPoser).toEqual([])
    expect(r.message).toMatch(/déjà noté absent/)
  })

  it('dédoublonne les jours', () => {
    expect(verifierLot({ jours: ['2026-10-12', '2026-10-12'], ...saisie }).aPoser.map(e => e.jour)).toEqual(['2026-10-12'])
  })

  it('refuse un lot plus long que le maximum', () => {
    const jours = Array.from({ length: MAX_JOURS_LOT + 1 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
    expect(verifierLot({ jours, ...saisie }).message).toMatch(/Pas plus de/)
  })
})

describe('bloc B — le poids des salles vient de la trame', () => {
  it('compte DEUX salles pour Fedkovic absent le mercredi matin', () => {
    // Il tient l'Endo 2 et l'Endo 4 en même temps : « −1 salle » serait faux.
    const bilan = bilanBlocB([b('2026-09-09', 'matin', 'Fedkovic')])
    expect(bilan).toMatchObject({ matin: 2, apresMidi: 0 })
    expect(segmentsBilanB(bilan)).toEqual(['−2 salles le matin'])
  })

  it('compte une seule salle pour lui les autres jours', () => {
    expect(bilanBlocB([b('2026-09-08', 'matin', 'Fedkovic')])).toMatchObject({ matin: 1 })
    expect(bilanBlocB([b('2026-09-11', 'matin', 'Fedkovic')])).toMatchObject({ matin: 1 })
  })

  it('reconnaît l\'opérateur quelle que soit la façon dont son nom est tapé', () => {
    expect(bilanBlocB([b('2026-09-09', 'matin', 'Dr FEDKOVIC')])).toMatchObject({ matin: 2 })
  })

  it('garde « un opérateur = une salle » pour qui la trame ignore', () => {
    expect(bilanBlocB([b('2026-09-09', 'matin', 'Dr Inconnu')])).toMatchObject({ matin: 1 })
  })

  it('n\'invente pas de salle perdue sur une demi-journée qu\'il ne tient pas', () => {
    // Absent LA JOURNÉE le mercredi : 2 salles le matin, aucune l'après-midi,
    // où il n'opère pas. Compter 1 par défaut ferait apparaître une salle fantôme.
    const bilan = bilanBlocB([b('2026-09-09', 'journee', 'Fedkovic')])
    expect(bilan).toMatchObject({ matin: 2, apresMidi: 0 })
    expect(segmentsBilanB(bilan)).toEqual(['−2 salles le matin'])
  })
})

describe('le moment déduit — la trame ne vaut que pour le bloc B', () => {
  const vide = habitudes([])

  it('pré-remplit depuis la trame au bloc B', () => {
    const m = momentsDuLot(vide, 'Espérance', ['2026-09-07', '2026-09-10'])
    expect(m.get('2026-09-07')).toMatchObject({ moment: 'matin', source: 'trame' })
    expect(m.get('2026-09-10')).toMatchObject({ moment: 'apres_midi', source: 'trame' })
  })

  it('ignore la trame au bloc A, même pour un nom qu\'elle connaît', () => {
    // Un homonyme du bloc A ne doit pas hériter du planning d'endoscopie.
    const m = momentsDuLot(vide, 'Espérance', ['2026-09-07'], 'journee', { trame: false })
    expect(m.get('2026-09-07')).toMatchObject({ moment: 'journee', source: 'choisi' })
  })

  it('retombe sur l\'historique quand la trame ne sait pas', () => {
    const hist = habitudes([
      b('2026-09-07', 'matin', 'Dr Inconnu'),
      b('2026-09-14', 'matin', 'Dr Inconnu'),
    ])
    const m = momentsDuLot(hist, 'Dr Inconnu', ['2026-09-21'])
    expect(m.get('2026-09-21')).toMatchObject({ moment: 'matin', source: 'jour' })
  })
})
