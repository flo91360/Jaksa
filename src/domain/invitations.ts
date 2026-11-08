/** Champs d'une invitation utiles pour savoir si elle est encore utilisable. */
type InvitationState = {
  accepted_at: string | null
  revoked_at: string | null
  expires_at: string
}

/** Invitations encore utilisables : ni acceptées, ni annulées, ni expirées. */
export function pendingInvitations<T extends InvitationState>(invitations: T[], now = new Date()): T[] {
  return invitations.filter(
    (invitation) =>
      invitation.accepted_at === null && invitation.revoked_at === null && new Date(invitation.expires_at) > now,
  )
}

/** Chemin de la page d'arrivée d'un athlète invité. */
export function invitationPath(token: string): string {
  return `/invitation/${encodeURIComponent(token)}`
}
