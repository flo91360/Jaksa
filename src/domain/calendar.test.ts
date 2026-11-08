import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  daysBetween,
  formatLongDay,
  formatMonth,
  formatRelativeDays,
  formatWeekRange,
  isIsoDate,
  monthWeeks,
  shiftView,
  startOfWeek,
  todayIso,
  visibleRange,
  weekDays,
  weekdayIndex,
} from './calendar.ts'

describe('calendrier', () => {
  it('additionne des jours, y compris au passage à l’heure d’hiver et en fin d’année', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(daysBetween('2026-11-08', '2026-11-15')).toBe(7)
  })

  it('les semaines commencent le lundi', () => {
    expect(weekdayIndex('2026-11-09')).toBe(0) // lundi
    expect(weekdayIndex('2026-11-08')).toBe(6) // dimanche
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02')
    expect(weekDays('2026-11-11')).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ])
  })

  it('découpe un mois en semaines complètes', () => {
    const weeks = monthWeeks('2026-11-20')
    expect(weeks).toHaveLength(6)
    expect(weeks[0][0]).toBe('2026-10-26')
    expect(weeks[5][6]).toBe('2026-12-06')
    expect(monthWeeks('2027-02-10')).toHaveLength(4) // février 2027 commence un lundi
    expect(visibleRange('month', '2026-11-20')).toEqual({ from: '2026-10-26', to: '2026-12-06' })
    expect(visibleRange('week', '2026-11-20')).toEqual({ from: '2026-11-16', to: '2026-11-22' })
  })

  it('avance d’une semaine ou d’un mois', () => {
    expect(shiftView('week', '2026-11-11', 1)).toBe('2026-11-16')
    expect(shiftView('month', '2026-01-31', 1)).toBe('2026-02-01')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01')
  })

  it('formate en français', () => {
    expect(formatLongDay('2026-11-10')).toBe('Mardi 10 novembre')
    expect(formatMonth('2026-11-10')).toBe('Novembre 2026')
    expect(formatWeekRange('2026-11-10')).toBe('9 – 15 nov. 2026')
    expect(formatWeekRange('2026-12-01')).toBe('30 nov. – 6 déc. 2026')
    expect(formatRelativeDays('2026-11-08', '2026-11-08')).toBe('aujourd’hui')
    expect(formatRelativeDays('2026-11-08', '2026-11-09')).toBe('demain')
    expect(formatRelativeDays('2026-11-08', '2027-04-11')).toBe('dans 154 jours')
  })

  it('valide et produit des dates AAAA-MM-JJ', () => {
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('10/11/2026')).toBe(false)
    expect(todayIso(new Date(2026, 10, 8, 23, 30))).toBe('2026-11-08')
  })
})
