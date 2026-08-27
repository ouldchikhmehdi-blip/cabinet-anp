import { describe, it, expect } from 'vitest'
import {
  TYPES_CONGE, libelleType, courtType, libelleStatut,
  jourSuivant, seSuivent,
  compterParType, resumeTypes, plages, verifierSelection,
  formatJour, formatJourCourt, formatPeriode,
  syntheseMensuelle,
  bornesMois, joursDuMois, grilleMois,
  grouperParAgent, absenceDuJour, indexJoursPoses,
  libelleFerie, libelleTypeDetaille, feriesRecuperables, estFerieValide,
} from './iadeConges'

// Un jour posé, tel que renvoyé par la base.
const j = (jour, type = 'cp', statut = 'en_attente', extra = {}) => ({
  id: `${jour}-${type}-${statut}`, jour, type_conge: type, statut, user_id: 'u1', lot: 'l1', ...extra,
})

describe('types et statuts', () => {
  it('n\'expose que congé payé et récupération de jour férié', () => {
    expect(TYPES_CONGE.map(t => t.id)).toEqual(['cp', 'recup_ferie'])
  })
  it('traduit les types connus et retombe sur « Congé »', () => {
    expect(libelleType('cp')).toBe('Congé payé')
    expect(libelleType('recup_ferie')).toBe('Récup. jour férié')
    expect(libelleType('inconnu')).toBe('Congé')
  })
  it('donne une abréviation courte pour les cases de calendrier', () => {
    expect(courtType('cp')).toBe('CP')
    expect(courtType('recup_ferie')).toBe('RF')
  })
  it('traduit les statuts', () => {
    expect(libelleStatut('validee')).toBe('Validé')
  })
})

describe('jourSuivant / seSuivent', () => {
  it('avance d\'un jour, y compris en fin de mois et d\'année', () => {
    expect(jourSuivant('2026-07-13')).toBe('2026-07-14')
    expect(jourSuivant('2026-07-31')).toBe('2026-08-01')
    expect(jourSuivant('2026-12-31')).toBe('2027-01-01')
  })
  it('reconnaît deux jours consécutifs', () => {
    expect(seSuivent('2026-02-28', '2026-03-01')).toBe(true) // 2026 n'est pas bissextile
    expect(seSuivent('2026-07-13', '2026-07-15')).toBe(false)
  })
})

describe('compterParType / resumeTypes', () => {
  const jours = [j('2026-07-13'), j('2026-07-14'), j('2026-07-15', 'recup_ferie')]

  it('compte par nature', () => {
    expect(compterParType(jours)).toEqual({ cp: 2, recup_ferie: 1 })
  })
  it('accepte aussi la forme de sélection { type }', () => {
    expect(compterParType([{ type: 'cp' }, { type: 'recup_ferie' }])).toEqual({ cp: 1, recup_ferie: 1 })
  })
  it('résume en français, en omettant les natures absentes', () => {
    expect(resumeTypes(jours)).toBe('2 congés payés · 1 récup. jour férié')
    expect(resumeTypes([j('2026-07-13')])).toBe('1 congé payé')
  })
})

describe('plages', () => {
  it('fusionne les jours consécutifs de même nature et même statut', () => {
    const p = plages([j('2026-07-13'), j('2026-07-14'), j('2026-07-15')])
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ debut: '2026-07-13', fin: '2026-07-15', nb: 3, type_conge: 'cp' })
    expect(p[0].ids).toHaveLength(3)
  })

  it('coupe sur un trou de date', () => {
    const p = plages([j('2026-07-13'), j('2026-07-15')])
    expect(p.map(x => x.debut)).toEqual(['2026-07-13', '2026-07-15'])
  })

  it('coupe sur un changement de nature, même à dates consécutives', () => {
    const p = plages([j('2026-07-13'), j('2026-07-14', 'recup_ferie')])
    expect(p).toHaveLength(2)
    expect(p.map(x => x.type_conge)).toEqual(['cp', 'recup_ferie'])
  })

  it('coupe sur un changement de statut', () => {
    const p = plages([j('2026-07-13', 'cp', 'validee'), j('2026-07-14', 'cp', 'refusee')])
    expect(p.map(x => x.statut)).toEqual(['validee', 'refusee'])
  })

  it('ne fusionne pas deux agents ni deux envois quand les clés le demandent', () => {
    const jours = [
      j('2026-07-13', 'cp', 'en_attente', { user_id: 'u1', lot: 'A' }),
      j('2026-07-14', 'cp', 'en_attente', { user_id: 'u2', lot: 'B' }),
    ]
    expect(plages(jours, ['user_id', 'lot', 'type_conge', 'statut'])).toHaveLength(2)
  })

  it('rend les plages triées par date de début', () => {
    const p = plages([j('2026-08-03'), j('2026-07-13')])
    expect(p.map(x => x.debut)).toEqual(['2026-07-13', '2026-08-03'])
  })
})

describe('le férié récupéré', () => {
  it('nomme le férié à partir de sa seule date', () => {
    expect(libelleFerie('2026-05-08')).toBe('8 mai 2026 (Victoire 1945)')
    expect(libelleFerie('2026-11-11')).toBe('11 novembre 2026 (Armistice 1918)')
    expect(libelleFerie('2026-04-06')).toBe('6 avril 2026 (Lundi de Pâques)') // férié mobile
    expect(libelleFerie(null)).toBeNull()
  })

  it('dit de quel férié une récup provient, partout où la nature s\'affiche', () => {
    expect(libelleTypeDetaille('cp')).toBe('Congé payé')
    expect(libelleTypeDetaille('recup_ferie', '2026-05-08')).toBe('Récup. du 8 mai 2026 (Victoire 1945)')
  })

  it('avoue l\'absence d\'origine plutôt que de la taire', () => {
    // Les récups posées avant l'ajout du champ (une seule en base) : le dire
    // franchement vaut mieux que d'afficher une nature qui semble complète.
    expect(libelleTypeDetaille('recup_ferie', null)).toMatch(/non précisée/i)
  })

  it('ne propose que de vrais fériés, année en cours et précédente, du plus récent', () => {
    const liste = feriesRecuperables(new Date(Date.UTC(2026, 7, 27)))
    expect(liste[0].iso).toBe('2026-12-25')
    expect(liste.at(-1).iso).toBe('2025-01-01')
    expect(liste.every(f => estFerieValide(f.iso))).toBe(true)
    expect(liste.map(f => f.iso)).toEqual([...liste.map(f => f.iso)].sort().reverse())
  })

  it('marque les fériés pas encore passés, au lieu de les cacher', () => {
    // Un agent inscrit au planning du 25 décembre pose sa récup avant de
    // l'avoir travaillé : le choix reste offert, mais dit ce qu'il est.
    const liste = feriesRecuperables(new Date(Date.UTC(2026, 7, 27)))
    expect(liste.find(f => f.iso === '2026-12-25').aVenir).toBe(true)
    expect(liste.find(f => f.iso === '2026-05-08').aVenir).toBe(false)
  })

  it('refuse une date qui n\'est pas un jour férié français', () => {
    expect(estFerieValide('2026-05-08')).toBe(true)
    expect(estFerieValide('2026-05-09')).toBe(false)
    expect(estFerieValide('pas une date')).toBe(false)
    expect(estFerieValide(null)).toBe(false)
  })

  it('ne fond pas deux récups de fériés différents dans une seule plage', () => {
    // Deux jours qui se suivent, deux origines : les fusionner en effacerait une.
    const p = plages([
      { id: '1', jour: '2026-09-14', type_conge: 'recup_ferie', ferie: '2026-05-08', statut: 'validee' },
      { id: '2', jour: '2026-09-15', type_conge: 'recup_ferie', ferie: '2026-07-14', statut: 'validee' },
    ])
    expect(p).toHaveLength(2)
    expect(p.map(x => x.ferie)).toEqual(['2026-05-08', '2026-07-14'])
  })

  it('ventile les récups par férié dans la synthèse de la comptable', () => {
    const synth = syntheseMensuelle({
      annee: 2026, mois: 8,
      agents: [{ id: 'u1', nom: 'Dupont Marie' }],
      jours: [
        { id: '1', user_id: 'u1', jour: '2026-09-07', type_conge: 'recup_ferie', ferie: '2026-05-08', statut: 'validee' },
        { id: '2', user_id: 'u1', jour: '2026-09-08', type_conge: 'recup_ferie', ferie: '2026-05-08', statut: 'validee' },
        { id: '3', user_id: 'u1', jour: '2026-09-21', type_conge: 'recup_ferie', ferie: '2026-07-14', statut: 'validee' },
      ],
    })
    expect(synth.texte).toContain('récup. du 14 juillet 2026 (Fête nationale) (1) : lun. 21/09')
    expect(synth.texte).toContain('récup. du 8 mai 2026 (Victoire 1945) (2) : lun. 07/09, mar. 08/09')
  })
})

describe('verifierSelection', () => {
  const sel = (jour, type = 'cp', ferie = null) => ({ jour, type, ferie })

  it('accepte une sélection valide', () => {
    expect(verifierSelection([sel('2026-07-13'), sel('2026-07-16', 'recup_ferie', '2026-07-14')])).toBeNull()
  })
  it('refuse une récup qui ne dit pas quel férié elle récupère', () => {
    // Le cœur de la règle : une récup anonyme est inexploitable en paie.
    expect(verifierSelection([sel('2026-07-16', 'recup_ferie')])).toMatch(/choisissez le jour férié/i)
  })
  it('refuse une récup rattachée à une date qui n\'est pas fériée', () => {
    expect(verifierSelection([sel('2026-07-16', 'recup_ferie', '2026-07-15')])).toMatch(/jour férié/i)
  })
  it('refuse un férié accroché à un congé payé', () => {
    expect(verifierSelection([sel('2026-07-16', 'cp', '2026-07-14')])).toMatch(/récupération/i)
  })
  it('refuse une sélection vide', () => {
    expect(verifierSelection([])).toMatch(/au moins un jour/i)
  })
  it('refuse une nature inconnue', () => {
    expect(verifierSelection([sel('2026-07-13', 'rtt')])).toMatch(/nature/i)
  })
  it('refuse un jour déjà posé', () => {
    const deja = indexJoursPoses([j('2026-07-13', 'cp', 'validee')])
    expect(verifierSelection([sel('2026-07-13')], deja)).toMatch(/13\/07\/2026/)
  })
  it('refuse un envoi démesuré', () => {
    const trop = Array.from({ length: 63 }, (_, i) => sel(`2026-07-${String((i % 28) + 1).padStart(2, '0')}`))
    expect(verifierSelection(trop)).toMatch(/62 jours/)
  })
})

describe('formats', () => {
  it('formate un jour', () => {
    expect(formatJour('2026-07-13')).toBe('13/07/2026')
    expect(formatJourCourt('2026-07-13')).toBe('lun. 13/07')
  })
  it('affiche un jour unique sans « du … au »', () => {
    expect(formatPeriode('2026-07-13', '2026-07-13')).toBe('13/07/2026')
  })
  it('affiche une plage', () => {
    expect(formatPeriode('2026-07-13', '2026-08-02')).toBe('du 13/07/2026 au 02/08/2026')
  })
})

describe('calendrier mensuel', () => {
  it('borne le mois', () => {
    expect(bornesMois(2026, 1)).toEqual({ debut: '2026-02-01', fin: '2026-02-28' })
    expect(bornesMois(2026, 6)).toEqual({ debut: '2026-07-01', fin: '2026-07-31' })
  })

  it('marque week-ends et jours fériés, avec le nom du férié', () => {
    const jours = joursDuMois(2026, 6) // juillet 2026
    expect(jours).toHaveLength(31)
    expect(jours.find(x => x.iso === '2026-07-14')).toMatchObject({ ferie: true, nomFerie: 'Fête nationale' })
    expect(jours.find(x => x.iso === '2026-07-11').weekend).toBe(true)  // samedi
    expect(jours.find(x => x.iso === '2026-07-13').weekend).toBe(false) // lundi
  })

  it('découpe le mois en semaines de 7 cases commençant le lundi', () => {
    const semaines = grilleMois(2026, 6) // juillet 2026 commence un mercredi
    expect(semaines.every(s => s.length === 7)).toBe(true)
    expect(semaines[0].slice(0, 2)).toEqual([null, null])
    expect(semaines[0][2].numero).toBe(1)
    expect(semaines.flat().filter(Boolean)).toHaveLength(31)
  })
})

describe('grouperParAgent / absenceDuJour / indexJoursPoses', () => {
  const jours = [
    { id: '1', user_id: 'u2', nom: 'Zoé',   jour: '2026-07-01', type_conge: 'cp',          statut: 'en_attente' },
    { id: '2', user_id: 'u1', nom: 'Alice', jour: '2026-07-02', type_conge: 'cp',          statut: 'validee' },
    { id: '3', user_id: 'u1', nom: 'Alice', jour: '2026-07-20', type_conge: 'recup_ferie', statut: 'en_attente' },
  ]

  it('groupe par agent et trie par nom', () => {
    const lignes = grouperParAgent(jours)
    expect(lignes.map(l => l.nom)).toEqual(['Alice', 'Zoé'])
    expect(lignes[0].jours).toHaveLength(2)
  })

  it('trouve le jour posé, la ligne validée en priorité', () => {
    const doublon = [
      { id: 'a', jour: '2026-07-02', statut: 'refusee' },
      { id: 'b', jour: '2026-07-02', statut: 'validee' },
    ]
    expect(absenceDuJour(doublon, '2026-07-02').id).toBe('b')
    expect(absenceDuJour(doublon, '2026-07-03')).toBeNull()
  })

  it('n\'indexe pas les jours refusés : ils peuvent être reposés', () => {
    const index = indexJoursPoses([
      { id: 'a', jour: '2026-07-02', statut: 'refusee' },
      { id: 'b', jour: '2026-07-03', statut: 'en_attente' },
    ])
    expect(index.has('2026-07-02')).toBe(false)
    expect(index.get('2026-07-03').id).toBe('b')
  })
})

describe('syntheseMensuelle', () => {
  const agents = [{ id: 'u1', nom: 'Dupont Marie' }, { id: 'u2', nom: 'Amar Sophie' }]
  const jours = [
    // Marie : 2 CP + 1 récup, validés
    { id: 'a', user_id: 'u1', jour: '2026-09-07', type_conge: 'cp',          statut: 'validee' },
    { id: 'b', user_id: 'u1', jour: '2026-09-08', type_conge: 'cp',          statut: 'validee' },
    { id: 'c', user_id: 'u1', jour: '2026-09-17', type_conge: 'recup_ferie', ferie: '2026-07-14', statut: 'validee' },
    // Sophie : 1 CP validé
    { id: 'd', user_id: 'u2', jour: '2026-09-14', type_conge: 'cp',          statut: 'validee' },
    // à exclure : en attente, refusé, et un mois voisin
    { id: 'e', user_id: 'u2', jour: '2026-09-21', type_conge: 'cp',          statut: 'en_attente' },
    { id: 'f', user_id: 'u1', jour: '2026-09-28', type_conge: 'cp',          statut: 'refusee' },
    { id: 'g', user_id: 'u1', jour: '2026-10-01', type_conge: 'cp',          statut: 'validee' },
  ]

  const synth = syntheseMensuelle({ jours, agents, annee: 2026, mois: 8 }) // septembre

  it('ne retient que les jours validés du mois demandé', () => {
    expect(synth.valides).toBe(4)
    expect(synth.parType).toEqual({ cp: 3, recup_ferie: 1 })
    expect(synth.texte).not.toMatch(/21\/09|28\/09|01\/10/)
  })

  it('signale à part les jours encore en attente, sans les mettre dans le texte', () => {
    expect(synth.enAttente).toBe(1)
  })

  it('trie les agents par nom et détaille chaque nature', () => {
    const lignes = synth.texte.split('\n')
    expect(lignes[1]).toBe('Congés et heures supplémentaires IADE — Septembre 2026')
    expect(synth.texte.indexOf('Amar Sophie')).toBeLessThan(synth.texte.indexOf('Dupont Marie'))
    expect(synth.texte).toContain('Dupont Marie — 3 jours')
    expect(synth.texte).toContain('Congés payés (2) : lun. 07/09, mar. 08/09')
    // La récup NOMME le férié qu'elle récupère : c'est ce que la comptable doit lire.
    expect(synth.texte).toContain('Récup. jour férié (1) :')
    expect(synth.texte).toContain('récup. du 14 juillet 2026 (Fête nationale) (1) : jeu. 17/09')
    expect(synth.texte).toContain('Amar Sophie — 1 jour')
    expect(synth.texte).toContain('Total du mois : 4 jours — 3 congés payés · 1 récup. jour férié')
  })

  it('ajoute la date d\'édition seulement si on la fournit', () => {
    expect(synth.texte).not.toMatch(/Édité le/)
    const avecDate = syntheseMensuelle({ jours, agents, annee: 2026, mois: 8, genereLe: '2026-10-02' })
    expect(avecDate.texte).toContain('Édité le 02/10/2026 depuis le dashboard SARM.')
  })

  it('reste lisible quand le mois est vide', () => {
    const vide = syntheseMensuelle({ jours, agents, annee: 2026, mois: 0 })
    expect(vide.valides).toBe(0)
    expect(vide.nbAgents).toBe(0)
    expect(vide.texte).toContain('Aucun congé validé sur ce mois.')
  })

  it('n\'invente pas de nom pour un agent supprimé', () => {
    const orphelin = syntheseMensuelle({ jours, agents: [], annee: 2026, mois: 8 })
    expect(orphelin.texte).toContain('Agent inconnu')
  })

  // La comptable reçoit UN seul texte : congés et heures sup dans le même envoi.
  describe('heures supplémentaires dans le même texte', () => {
    const heuresSup = [
      { id: 'h1', user_id: 'u1', jour: '2026-09-09', heures: 4, statut: 'validee' },
      { id: 'h2', user_id: 'u1', jour: '2026-09-23', heures: 2, statut: 'validee' },
      { id: 'h3', user_id: 'u2', jour: '2026-09-10', heures: 6, statut: 'validee' },
      // à exclure : en attente, refusée, et un mois voisin
      { id: 'h4', user_id: 'u2', jour: '2026-09-11', heures: 3, statut: 'en_attente' },
      { id: 'h5', user_id: 'u1', jour: '2026-09-12', heures: 3, statut: 'refusee' },
      { id: 'h6', user_id: 'u1', jour: '2026-10-02', heures: 5, statut: 'validee' },
    ]
    const avecHs = syntheseMensuelle({ jours, heuresSup, agents, annee: 2026, mois: 8 })

    it('détaille les heures validées par agent et par jour', () => {
      expect(avecHs.texte).toContain('HEURES SUPPLÉMENTAIRES VALIDÉES')
      expect(avecHs.texte).toContain('Dupont Marie — 6 h : mer. 09/09 (4 h), mer. 23/09 (2 h)')
      expect(avecHs.texte).toContain('Amar Sophie — 6 h : jeu. 10/09 (6 h)')
      expect(avecHs.texte).toContain('Total du mois : 12 h pour 2 agents.')
    })

    it('écarte les heures non validées et celles d\'un autre mois', () => {
      expect(avecHs.heuresSup.valides).toBe(3)
      expect(avecHs.heuresSup.heures).toBe(12)
      expect(avecHs.heuresSup.enAttente).toBe(1)
      expect(avecHs.texte).not.toMatch(/11\/09|12\/09|02\/10/)
    })

    it('reste lisible quand il n\'y a aucune heure sup', () => {
      expect(synth.texte).toContain('Aucune heure supplémentaire validée sur ce mois.')
      expect(synth.heuresSup.valides).toBe(0)
    })
  })
})
