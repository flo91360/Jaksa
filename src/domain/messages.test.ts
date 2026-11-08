import { describe, expect, it } from 'vitest'
import { cleanBody, formatDayLabel, groupByDay } from './messages.ts'

describe('messagerie', () => {
  it('regroupe les messages par jour local', () => {
    const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).toISOString()
    const groups = groupByDay([
      { id: 1, created_at: at(8, 9) },
      { id: 2, created_at: at(8, 23) },
      { id: 3, created_at: at(10, 7) },
    ])
    expect(groups.map((g) => [g.day, g.items.map((i) => i.id)])).toEqual([
      ['2026-11-08', [1, 2]],
      ['2026-11-10', [3]],
    ])
  })

  it('nomme les jours proches', () => {
    expect(formatDayLabel('2026-11-08', '2026-11-08')).toBe('Aujourd’hui')
    expect(formatDayLabel('2026-11-07', '2026-11-08')).toBe('Hier')
    expect(formatDayLabel('2026-11-03', '2026-11-08')).toMatch(/3 novembre/)
  })

  it('refuse un message vide ou trop long', () => {
    expect(cleanBody('  Salut  ', 10)).toBe('Salut')
    expect(cleanBody('   ', 10)).toBeNull()
    expect(cleanBody('x'.repeat(11), 10)).toBeNull()
  })
})
