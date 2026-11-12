interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Adresse publique du site (liens d'invitation) quand elle diffère de l'origine : application mobile. */
  readonly VITE_SITE_URL?: string
  /** Coordonnées affichées sur les pages légales : voir src/lib/site.ts et docs/DEPLOIEMENT.md. */
  readonly VITE_CONTACT_EMAIL?: string
  readonly VITE_PUBLISHER_NAME?: string
  readonly VITE_PUBLISHER_LEGAL_FORM?: string
  readonly VITE_PUBLISHER_ADDRESS?: string
  readonly VITE_PUBLISHER_SIRET?: string
  readonly VITE_PUBLISHER_DIRECTOR?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Version de package.json, injectée par vite.config.ts. */
declare const __APP_VERSION__: string
