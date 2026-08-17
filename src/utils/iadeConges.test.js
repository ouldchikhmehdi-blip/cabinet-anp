import { describe, it, expect } from 'vitest'
import {
  nbJours, nbJoursOuvres, chevauchent, chevauchements,
  verifierDemande, formatPeriode, bornesMois, joursDuMois,
  grouperParAgent, absenceDuJour, libelleType,
} from './iadeConges'

describe('nbJours', () => {
  it('compte les bornes incluses', () => {
    expect(nbJours('2026-07-13', '2026-07-13')).toBe(1)
    expect(nbJours('2026-07-13', '2026-07-19')).toBe(7)
  })
  it('renvoie 0 si la fin précède le début', () => {
    expect(nbJours('2026-07-19', '2026-07-13')).toBe(0)
  })
})

describe('nbJoursOuvres', () => {
  it('exclut le week-end', () => {
    // lundi 13/07/2026 → dimanche 19/07 : 5 jours ouvrés… moins le 14 juillet (mardi férié)
    expect(nbJoursOuvres('2026-07-13', '2026-07-19')).toBe(4)
  })
  it('exclut les jours fériés en semaine', () => {
    expect(nbJoursOuvres('2026-07-14', '2026-07-14')).toBe(0) // fête nationale, un mardi
    expect(nbJoursOuvres('2026-07-15', '2026-07-15')).toBe(1) // mercredi ordinaire
  })
  it('gère une période à cheval sur deux années', () => {
    // 30/12/2026 (mer) → 04/01/2027 (lun) : mer 30, jeu 31, lun 4 ouvrés ;
    // 1er janvier férié, 2 et 3 janvier = week-end.
    expect(nbJoursOuvres('2026-12-30', '2027-01-04')).toBe(3)
  })
})

describe('chevauchent / chevauchements', () => {
  const a = { date_debut: '2026-07-13', date_fin: '2026-07-19' }

  it('détecte un recouvrement, bornes incluses', () => {
    expect(chevauchent(a, { date_debut: '2026-07-19', date_fin: '2026-07-25' })).toBe(true)
    expect(chevauchent(a, { date_debut: '2026-07-20', date_fin: '2026-07-25' })).toBe(false)
  })

  it('ignore les demandes refusées et la demande en cours d\'édition', () => {
    const demandes = [
      { id: '1', date_debut: '2026-07-15', date_fin: '2026-07-16', statut: 'refusee' },
      { id: '2', date_debut: '2026-07-15', date_fin: '2026-07-16', statut: 'validee' },
    ]
    expect(chevauchements(a, demandes).map(d => d.id)).toEqual(['2'])
    expect(chevauchements(a, demandes, '2')).toEqual([])
  })
})

describe('verifierDemande', () => {
  it('accepte une demande valide', () => {
    expect(verifierDemande({ dateDebut: '2026-07-13', dateFin: '2026-07-19', type: 'conges' })).toBeNull()
  })
  it('refuse une fin antérieure au début', () => {
    expect(verifierDemande({ dateDebut: '2026-07-19', dateFin: '2026-07-13' })).toMatch(/fin/i)
  })
  it('refuse une date manquante', () => {
    expect(verifierDemande({ dateDebut: '', dateFin: '2026-07-13' })).toMatch(/date/i)
  })
  it('refuse un type inconnu', () => {
    expect(verifierDemande({ dateDebut: '2026-07-13', dateFin: '2026-07-14', type: 'vacances' })).toMatch(/type/i)
  })
  it('refuse un doublon avec une demande déjà déposée', () => {
    const mienne = [{ id: '1', date_debut: '2026-07-15', date_fin: '2026-07-20', statut: 'en_attente' }]
    expect(verifierDemande({ dateDebut: '2026-07-13', dateFin: '2026-07-19' }, mienne)).toMatch(/déjà une demande/)
  })
})

describe('formatPeriode', () => {
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

  it('marque week-ends et jours fériés', () => {
    const jours = joursDuMois(2026, 6) // juillet 2026
    expect(jours).toHaveLength(31)
    expect(jours.find(j => j.iso === '2026-07-14').ferie).toBe(true)
    expect(jours.find(j => j.iso === '2026-07-11').weekend).toBe(true) // samedi
    expect(jours.find(j => j.iso === '2026-07-13').weekend).toBe(false) // lundi
  })
})

describe('grouperParAgent / absenceDuJour', () => {
  const absences = [
    { id: '1', user_id: 'u2', nom: 'Zoé',   date_debut: '2026-07-01', date_fin: '2026-07-03', statut: 'en_attente' },
    { id: '2', user_id: 'u1', nom: 'Alice', date_debut: '2026-07-02', date_fin: '2026-07-05', statut: 'validee' },
    { id: '3', user_id: 'u1', nom: 'Alice', date_debut: '2026-07-20', date_fin: '2026-07-22', statut: 'en_attente' },
  ]

  it('groupe par agent et trie par nom', () => {
    const lignes = grouperParAgent(absences)
    expect(lignes.map(l => l.nom)).toEqual(['Alice', 'Zoé'])
    expect(lignes[0].absences).toHaveLength(2)
  })

  it('trouve l\'absence couvrant un jour, la validée en priorité', () => {
    const chevauchantes = [
      { id: 'a', date_debut: '2026-07-02', date_fin: '2026-07-02', statut: 'en_attente' },
      { id: 'b', date_debut: '2026-07-02', date_fin: '2026-07-02', statut: 'validee' },
    ]
    expect(absenceDuJour(chevauchantes, '2026-07-02').id).toBe('b')
    expect(absenceDuJour(chevauchantes, '2026-07-03')).toBeNull()
  })
})

describe('libelleType', () => {
  it('traduit les types connus et retombe sur « Congé »', () => {
    expect(libelleType('rtt')).toBe('RTT / récupération')
    expect(libelleType('inconnu')).toBe('Congé')
  })
})
