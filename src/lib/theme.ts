import { useSyncExternalStore } from 'react'
import {
  THEME_STORAGE_KEY,
  type ThemePreference,
  parseThemePreference,
  resolveTheme,
} from '../domain/theme.ts'

// Réglage du thème, partagé entre le bouton de l'en-tête et la page Compte.
// Le premier affichage est déjà au bon thème grâce au script de `index.html`.

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function readPreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

let preference = readPreference()

function apply() {
  const theme = resolveTheme(preference, darkQuery.matches)
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

function notify() {
  apply()
  for (const listener of listeners) listener()
}

darkQuery.addEventListener('change', notify)
// Réglage changé dans un autre onglet.
window.addEventListener('storage', (event) => {
  if (event.key !== THEME_STORAGE_KEY) return
  preference = parseThemePreference(event.newValue)
  notify()
})

export function setThemePreference(next: ThemePreference) {
  preference = next
  try {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // Stockage indisponible (navigation privée) : le réglage vaut pour cette visite.
  }
  notify()
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => preference,
  )
}
