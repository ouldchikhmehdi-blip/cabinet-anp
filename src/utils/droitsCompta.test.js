import { describe, it, expect } from 'vitest'
import { peutGererCompta } from './droitsCompta'

describe('peutGererCompta', () => {
  it('admin et rôle Compta : oui', () => {
    expect(peutGererCompta({ role: 'admin' })).toBe(true)
    expect(peutGererCompta({ role: 'user', is_compta: true })).toBe(true)
  })
  it('associé sans le rôle, faiseur, profil pas encore chargé : non', () => {
    expect(peutGererCompta({ role: 'user' })).toBe(false)
    expect(peutGererCompta({ role: 'user', is_faiseur: true })).toBe(false)
    expect(peutGererCompta(null)).toBe(false)
  })
  it('un compte IADE reste exclu, même avec le drapeau', () => {
    expect(peutGererCompta({ role: 'user', is_compta: true, is_iade: true })).toBe(false)
  })
})
