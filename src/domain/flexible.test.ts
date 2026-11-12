import { describe, expect, it } from 'vitest'
import {
  type WeekFeedback,
  type WeekWorkout,
  datedWorkouts,
  describeRemaining,
  formatTarget,
  isUnplaced,
  parseTarget,
  sessionState,
  volumeBar,
  weekRange,
  weekSummary,
  workoutDayLabel,
} from './flexible.ts'

const workout = (id: string, patch: Partial<WeekWorkout> = {}): WeekWorkout => ({
  id,
  kind: 'run',
  title: `Séance ${id}`,
  scheduled_on: '2026-11-09',
  flexible: true,
  placed_at: null,
  ...patch,
})

const feedback = (entries: Record<string, WeekFeedback>) => new Map(Object.entries(entries))

describe('weekRange', () => {
  it('va du lundi au dimanche', () => {
    expect(weekRange('2026-11-12')).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(weekRange('2026-11-15')).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(weekRange('2026-11-16')).toEqual({ from: '2026-11-16', to: '2026-11-22' })
  })
})

describe('séances souples', () => {
  it('une séance souple sans jour choisi est « à placer »', () => {
    expect(isUnplaced(workout('a'))).toBe(true)
    expect(isUnplaced(workout('a', { placed_at: '2026-11-10T08:00:00Z' }))).toBe(false)
    expect(isUnplaced(workout('a', { flexible: false }))).toBe(false)
  })

  it('le calendrier ne montre à leur date que les séances placées ou à jour fixe', () => {
    const list = [workout('a'), workout('b', { placed_at: '2026-11-10T08:00:00Z' }), workout('c', { flexible: false })]
    expect(datedWorkouts(list).map((w) => w.id)).toEqual(['b', 'c'])
  })

  it('affiche le jour choisi, ou la semaine tant que le jour n’est pas choisi', () => {
    expect(workoutDayLabel(workout('a'))).toBe('À faire dans la semaine du 9 – 15 nov. 2026')
    expect(workoutDayLabel(workout('a', { scheduled_on: '2026-11-12', placed_at: '2026-11-10T08:00:00Z' }))).toBe('Jeudi 12 novembre')
    expect(workoutDayLabel(workout('a', { flexible: false }))).toBe('Lundi 9 novembre')
  })

  it('le retour de l’athlète prime sur la montre', () => {
    expect(sessionState(undefined, false)).toBe('todo')
    expect(sessionState(undefined, true)).toBe('done')
    expect(sessionState({ status: 'skipped', distance_m: null }, true)).toBe('skipped')
    expect(sessionState({ status: 'partial', distance_m: 5000 }, false)).toBe('partial')
  })
})

describe('weekSummary', () => {
  const base = { week: '2026-11-11', target: { km_min: 35, km_max: 45 }, workouts: [], feedback: new Map(), watch: [], runs: [] }

  it('semaine vide : tout reste à faire', () => {
    const summary = weekSummary(base)
    expect(summary).toMatchObject({ doneKm: 0, remaining: { min: 35, max: 45 }, volume: 'below', todo: 0, done: 0 })
    expect(describeRemaining(summary)).toBe('Il te reste entre 35 et 45 km à courir.')
    expect(describeRemaining(summary, false)).toBe('Il reste entre 35 et 45 km à courir.')
  })

  it('additionne montre, sorties déclarées et retours, sans compter deux fois une séance suivie par la montre', () => {
    const summary = weekSummary({
      ...base,
      workouts: [
        workout('frac', { scheduled_on: '2026-11-10', placed_at: '2026-11-10T07:00:00Z' }),
        workout('seuil', { scheduled_on: '2026-11-12', placed_at: '2026-11-12T07:00:00Z' }),
        workout('renfo', { kind: 'strength' }),
      ],
      feedback: feedback({
        // Suivie par la montre : la distance du retour n'est pas ajoutée à celle de l'activité.
        frac: { status: 'done', distance_m: 9000 },
        // Sans montre : la distance du retour compte.
        seuil: { status: 'done', distance_m: 11000 },
        // Renfo : pas de kilomètres de course.
        renfo: { status: 'done', distance_m: 2000 },
      }),
      watch: [
        { workout_id: 'frac', local_date: '2026-11-10', activity_type: 'running', distance_m: 9200 },
        { workout_id: null, local_date: '2026-11-11', activity_type: 'trail_running', distance_m: 6300 },
        // Vélo : ne compte pas. Semaine suivante : ne compte pas.
        { workout_id: null, local_date: '2026-11-13', activity_type: 'cycling', distance_m: 40000 },
        { workout_id: null, local_date: '2026-11-16', activity_type: 'running', distance_m: 10000 },
      ],
      runs: [
        { run_on: '2026-11-14', distance_m: 5000 },
        { run_on: '2026-11-08', distance_m: 8000 },
      ],
    })
    expect(summary.sources).toEqual({ watchKm: 15.5, declaredKm: 5, feedbackKm: 11 })
    expect(summary.doneKm).toBe(31.5)
    expect(summary.remaining).toEqual({ min: 3.5, max: 13.5 })
    expect(summary.volume).toBe('below')
    expect(describeRemaining(summary)).toBe('Il te reste entre 3,5 et 13,5 km à courir.')
  })

  it('une sortie enregistrée par la montre le jour de la séance n’est pas recomptée avec le retour', () => {
    // Séance souple faite avant d'avoir choisi son jour : l'activité de la montre n'y est pas rattachée.
    const summary = weekSummary({
      ...base,
      workouts: [workout('frac', { scheduled_on: '2026-11-11', placed_at: '2026-11-11T19:00:00Z' })],
      feedback: feedback({ frac: { status: 'done', distance_m: 9000 } }),
      watch: [{ workout_id: null, local_date: '2026-11-11', activity_type: 'running', distance_m: 9200 }],
      runs: [],
    })
    expect(summary.sources).toEqual({ watchKm: 9.2, declaredKm: 0, feedbackKm: 0 })
    expect(summary.done).toBe(1)
  })

  it('classe les séances : à faire d’abord, puis faites, par jour', () => {
    const summary = weekSummary({
      ...base,
      workouts: [
        workout('faite', { scheduled_on: '2026-11-10', placed_at: '2026-11-10T07:00:00Z' }),
        workout('a-placer'),
        workout('prevue', { scheduled_on: '2026-11-13', placed_at: '2026-11-11T07:00:00Z' }),
        workout('sautee', { scheduled_on: '2026-11-11', placed_at: '2026-11-11T07:00:00Z' }),
        workout('fixe', { flexible: false, scheduled_on: '2026-11-12' }),
        workout('repos', { kind: 'rest' }),
        workout('autre-semaine', { scheduled_on: '2026-11-16' }),
      ],
      feedback: feedback({ faite: { status: 'done', distance_m: 8000 }, sautee: { status: 'skipped', distance_m: null } }),
    })
    expect(summary.sessions.map((s) => [s.workout.id, s.state, s.day])).toEqual([
      ['prevue', 'todo', '2026-11-13'],
      ['a-placer', 'todo', null],
      ['faite', 'done', '2026-11-10'],
      ['sautee', 'skipped', '2026-11-11'],
    ])
    expect(summary).toMatchObject({ todo: 2, done: 1 })
  })

  it('dans la fourchette, puis au-dessus', () => {
    const within = weekSummary({ ...base, runs: [{ run_on: '2026-11-10', distance_m: 38000 }] })
    expect(within).toMatchObject({ volume: 'within', remaining: { min: 0, max: 7 } })
    expect(describeRemaining(within)).toBe('Objectif atteint. Tu peux encore ajouter jusqu’à 7 km.')
    const top = weekSummary({ ...base, runs: [{ run_on: '2026-11-10', distance_m: 45000 }] })
    expect(describeRemaining(top)).toBe('Objectif atteint, en haut de la fourchette.')
    const above = weekSummary({ ...base, runs: [{ run_on: '2026-11-10', distance_m: 52300 }] })
    expect(above).toMatchObject({ volume: 'above', remaining: { min: 0, max: 0 } })
    expect(describeRemaining(above)).toBe('Fourchette dépassée de 7,3 km.')
  })

  it('sans volume fixé : les séances seulement', () => {
    const summary = weekSummary({ ...base, target: null, workouts: [workout('a')] })
    expect(summary).toMatchObject({ volume: 'none', remaining: null, todo: 1 })
    expect(describeRemaining(summary)).toBe('')
    expect(volumeBar(summary)).toBeNull()
  })

  it('un volume exact (min = max) se dit sans fourchette', () => {
    const summary = weekSummary({ ...base, target: { km_min: 40, km_max: 40 }, runs: [{ run_on: '2026-11-10', distance_m: 10000 }] })
    expect(describeRemaining(summary)).toBe('Il te reste 30 km à courir.')
    expect(formatTarget({ km_min: 40, km_max: 40 })).toBe('40 km')
    expect(formatTarget({ km_min: 35, km_max: 45.5 })).toBe('35 à 45,5 km')
  })
})

describe('volumeBar', () => {
  it('place le volume fait et la fourchette sur la même échelle', () => {
    const summary = weekSummary({
      week: '2026-11-11',
      target: { km_min: 30, km_max: 40 },
      workouts: [],
      feedback: new Map(),
      watch: [],
      runs: [{ run_on: '2026-11-10', distance_m: 23000 }],
    })
    // Échelle : 40 × 1,15 = 46 km.
    expect(volumeBar(summary)).toEqual({ done: 50, from: 65.2, to: 87 })
  })

  it('ne dépasse jamais 100 %', () => {
    const summary = weekSummary({
      week: '2026-11-11',
      target: { km_min: 30, km_max: 40 },
      workouts: [],
      feedback: new Map(),
      watch: [],
      runs: [{ run_on: '2026-11-10', distance_m: 80000 }],
    })
    expect(volumeBar(summary)).toEqual({ done: 100, from: 37.5, to: 50 })
  })
})

describe('parseTarget', () => {
  it('lit une fourchette, avec virgule ou point', () => {
    expect(parseTarget({ min: '35', max: '45,5' })).toEqual({ target: { km_min: 35, km_max: 45.5 }, error: null })
  })

  it('un seul champ vaut pour les deux bornes ; aucun champ : pas de volume', () => {
    expect(parseTarget({ min: '', max: '40' }).target).toEqual({ km_min: 40, km_max: 40 })
    expect(parseTarget({ min: '40', max: ' ' }).target).toEqual({ km_min: 40, km_max: 40 })
    expect(parseTarget({ min: '', max: '' })).toEqual({ target: null, error: null })
  })

  it('refuse les valeurs incohérentes', () => {
    expect(parseTarget({ min: '50', max: '40' }).error).toBe('Le minimum dépasse le maximum.')
    expect(parseTarget({ min: 'beaucoup', max: '40' }).error).toBe('Indique des kilomètres en chiffres.')
    expect(parseTarget({ min: '0', max: '0' }).error).toBe('Le volume doit être compris entre 0 et 500 km.')
    expect(parseTarget({ min: '10', max: '900' }).error).toBe('Le volume doit être compris entre 0 et 500 km.')
  })
})
