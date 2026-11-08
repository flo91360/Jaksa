/** Messages d'erreur en français pour les erreurs Supabase (auth, base, réseau). */

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou mot de passe incorrect.',
  email_not_confirmed: 'Adresse e-mail pas encore confirmée : clique sur le lien reçu par e-mail.',
  user_already_exists: 'Un compte existe déjà avec cet e-mail : connecte-toi.',
  email_exists: 'Un compte existe déjà avec cet e-mail : connecte-toi.',
  weak_password: 'Mot de passe trop faible : au moins 8 caractères, avec des lettres et des chiffres.',
  same_password: 'Le nouveau mot de passe doit être différent de l’ancien.',
  over_email_send_rate_limit: 'Trop d’e-mails envoyés : réessaie dans quelques minutes.',
  over_request_rate_limit: 'Trop de tentatives : réessaie dans quelques minutes.',
  signup_disabled: 'Les inscriptions sont fermées pour le moment.',
  email_address_invalid: 'Adresse e-mail invalide.',
  session_not_found: 'Session expirée : reconnecte-toi.',
  user_not_found: 'Compte introuvable.',
}

const DATABASE_MESSAGES: Record<string, string> = {
  RC001: 'Ce lien d’invitation n’existe pas. Vérifie qu’il est complet.',
  RC002: 'Ton coach a annulé cette invitation. Demande-lui un nouveau lien.',
  RC003: 'Cette invitation a déjà été utilisée. Demande un nouveau lien à ton coach.',
  RC004: 'Cette invitation a expiré. Demande un nouveau lien à ton coach.',
  RC005: 'Tu es connecté avec un compte coach : il ne peut pas rejoindre un autre coach.',
  RC006: 'Connecte-toi pour accepter cette invitation.',
  '42501': 'Tu n’as pas le droit de faire cette modification.',
  '23514': 'Valeur refusée : vérifie les champs saisis.',
  PGRST116: 'Élément introuvable.',
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    const known = AUTH_MESSAGES[error.code] ?? DATABASE_MESSAGES[error.code]
    if (known) return known
  }
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return 'Connexion impossible : vérifie ta connexion internet.'
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
      return 'Connexion impossible : vérifie ta connexion internet.'
    }
    if (error.message) return `Une erreur est survenue : ${error.message}`
  }
  return 'Une erreur est survenue. Réessaie dans un instant.'
}
