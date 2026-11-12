import { describe, expect, it } from 'vitest'
import { copyWorkout, duplicateWeek, formatRaceDetails, groupByDate, nextPosition, nextRace } from './planning.ts'
import { STEP_PRESETS } from './workouts.ts'

const base = { kind: 'run' as const, description: '', steps: [STEP_PRESETS.warmup()] }
const workouts = [
  { ...base, athlete_id: 'lea', scheduled_on: '2026-11-10', position: 0, title: 'VMA' },
  { ...base, athlete_id: 'lea', scheduled_on: '2026-11-10', position: 1, title: 'Renfo' },
  { ...base, athlete_id: 'lea', scheduled_on: '2026-11-15', position: 0, title: 'Sortie longue' },
  { ...base, athlete_id: 'lea', scheduled_on: '2026-11-17', position: 0, title: 'Déjà prévue' },
  { ...base, athlete_id: 'paul', scheduled_on: '2026-11-12', position: 0, title: 'Seuil' },
]

describe('planification', () => {
  it('place une nouvelle séance après celles du jour', () => {
    expect(nextPosition(workouts, 'lea', '2026-11-10')).toBe(2)
    expect(nextPosition(workouts, 'lea', '2026-11-11')).toBe(0)
    expect(nextPosition(workouts, 'paul', '2026-11-10')).toBe(0)
  })

  it('copie une séance vers un autre athlète sans partager les étapes', () => {
    const copy = copyWorkout(workouts[0], { athleteId: 'paul', date: '2026-11-12' }, workouts)
    expect(copy).toMatchObject({ athlete_id: 'paul', scheduled_on: '2026-11-12', position: 1, title: 'VMA' })
    expect(copy.steps).toEqual(workouts[0].steps)
    expect(copy.steps).not.toBe(workouts[0].steps)
    expect(copy).not.toHaveProperty('id')
  })

  it('duplique une semaine jour pour jour, après les séances déjà prévues', () => {
    const drafts = duplicateWeek(workouts, 'lea', '2026-11-11', '2026-11-18')
    expect(drafts.map((d) => [d.scheduled_on, d.position, d.title])).toEqual([
      ['2026-11-17', 1, 'VMA'],
      ['2026-11-17', 2, 'Renfo'],
      ['2026-11-22', 0, 'Sortie longue'],
    ])
    expect(duplicateWeek(workouts, 'lea', '2026-11-11', '2026-11-13')).toEqual([])
  })

  it('regroupe par jour en respectant l’ordre', () => {
    const shuffled = [workouts[1], workouts[2], workouts[0]]
    const byDay = groupByDate(shuffled, (w) => w.scheduled_on)
    expect(byDay.get('2026-11-10')?.map((w) => w.title)).toEqual(['VMA', 'Renfo'])
    expect(byDay.get('2026-11-15')).toHaveLength(1)
  })

  it('trouve la prochaine course', () => {
    const races = [
      { race_on: '2026-10-01', name: 'Passée' },
      { race_on: '2027-04-11', name: 'Marathon' },
      { race_on: '2026-12-06', name: 'Semi' },
    ]
    expect(nextRace(races, '2026-11-08')?.name).toBe('Semi')
    expect(nextRace(races, '2027-05-01')).toBeNull()
  })

  it('décrit une course', () => {
    expect(formatRaceDetails({ distance_km: 42.195, elevation_gain_m: 120 })).toBe('42,195 km · 120 m D+')
    expect(formatRaceDetails({ distance_km: null, elevation_gain_m: 2500 })).toBe('2 500 m D+')
    expect(formatRaceDetails({ distance_km: null, elevation_gain_m: null })).toBe('')
  })
})

describe('séances souples', () => {
  it('une copie reste souple, une séance à jour fixe ne le devient pas', async () => {
    const { copyWorkout } = await import('./planning.ts')
    const content = { kind: 'run' as const, title: '10 × 400 m', description: '', steps: [] }
    const target = { athleteId: 'a', date: '2026-11-18' }
    expect(copyWorkout({ ...content, flexible: true }, target, [])).toMatchObject({ flexible: true, scheduled_on: '2026-11-18' })
    expect(copyWorkout({ ...content, flexible: false }, target, [])).not.toHaveProperty('flexible')
    expect(copyWorkout(content, target, [])).not.toHaveProperty('flexible')
  })
})
