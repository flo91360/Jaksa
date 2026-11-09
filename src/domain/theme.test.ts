import { describe, expect, it } from 'vitest'
import { nextThemePreference, parseThemePreference, resolveTheme } from './theme.ts'

describe('thème', () => {
  it('suit le système par défaut ou pour une valeur inconnue', () => {
    expect(parseThemePreference(null)).toBe('system')
    expect(parseThemePreference('bleu')).toBe('system')
    expect(parseThemePreference('dark')).toBe('dark')
    expect(parseThemePreference('light')).toBe('light')
  })

  it('applique le réglage du système seulement en mode système', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('fait le tour des trois réglages', () => {
    expect(nextThemePreference('system')).toBe('light')
    expect(nextThemePreference('light')).toBe('dark')
    expect(nextThemePreference('dark')).toBe('system')
  })
})
