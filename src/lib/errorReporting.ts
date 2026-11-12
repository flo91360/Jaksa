/**
 * Journal des erreurs du site : une page qui plante laisse une trace dans la table
 * client_errors (lisible depuis le tableau de bord Supabase), sans outil externe.
 * Rien n'est envoyé sans session, et jamais le contenu des pages.
 */
import { APP_VERSION } from './site.ts'
import { supabase } from './supabase.ts'

const MAX_PER_VISIT = 5
const seen = new Set<string>()

/** Erreurs sans intérêt : coupure réseau, extension du navigateur, requête annulée. */
function isNoise(message: string): boolean {
  return /failed to fetch|networkerror|load failed|aborted|extension|ResizeObserver loop/i.test(message)
}

export function reportError(error: unknown, origin = '') {
  try {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    if (!message || isNoise(message) || seen.has(message) || seen.size >= MAX_PER_VISIT) return
    seen.add(message)
    const stack = error instanceof Error ? (error.stack ?? '') : ''
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return
      return supabase
        .rpc('report_client_error', {
          p_message: (origin ? `[${origin}] ` : '') + message,
          p_stack: stack,
          // Le chemin sans les paramètres : un lien d'invitation ou de mot de passe n'y figure jamais en entier.
          p_path: window.location.pathname.replace(/\/invitation\/.*/, '/invitation/…'),
          p_version: APP_VERSION,
          p_user_agent: navigator.userAgent,
        })
        .then(() => undefined)
    })
  } catch {
    // Le signalement ne doit jamais provoquer lui-même une erreur.
  }
}

/** Erreurs qui échappent à React : scripts, promesses sans gestion d'erreur. */
export function installErrorReporting() {
  window.addEventListener('error', (event) => reportError(event.error ?? event.message, 'window'))
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason, 'promesse'))
}
