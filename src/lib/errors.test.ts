import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors.ts'

describe('errorMessage', () => {
  it('traduit les erreurs de connexion Supabase', () => {
    expect(errorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'E-mail ou mot de passe incorrect.',
    )
  })

  it('traduit les erreurs des invitations', () => {
    expect(errorMessage({ code: 'RC004', message: 'Invitation expirée' })).toMatch(/expiré/)
    expect(errorMessage({ code: '42501', message: 'permission denied' })).toMatch(/pas le droit/)
  })

  it('reconnaît une coupure réseau', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toMatch(/connexion internet/)
    expect(errorMessage({ message: 'TypeError: Load failed' })).toMatch(/connexion internet/)
  })

  it('garde le détail des erreurs inconnues', () => {
    expect(errorMessage(new Error('boom'))).toBe('Une erreur est survenue : boom')
    expect(errorMessage(null)).toBe('Une erreur est survenue. Réessaie dans un instant.')
  })
})
