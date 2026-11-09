// Thème de l'interface : clair, sombre, ou celui du système (par défaut).

export type ThemePreference = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

/** Clé du stockage local ; aussi lue par le script de `index.html` avant le premier affichage. */
export const THEME_STORAGE_KEY = 'rob1coach-theme'

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

/** Ordre du bouton : système → clair → sombre → système. */
export function nextThemePreference(preference: ThemePreference): ThemePreference {
  return preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system'
}

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'Thème du système',
  light: 'Thème clair',
  dark: 'Thème sombre',
}
