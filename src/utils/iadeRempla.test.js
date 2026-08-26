import { describe, it, expect } from 'vitest'
import {
  indexerBesoins, prochainRang, actionClicJour, besoinsParJour, joursEntre,
  suggestionsDepuisConges, grouperPourMail, texteMailRempla, verifierNom,
  periodeLongue, jourLong, MAX_PAR_JOUR,
} from './iadeRempla'

const b = (jour, rang = 1, extra = {}) => ({
  id: `${jour}-${rang}`, jour, rang, nom: null, statut: 'recherche', ...extra,
})
const conge = (jour, user_id, statut = 'validee') => ({
  id: `${user_id}-${jour}`, jour, user_id, statut, type_conge: 'cp',
})

describe('dates en toutes lettres', () => {
  it('ne dérive pas de fuseau', () => {
    // new Date('2026-09-14') est interprété en UTC ; affiché en local, il peut
    // reculer au 13. Le 14 doit rester le 14.
    expect(jourLong('2026-09-14')).toBe('lundi 14 septembre 2026')
    expect(jourLong('2026-01-01')).toBe('jeudi 1 janvier 2026')
  })

  it('écrit une période d\'un seul jour sans « du … au »', () => {
    expect(periodeLongue('2026-09-14', '2026-09-14')).toBe('lundi 14 septembre 2026')
    expect(periodeLongue('2026-09-14', '2026-09-16'))
      .toBe('du lundi 14 septembre 2026 au mercredi 16 septembre 2026')
  })
})

describe('besoins par jour', () => {
  it('range les besoins d\'un jour par rang', () => {
    const index = indexerBesoins([b('2026-09-14', 2), b('2026-09-14', 1)])
    expect(index.get('2026-09-14').map(x => x.rang)).toEqual([1, 2])
  })

  it('donne le premier rang libre, puis plus rien au maximum', () => {
    expect(prochainRang([])).toBe(1)
    expect(prochainRang([b('2026-09-14', 1)])).toBe(2)
    expect(prochainRang([b('2026-09-14', 1), b('2026-09-14', 2)])).toBe(null)
    expect(MAX_PAR_JOUR).toBe(2)
  })

  it('compte les jours portant au moins un besoin', () => {
    expect(besoinsParJour([b('2026-09-15'), b('2026-09-14'), b('2026-09-14', 2)]))
      .toMatchObject([{ jour: '2026-09-14', nb: 2 }, { jour: '2026-09-15', nb: 1 }])
  })
})

describe('clic sur une case du calendrier', () => {
  it('ajoute un premier puis un second remplaçant', () => {
    expect(actionClicJour([])).toEqual({ action: 'ajouter', rang: 1 })
    expect(actionClicJour([b('2026-09-14', 1)])).toEqual({ action: 'ajouter', rang: 2 })
  })

  it('remet le jour à zéro au troisième clic', () => {
    const jour = [b('2026-09-14', 1), b('2026-09-14', 2)]
    expect(actionClicJour(jour)).toEqual({ action: 'retirer', ids: ['2026-09-14-1', '2026-09-14-2'] })
  })

  it('ne détruit JAMAIS un remplaçant nommé ou pourvu', () => {
    // Le clic de trop est la faute la plus facile à faire : il ne doit pas
    // effacer un nom qu'on a mis trois jours à trouver.
    const jour = [
      b('2026-09-14', 1, { nom: 'Patrice Colin', statut: 'pourvu' }),
      b('2026-09-14', 2, { nom: 'Anne Marie Lagrave' }),
    ]
    expect(actionClicJour(jour).action).toBe('rien')
  })

  it('n\'efface que ce qui est encore anonyme', () => {
    const jour = [b('2026-09-14', 1, { nom: 'Patrice Colin', statut: 'pourvu' }), b('2026-09-14', 2)]
    expect(actionClicJour(jour)).toEqual({ action: 'retirer', ids: ['2026-09-14-2'] })
  })
})

describe('jours d\'un intervalle', () => {
  it('inclut les deux bornes', () => {
    expect(joursEntre('2026-09-14', '2026-09-16'))
      .toEqual(['2026-09-14', '2026-09-15', '2026-09-16'])
  })

  it('accepte un glissement vers le passé', () => {
    expect(joursEntre('2026-09-16', '2026-09-14'))
      .toEqual(['2026-09-14', '2026-09-15', '2026-09-16'])
  })

  it('reste borné', () => {
    expect(joursEntre('2026-01-01', '2026-12-31').length).toBe(62)
  })
})

describe('suggestions d\'après les congés', () => {
  it('propose les plages d\'absence, demandées comme validées', () => {
    const conges = [
      conge('2026-09-14', 'a'), conge('2026-09-15', 'a'),
      conge('2026-10-05', 'b', 'en_attente'),
      conge('2026-11-02', 'c', 'refusee'),
    ]
    const s = suggestionsDepuisConges(conges, [], { nomDe: id => id.toUpperCase() })
    expect(s.map(x => [x.nom, x.debut, x.fin, x.statut])).toEqual([
      ['A', '2026-09-14', '2026-09-15', 'validee'],
      ['B', '2026-10-05', '2026-10-05', 'en_attente'],
    ])
  })

  it('ne propose plus les jours déjà couverts, et disparaît quand tout l\'est', () => {
    const conges = [conge('2026-09-14', 'a'), conge('2026-09-15', 'a')]
    const partielle = suggestionsDepuisConges(conges, [b('2026-09-14')], {})
    expect(partielle[0].aCouvrir).toEqual(['2026-09-15'])

    const complete = suggestionsDepuisConges(conges, [b('2026-09-14'), b('2026-09-15')], {})
    expect(complete).toEqual([])
  })
})

describe('mail de recherche', () => {
  it('regroupe les jours consécutifs demandant autant de remplaçants', () => {
    const groupes = grouperPourMail([
      b('2026-09-14'), b('2026-09-15'), b('2026-09-16'), b('2026-09-16', 2),
    ])
    expect(groupes).toMatchObject([
      { debut: '2026-09-14', fin: '2026-09-15', nb: 1 },
      { debut: '2026-09-16', fin: '2026-09-16', nb: 2 },
    ])
  })

  it('annonce les conditions et les dates', () => {
    const texte = texteMailRempla([b('2026-09-14'), b('2026-09-15')])
    expect(texte).toContain('du lundi 14 septembre 2026 au mardi 15 septembre 2026 (2 jours)')
    expect(texte).toContain('30 € brut de l\'heure')
    expect(texte).toContain('endoscopies digestives')
    // Aucune coordonnée : elles s'ajoutent à la main avant l'envoi.
    expect(texte).not.toMatch(/@|téléphone|\d{2} \d{2} \d{2}/)
  })

  it('signale les jours qui demandent deux remplaçants', () => {
    expect(texteMailRempla([b('2026-09-14'), b('2026-09-14', 2)]))
      .toContain('— 2 remplaçants')
  })

  it('ignore ce qui est déjà pourvu, et ne dit rien quand il n\'y a rien à chercher', () => {
    const pourvu = b('2026-09-14', 1, { nom: 'Patrice Colin', statut: 'pourvu' })
    expect(texteMailRempla([pourvu])).toBe('')
    expect(texteMailRempla([pourvu, b('2026-09-15')])).toContain('mardi 15 septembre 2026')
  })
})

describe('contrôle du nom', () => {
  it('refuse le vide et accepte un nom normal', () => {
    expect(verifierNom('')).toMatch(/Indiquez/)
    expect(verifierNom(' A ')).toMatch(/Indiquez/)
    expect(verifierNom('Patrice Colin')).toBe(null)
    expect(verifierNom('x'.repeat(81))).toMatch(/trop long/)
  })
})
