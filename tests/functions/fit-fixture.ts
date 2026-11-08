// Fichier .FIT d'activité fictif, écrit avec le SDK officiel de Garmin : une séance de fractionné
// (échauffement, 6 × [3 min vite, 2 min récup], retour au calme), un enregistrement par seconde,
// un tour par étape, comme quand la montre suit la séance envoyée par le coach.
import { deflateRawSync } from 'node:zlib'
import { Decoder, Encoder, Profile, Stream } from '@garmin/fitsdk'
import type { DecodeFit, FitMessages } from '../../supabase/functions/_shared/garmin-detail.ts'

/** Même décodage que la fonction garmin-sync. */
export const decodeFit: DecodeFit = (bytes) => {
  const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)))
  if (!decoder.isFIT()) return null
  return decoder.read({ convertTypesToStrings: true, mergeHeartRates: true }).messages as FitMessages
}

export type FixtureStep = { seconds: number; pace: number; hr: number; intensity: 'warmup' | 'active' | 'recovery' | 'cooldown' }

export const FIXTURE_STEPS: FixtureStep[] = [
  { seconds: 900, pace: 340, hr: 136, intensity: 'warmup' },
  ...Array.from({ length: 6 }, (_, i) => [
    { seconds: 180, pace: 250 - (i % 2), hr: 166 + i, intensity: 'active' as const },
    { seconds: 120, pace: 375, hr: 148, intensity: 'recovery' as const },
  ]).flat(),
  { seconds: 600, pace: 350, hr: 140, intensity: 'cooldown' },
]

export const FIXTURE_START = new Date('2026-11-10T17:30:00Z')
const SEMICIRCLES = 2 ** 31 / 180

/** Une petite boucle d'un kilomètre environ, dans un parc imaginaire. */
function position(meters: number) {
  const angle = (meters / 1000) * 2 * Math.PI
  return { lat: 48.83 + 0.0014 * Math.sin(angle), lon: 2.43 + 0.0021 * Math.cos(angle) }
}

export function fixtureFit({ steps = FIXTURE_STEPS, start = FIXTURE_START, withGps = true } = {}): Uint8Array {
  const encoder = new Encoder()
  // Les messages sont écrits champ par champ, sous les noms du profil FIT.
  const write = (mesgNum: number, mesg: Record<string, unknown>) =>
    encoder.onMesg(mesgNum, mesg as Parameters<Encoder['onMesg']>[1])
  write(Profile.MesgNum.FILE_ID, {
    type: 'activity',
    manufacturer: 'development',
    product: 1,
    timeCreated: start,
    serialNumber: 1234,
  })
  let t = 0
  let distance = 0
  let ascent = 0
  let previousAltitude: number | null = null
  const laps: Record<string, unknown>[] = []
  let maxHr = 0
  let hrSum = 0
  for (const step of steps) {
    const lapStart = t
    const lapDistance = distance
    let lapHrSum = 0
    let lapMaxHr = 0
    let lapAscent = 0
    for (let s = 0; s < step.seconds; s++) {
      const speed = 1000 / step.pace
      distance += speed
      // Le cœur monte progressivement vers sa valeur de palier.
      const hr = Math.round(step.hr - (step.hr - 125) * Math.exp(-(s + 20) / 25) + Math.sin(t / 17) * 2)
      const altitude = 60 + 8 * Math.sin((distance / 1000) * 2 * Math.PI)
      if (previousAltitude !== null && altitude > previousAltitude) {
        ascent += altitude - previousAltitude
        lapAscent += altitude - previousAltitude
      }
      previousAltitude = altitude
      const { lat, lon } = position(distance)
      write(Profile.MesgNum.RECORD, {
        timestamp: new Date(start.getTime() + t * 1000),
        heartRate: hr,
        enhancedSpeed: speed,
        enhancedAltitude: altitude,
        distance,
        cadence: Math.round(step.pace < 300 ? 90 : 82),
        ...(withGps ? { positionLat: Math.round(lat * SEMICIRCLES), positionLong: Math.round(lon * SEMICIRCLES) } : {}),
      })
      lapHrSum += hr
      hrSum += hr
      lapMaxHr = Math.max(lapMaxHr, hr)
      maxHr = Math.max(maxHr, hr)
      t++
    }
    laps.push({
      timestamp: new Date(start.getTime() + t * 1000),
      startTime: new Date(start.getTime() + lapStart * 1000),
      totalElapsedTime: step.seconds,
      totalTimerTime: step.seconds,
      totalDistance: distance - lapDistance,
      avgHeartRate: Math.round(lapHrSum / step.seconds),
      maxHeartRate: lapMaxHr,
      enhancedAvgSpeed: (distance - lapDistance) / step.seconds,
      totalAscent: Math.round(lapAscent),
      avgCadence: step.pace < 300 ? 90 : 82,
      intensity: step.intensity,
      lapTrigger: 'time',
    })
  }
  for (const lap of laps) write(Profile.MesgNum.LAP, lap)
  write(Profile.MesgNum.SESSION, {
    timestamp: new Date(start.getTime() + t * 1000),
    startTime: start,
    sport: 'running',
    totalElapsedTime: t,
    totalTimerTime: t,
    totalDistance: distance,
    totalAscent: Math.round(ascent),
    totalDescent: Math.round(ascent),
    avgHeartRate: Math.round(hrSum / t),
    maxHeartRate: maxHr,
    enhancedAvgSpeed: distance / t,
    enhancedMaxSpeed: Math.max(...steps.map((step) => 1000 / step.pace)),
    avgCadence: 85,
    maxCadence: steps.some((step) => step.pace < 300) ? 92 : 84,
    totalCalories: 640,
    totalTrainingEffect: 3.8,
    totalAnaerobicTrainingEffect: 2.4,
    numLaps: laps.length,
  })
  return encoder.close()
}

/** Archive ZIP d'un seul fichier, comme celle que renvoie Garmin. */
export function zipOf(name: string, data: Uint8Array): Uint8Array {
  const compressed = deflateRawSync(data)
  const nameBytes = new TextEncoder().encode(name)
  const local = new Uint8Array(30 + nameBytes.length + compressed.length)
  const lv = new DataView(local.buffer)
  lv.setUint32(0, 0x04034b50, true)
  lv.setUint16(8, 8, true)
  lv.setUint32(18, compressed.length, true)
  lv.setUint32(22, data.length, true)
  lv.setUint16(26, nameBytes.length, true)
  local.set(nameBytes, 30)
  local.set(compressed, 30 + nameBytes.length)
  const central = new Uint8Array(46 + nameBytes.length)
  const cv = new DataView(central.buffer)
  cv.setUint32(0, 0x02014b50, true)
  cv.setUint16(10, 8, true)
  cv.setUint32(20, compressed.length, true)
  cv.setUint32(24, data.length, true)
  cv.setUint16(28, nameBytes.length, true)
  cv.setUint32(42, 0, true)
  central.set(nameBytes, 46)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, 1, true)
  ev.setUint16(10, 1, true)
  ev.setUint32(12, central.length, true)
  ev.setUint32(16, local.length, true)
  const zip = new Uint8Array(local.length + central.length + end.length)
  zip.set(local, 0)
  zip.set(central, local.length)
  zip.set(end, local.length + central.length)
  return zip
}
