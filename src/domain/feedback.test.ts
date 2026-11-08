import { describe, expect, it } from 'vitest'
import {
  type FeedbackDraft,
  describePain,
  draftToFeedback,
  feedbackToDraft,
  formatFeedback,
  maxPain,
  painLevel,
  validatePain,
} from './feedback.ts'

const draft = (patch: Partial<FeedbackDraft> = {}): FeedbackDraft => ({
  status: 'done',
  hours: '1',
  minutes: '5',
  km: '12,4',
  elevation: '150',
  rpe: 6,
  pain: [],
  ...patch,
})

describe('retour de séance', () => {
  it('convertit le formulaire', () => {
    expect(draftToFeedback(draft())).toEqual({
      feedback: { status: 'done', duration_s: 3900, distance_m: 12400, elevation_gain_m: 150, rpe: 6, pain: [] },
      errors: {},
    })
  })

  it('accepte une durée en minutes seulement (90 min) et des champs vides', () => {
    const { feedback } = draftToFeedback(draft({ hours: '', minutes: '90', km: '', elevation: '', rpe: null }))
    expect(feedback).toMatchObject({ duration_s: 5400, distance_m: null, elevation_gain_m: null, rpe: null })
  })

  it('signale les saisies invalides', () => {
    expect(draftToFeedback(draft({ minutes: '75' })).errors.duration).toBeDefined()
    expect(draftToFeedback(draft({ hours: '49', minutes: '' })).errors.duration).toBeDefined()
    expect(draftToFeedback(draft({ km: 'douze' })).errors.km).toBeDefined()
    expect(draftToFeedback(draft({ elevation: '-3' })).errors.elevation).toBeDefined()
    expect(draftToFeedback(draft({ rpe: 11 })).errors.rpe).toBeDefined()
  })

  it("une séance pas faite n'a ni durée, ni distance, ni RPE, mais garde les douleurs", () => {
    const pain = [{ location: 'knee' as const, side: 'left' as const, intensity: 5 }]
    expect(draftToFeedback(draft({ status: 'skipped', pain })).feedback).toEqual({
      status: 'skipped',
      duration_s: null,
      distance_m: null,
      elevation_gain_m: null,
      rpe: null,
      pain,
    })
  })

  it('pré-remplit avec les estimations de la séance prévue', () => {
    expect(feedbackToDraft(null, { seconds: 3000, meters: 10_250, complete: true })).toMatchObject({
      status: 'done',
      hours: '0',
      minutes: '50',
      km: '10,25',
      rpe: null,
    })
    expect(feedbackToDraft(null)).toMatchObject({ hours: '', minutes: '', km: '' })
  })

  it('préfère ce qu’a mesuré la montre à l’estimation', () => {
    const planned = { seconds: 3000, meters: 10_250, complete: true }
    const measured = { duration_s: 3125, distance_m: 10_215, elevation_gain_m: 85 }
    expect(feedbackToDraft(null, planned, measured)).toMatchObject({ hours: '0', minutes: '52', km: '10,22', elevation: '85' })
    // Un retour déjà saisi reste prioritaire.
    const feedback = {
      status: 'partial' as const,
      duration_s: 1800,
      distance_m: 6000,
      elevation_gain_m: null,
      rpe: 4,
      pain: [],
    }
    expect(feedbackToDraft(feedback, planned, measured)).toMatchObject({ minutes: '30', km: '6', elevation: '' })
  })

  it('relit un retour existant', () => {
    const feedback = { status: 'partial' as const, duration_s: 2700, distance_m: 8000, elevation_gain_m: null, rpe: 4, pain: [] }
    const back = draftToFeedback(feedbackToDraft(feedback, { seconds: 1, meters: 1, complete: true }))
    expect(back.feedback).toEqual(feedback)
  })

  it('résume le retour', () => {
    expect(
      formatFeedback({ status: 'done', duration_s: 3900, distance_m: 12400, elevation_gain_m: 150, rpe: 6, pain: [] }),
    ).toBe('Faite · 1 h 05 · 12,4 km · D+ 150 m · RPE 6')
    expect(formatFeedback({ status: 'skipped', duration_s: null, distance_m: null, elevation_gain_m: null, rpe: null, pain: [] })).toBe(
      'Pas faite',
    )
  })
})

describe('douleurs', () => {
  it('décrit et classe une douleur', () => {
    expect(describePain({ location: 'achilles', side: 'right', intensity: 7 })).toBe('Tendon d’Achille droite 7/10')
    expect(describePain({ location: 'lower_back', side: 'none', intensity: 2 })).toBe('Bas du dos 2/10')
    expect(maxPain([])).toBe(0)
    expect(maxPain([{ location: 'knee', side: 'left', intensity: 3 }, { location: 'hip', side: 'none', intensity: 6 }])).toBe(6)
    expect([0, 2, 5, 8].map(painLevel)).toEqual(['none', 'light', 'moderate', 'strong'])
  })

  it('refuse une intensité hors échelle et les doublons', () => {
    expect(validatePain([{ location: 'knee', side: 'left', intensity: 0 }])).not.toBeNull()
    expect(
      validatePain([
        { location: 'knee', side: 'left', intensity: 2 },
        { location: 'knee', side: 'left', intensity: 4 },
      ]),
    ).not.toBeNull()
    expect(validatePain([{ location: 'knee', side: 'left', intensity: 2 }, { location: 'knee', side: 'right', intensity: 4 }])).toBeNull()
  })
})
