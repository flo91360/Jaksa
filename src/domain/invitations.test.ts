import { describe, expect, it } from 'vitest'
import { invitationPath, pendingInvitations } from './invitations.ts'

const now = new Date('2026-11-08T12:00:00Z')
const base = { accepted_at: null, revoked_at: null, expires_at: '2026-11-20T12:00:00Z' }

describe('pendingInvitations', () => {
  it('garde seulement les invitations encore utilisables', () => {
    const invitations = [
      { id: 'ok', ...base },
      { id: 'acceptee', ...base, accepted_at: '2026-11-07T12:00:00Z' },
      { id: 'annulee', ...base, revoked_at: '2026-11-07T12:00:00Z' },
      { id: 'expiree', ...base, expires_at: '2026-11-08T11:59:59Z' },
    ]
    expect(pendingInvitations(invitations, now).map((invitation) => invitation.id)).toEqual(['ok'])
  })
})

describe('invitationPath', () => {
  it('construit le lien à envoyer', () => {
    expect(invitationPath('abc123')).toBe('/invitation/abc123')
  })
})
