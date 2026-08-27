import { describe, it, expect } from 'vitest'
import { calendrier, evenement, escTexte, horodatage, plier } from './ics.js'

const DTSTAMP = '20260827T060000Z'
const octets = (s) => new TextEncoder().encode(s).length

const flux = (evenements) => calendrier({ nom: 'SARM — Test', prodid: '-//SARM//Test//FR', evenements })

describe('repli des lignes (RFC 5545 § 3.1)', () => {
  it('laisse une ligne courte intacte', () => {
    expect(plier('SUMMARY:Bloc B')).toBe('SUMMARY:Bloc B')
  })

  it('replie à 75 octets, continuation préfixée d\'une espace', () => {
    const ligne = `DESCRIPTION:${'a'.repeat(200)}`
    for (const morceau of plier(ligne).split('\r\n')) expect(octets(morceau)).toBeLessThanOrEqual(75)
    expect(plier(ligne).split('\r\n').slice(1).every(m => m.startsWith(' '))).toBe(true)
  })

  it('compte en OCTETS et ne coupe jamais un caractère accentué en deux', () => {
    // 80 « é » = 160 octets : un repli naïf à 75 caractères produirait des octets orphelins.
    const ligne = `SUMMARY:${'é'.repeat(80)}`
    const morceaux = plier(ligne).split('\r\n')
    for (const m of morceaux) expect(octets(m)).toBeLessThanOrEqual(75)
    expect(morceaux.map((m, i) => (i ? m.slice(1) : m)).join('')).toBe(ligne)
  })
})

describe('échappement TEXT', () => {
  it('protège virgule, point-virgule, antislash et retour à la ligne', () => {
    expect(escTexte('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
  })
})

describe('horodatage', () => {
  it('rend un instant UTC au format iCalendar', () => {
    expect(horodatage('2026-08-27T06:00:00Z')).toBe(DTSTAMP)
  })

  it('retombe sur l\'instant courant si la date est illisible', () => {
    expect(horodatage('pas une date')).toMatch(/^\d{8}T\d{6}Z$/)
  })
})

describe('un VEVENT est complet ou absent', () => {
  it('porte TOUJOURS un DTSTAMP — sans lui, Google et Outlook jettent l\'événement', () => {
    const lignes = evenement({ uid: 'u@x', dtstamp: DTSTAMP, jour: '20260914', debut: '0800', fin: '1800', titre: 'Bloc B' })
    expect(lignes).toContain(`DTSTAMP:${DTSTAMP}`)
  })

  it('déclare le fuseau sur un événement à l\'heure', () => {
    const lignes = evenement({ uid: 'u@x', dtstamp: DTSTAMP, jour: '20260914', debut: '0730', fin: '1730', titre: 'Bloc A' })
    expect(lignes).toContain('DTSTART;TZID=Europe/Paris:20260914T073000')
    expect(lignes).toContain('DTEND;TZID=Europe/Paris:20260914T173000')
  })

  it('rend une journée entière en VALUE=DATE, fin exclusive', () => {
    const lignes = evenement({ uid: 'u@x', dtstamp: DTSTAMP, jour: '20260914', finJour: '20260915', titre: 'Congé' })
    expect(lignes).toContain('DTSTART;VALUE=DATE:20260914')
    expect(lignes).toContain('DTEND;VALUE=DATE:20260915')
  })

  it('renvoie null — jamais un fragment — quand il manque une borne', () => {
    // Le piège d'origine : émettre BEGIN:VEVENT puis renoncer laissait un bloc non
    // refermé, qui invalide le calendrier ENTIER, pas seulement sa journée.
    expect(evenement({ uid: 'u@x', dtstamp: DTSTAMP, jour: '20260914', debut: '0800' })).toBeNull()
    expect(evenement({ uid: 'u@x', dtstamp: DTSTAMP, jour: '20260914' })).toBeNull()
    expect(evenement({ uid: 'u@x', dtstamp: DTSTAMP, titre: 'x' })).toBeNull()
    expect(evenement({ uid: 'u@x', jour: '20260914', finJour: '20260915' })).toBeNull()
  })
})

describe('calendrier', () => {
  it('déclare le VTIMEZONE Europe/Paris que les TZID référencent', () => {
    const ics = flux([])
    expect(ics).toContain('BEGIN:VTIMEZONE')
    expect(ics).toContain('TZID:Europe/Paris')
    expect(ics).toContain('END:VTIMEZONE')
  })

  it('ignore les événements null sans laisser de trou', () => {
    const ics = flux([
      evenement({ uid: 'a@x', dtstamp: DTSTAMP, jour: '20260914', finJour: '20260915', titre: 'Congé' }),
      evenement({ uid: 'b@x', dtstamp: DTSTAMP, jour: '20260915' }), // incomplet → null
    ])
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics.match(/END:VEVENT/g)).toHaveLength(1)
  })

  it('referme tout ce qu\'il ouvre et se termine en CRLF', () => {
    const ics = flux([evenement({ uid: 'a@x', dtstamp: DTSTAMP, jour: '20260914', debut: '0800', fin: '1800', titre: 'Bloc B' })])
    expect(ics.match(/BEGIN:/g)).toHaveLength(ics.match(/END:/g).length)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('replie aussi les lignes du calendrier, quelle que soit leur longueur', () => {
    const ics = flux([evenement({
      uid: 'a@x', dtstamp: DTSTAMP, jour: '20260914', debut: '0800', fin: '1800',
      titre: 'Bloc B', desc: `Un poste à la note interminable ${'é'.repeat(120)}`,
    })])
    for (const ligne of ics.split('\r\n')) expect(octets(ligne)).toBeLessThanOrEqual(75)
  })
})
