import { describe, expect, it } from 'vitest'
import { formatPace, kmhToPace, paceToKmh, parsePace } from './pace.ts'

describe('parsePace', () => {
  it.each([
    ['4:30', 270],
    ["4'30", 270],
    ["4’30''", 270],
    ['4min30', 270],
    ['4 min 30 s', 270],
    [' 5:05 /km', 305],
    ['4', 240],
    ["4'", 240],
    ['12:00', 720],
  ])('lit « %s »', (input, expected) => {
    expect(parsePace(input)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '4:5', '4:75', '4:30:10', '-4:30', '0', '0:00'])('refuse « %s »', (input) => {
    expect(parsePace(input)).toBeNull()
  })
})

describe('formatPace', () => {
  it('formate en minutes:secondes', () => {
    expect(formatPace(270)).toBe('4:30')
    expect(formatPace(305)).toBe('5:05')
    expect(formatPace(59.6)).toBe('1:00')
    expect(formatPace(900)).toBe('15:00')
  })

  it('renvoie une chaîne vide sans allure', () => {
    expect(formatPace(null)).toBe('')
    expect(formatPace(undefined)).toBe('')
  })

  it('fait l’aller-retour avec parsePace', () => {
    for (const seconds of [180, 245, 299, 300, 427, 1200]) {
      expect(parsePace(formatPace(seconds))).toBe(seconds)
    }
  })
})

describe('allure et vitesse', () => {
  it('convertit dans les deux sens', () => {
    expect(paceToKmh(300)).toBe(12)
    expect(kmhToPace(12)).toBe(300)
    expect(kmhToPace(16.5)).toBe(218)
  })
})
