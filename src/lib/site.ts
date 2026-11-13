/**
 * Identité du site et de son éditeur, affichées sur les pages publiques
 * (mentions légales, confidentialité, conditions d'utilisation).
 *
 * Les champs laissés vides s'affichent comme « en cours de publication » :
 * à remplir dès que la structure qui exploite le site est déclarée.
 */

/** Version de l'application (package.json), injectée par Vite. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''

/**
 * Version des conditions et de la politique de confidentialité (date de leur dernière
 * modification). La changer redemande son accord à chaque personne à sa prochaine visite.
 */
export const TERMS_VERSION = '2026-11-12'

export const SITE = {
  name: 'Jaksa',
  tagline: 'Planification et suivi de l’entraînement des coureurs par leur coach.',
  /** Adresse de contact (support et données personnelles). */
  contactEmail: (import.meta.env.VITE_CONTACT_EMAIL ?? '').trim(),
  /** Éditeur du site : nom ou raison sociale, forme juridique, adresse, SIRET, responsable de la publication. */
  publisher: {
    name: (import.meta.env.VITE_PUBLISHER_NAME ?? '').trim(),
    legalForm: (import.meta.env.VITE_PUBLISHER_LEGAL_FORM ?? '').trim(),
    address: (import.meta.env.VITE_PUBLISHER_ADDRESS ?? '').trim(),
    siret: (import.meta.env.VITE_PUBLISHER_SIRET ?? '').trim(),
    director: (import.meta.env.VITE_PUBLISHER_DIRECTOR ?? '').trim(),
  },
  /** Prestataires techniques (sous-traitants au sens du RGPD). */
  processors: [
    {
      name: 'Supabase',
      role: 'base de données et comptes',
      location: 'hébergés dans l’Union européenne',
      address: 'Supabase Inc., 970 Toa Payoh North #07-04, Singapour 318992',
    },
    {
      name: 'Cloudflare',
      role: 'hébergement des pages du site',
      location: 'aucune donnée personnelle n’y est stockée',
      address: 'Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, États-Unis',
    },
    {
      name: 'Brevo',
      role: 'envoi des e-mails',
      location: 'France ; les e-mails ne contiennent que des liens, jamais de données de santé',
      address: 'Sendinblue SAS (Brevo), 106 boulevard Haussmann, 75008 Paris',
    },
    {
      name: 'GitHub',
      role: 'sauvegarde quotidienne chiffrée de la base',
      location: 'conservée 30 jours',
      address: 'GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis',
    },
  ],
} as const

/** Date lisible d'une version des conditions (« 12 novembre 2026 »). */
export function formatTermsVersion(version: string): string {
  const date = new Date(`${version}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return version
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}
