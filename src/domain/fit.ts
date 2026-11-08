import { STEP_KINDS, type WorkoutItem, type WorkoutKind, type WorkoutStep, describeTargetValues, resolveTarget } from './workouts.ts'
import type { HrZone } from './zones.ts'

/**
 * Export d'une séance au format FIT (fichier « workout » de Garmin), à copier
 * dans le dossier GARMIN/NewFiles de la montre branchée en USB.
 *
 * Encodeur écrit à la main d'après la description publique du protocole FIT :
 * en-tête de 14 octets, messages file_id (0), workout (26) et workout_step
 * (27), puis CRC. Les tests le relisent avec le SDK officiel de Garmin.
 */

/** Ce que la montre affiche pour une cible en zone : l'allure ou la FC. */
export type ZoneTargetMode = 'pace' | 'hr'

export type FitWorkout = {
  title: string
  kind: WorkoutKind
  steps: WorkoutItem[]
}

// Types de base FIT.
const ENUM = 0x00
const UINT16 = 0x84
const UINT32 = 0x86
const UINT32Z = 0x8c
const STRING = 0x07

const INVALID_ENUM = 0xff
const INVALID_UINT32 = 0xffffffff

// Messages et valeurs du profil FIT.
const MESG_FILE_ID = 0
const MESG_WORKOUT = 26
const MESG_WORKOUT_STEP = 27
const FILE_TYPE_WORKOUT = 5
const MANUFACTURER_DEVELOPMENT = 255
const SPORT = { running: 1, training: 10, generic: 0 }
const SUB_SPORT = { generic: 0, trail: 3, strength: 20 }
const DURATION = { time: 0, distance: 1, open: 5, repeatUntilStepsComplete: 6 }
const TARGET = { speed: 0, heartRate: 1, open: 2 }
const INTENSITY: Record<WorkoutStep['kind'], number> = {
  active: 0,
  rest: 1,
  warmup: 2,
  cooldown: 3,
  recovery: 4,
}

/** Secondes entre l'époque Unix et l'époque FIT (31 décembre 1989, 00:00 UTC). */
const FIT_EPOCH_OFFSET = 631_065_600

const NAME_BYTES = { workout: 32, step: 16, notes: 64 }

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01,
  0x8801, 0x4400,
]

export function fitCrc(bytes: Uint8Array, crc = 0): number {
  for (const byte of bytes) {
    let tmp = CRC_TABLE[crc & 0xf]
    crc = (crc >> 4) & 0x0fff
    crc = crc ^ tmp ^ CRC_TABLE[byte & 0xf]
    tmp = CRC_TABLE[crc & 0xf]
    crc = (crc >> 4) & 0x0fff
    crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xf]
  }
  return crc
}

/** Texte UTF-8 tronqué sans couper un caractère, complété de zéros. */
function fixedString(text: string, size: number): Uint8Array {
  const out = new Uint8Array(size)
  const encoder = new TextEncoder()
  let used = 0
  for (const char of text) {
    const bytes = encoder.encode(char)
    if (used + bytes.length > size - 1) break
    out.set(bytes, used)
    used += bytes.length
  }
  return out
}

type FieldDef = { num: number; size: number; baseType: number }
type FieldValue = number | Uint8Array

class FitWriter {
  private chunks: number[] = []

  private u8(value: number) {
    this.chunks.push(value & 0xff)
  }

  private u16(value: number) {
    this.u8(value)
    this.u8(value >>> 8)
  }

  private u32(value: number) {
    this.u16(value & 0xffff)
    this.u16(value >>> 16)
  }

  define(local: number, global: number, fields: FieldDef[]) {
    this.u8(0x40 | local)
    this.u8(0) // réservé
    this.u8(0) // petit-boutiste
    this.u16(global)
    this.u8(fields.length)
    for (const field of fields) {
      this.u8(field.num)
      this.u8(field.size)
      this.u8(field.baseType)
    }
  }

  data(local: number, fields: FieldDef[], values: FieldValue[]) {
    this.u8(local)
    fields.forEach((field, index) => {
      const value = values[index]
      if (value instanceof Uint8Array) {
        for (const byte of value) this.u8(byte)
      } else if (field.size === 1) this.u8(value)
      else if (field.size === 2) this.u16(value)
      else this.u32(value)
    })
  }

  /** Fichier complet : en-tête + messages + CRC. */
  toFile(): Uint8Array {
    const data = Uint8Array.from(this.chunks)
    const header = new Uint8Array(14)
    const view = new DataView(header.buffer)
    view.setUint8(0, 14)
    view.setUint8(1, 0x10) // protocole 1.0
    view.setUint16(2, 2100, true) // profil 21.00
    view.setUint32(4, data.length, true)
    header.set([0x2e, 0x46, 0x49, 0x54], 8) // « .FIT »
    view.setUint16(12, fitCrc(header.subarray(0, 12)), true)

    const file = new Uint8Array(14 + data.length + 2)
    file.set(header, 0)
    file.set(data, 14)
    const crc = fitCrc(file.subarray(0, 14 + data.length))
    file[file.length - 2] = crc & 0xff
    file[file.length - 1] = crc >>> 8
    return file
  }
}

const FILE_ID_FIELDS: FieldDef[] = [
  { num: 0, size: 1, baseType: ENUM }, // type
  { num: 1, size: 2, baseType: UINT16 }, // manufacturer
  { num: 2, size: 2, baseType: UINT16 }, // product
  { num: 3, size: 4, baseType: UINT32Z }, // serial_number
  { num: 4, size: 4, baseType: UINT32 }, // time_created
]

const WORKOUT_FIELDS: FieldDef[] = [
  { num: 4, size: 1, baseType: ENUM }, // sport
  { num: 11, size: 1, baseType: ENUM }, // sub_sport
  { num: 6, size: 2, baseType: UINT16 }, // num_valid_steps
  { num: 8, size: NAME_BYTES.workout, baseType: STRING }, // wkt_name
]

const STEP_FIELDS: FieldDef[] = [
  { num: 254, size: 2, baseType: UINT16 }, // message_index
  { num: 0, size: NAME_BYTES.step, baseType: STRING }, // wkt_step_name
  { num: 1, size: 1, baseType: ENUM }, // duration_type
  { num: 2, size: 4, baseType: UINT32 }, // duration_value
  { num: 3, size: 1, baseType: ENUM }, // target_type
  { num: 4, size: 4, baseType: UINT32 }, // target_value
  { num: 5, size: 4, baseType: UINT32 }, // custom_target_value_low
  { num: 6, size: 4, baseType: UINT32 }, // custom_target_value_high
  { num: 7, size: 1, baseType: ENUM }, // intensity
  { num: 8, size: NAME_BYTES.notes, baseType: STRING }, // notes
]

function sportOf(kind: WorkoutKind): [number, number] {
  switch (kind) {
    case 'run':
      return [SPORT.running, SUB_SPORT.generic]
    case 'trail':
      return [SPORT.running, SUB_SPORT.trail]
    case 'strength':
      return [SPORT.training, SUB_SPORT.strength]
    default:
      return [SPORT.generic, SUB_SPORT.generic]
  }
}

/** Allure (s/km) → vitesse FIT (mm/s). */
const paceToFitSpeed = (secondsPerKm: number) => Math.round(1_000_000 / secondsPerKm)

type Target = { type: number; value: number; low: number; high: number }

function stepTarget(step: WorkoutStep, zones: HrZone[], mode: ZoneTargetMode): Target {
  const open: Target = { type: TARGET.open, value: 0, low: INVALID_UINT32, high: INVALID_UINT32 }
  const resolved = resolveTarget(step.target, zones)
  const hasPace = resolved.paceFast !== null && resolved.paceSlow !== null
  const hasHr = resolved.hrMin !== null && resolved.hrMax !== null
  const pace = (): Target => ({
    type: TARGET.speed,
    value: 0,
    // Bas = vitesse la plus lente.
    low: paceToFitSpeed(resolved.paceSlow as number),
    high: paceToFitSpeed(resolved.paceFast as number),
  })
  // FC personnalisée : bpm + 100 (0-100 est réservé aux pourcentages).
  const hr = (): Target => ({
    type: TARGET.heartRate,
    value: 0,
    low: (resolved.hrMin as number) + 100,
    high: (resolved.hrMax as number) + 100,
  })

  switch (step.target.type) {
    case 'none':
      return open
    case 'pace':
      return pace()
    case 'hr':
      return hr()
    case 'zone':
      if (mode === 'pace') return hasPace ? pace() : hasHr ? hr() : open
      return hasHr ? hr() : hasPace ? pace() : open
  }
}

function stepNotes(step: WorkoutStep, zones: HrZone[]): string {
  const resolved = resolveTarget(step.target, zones)
  const target = step.target.type === 'zone' ? [resolved.label, describeTargetValues(resolved)] : []
  return [...target, step.note.trim()].filter(Boolean).join(' · ')
}

/** Encode une séance en fichier FIT. */
export function encodeWorkoutFit(
  workout: FitWorkout,
  zones: HrZone[],
  options: { mode?: ZoneTargetMode; now?: Date } = {},
): Uint8Array {
  const mode = options.mode ?? 'pace'
  const now = options.now ?? new Date()
  const writer = new FitWriter()

  type Row = FieldValue[]
  const rows: Row[] = []
  const addStep = (step: WorkoutStep) => {
    const target = stepTarget(step, zones, mode)
    let durationType: number
    let durationValue: number
    switch (step.duration.type) {
      case 'time':
        durationType = DURATION.time
        durationValue = step.duration.seconds * 1000
        break
      case 'distance':
        durationType = DURATION.distance
        durationValue = step.duration.meters * 100
        break
      case 'open':
        durationType = DURATION.open
        durationValue = INVALID_UINT32
        break
    }
    rows.push([
      rows.length,
      fixedString(STEP_KINDS[step.kind], NAME_BYTES.step),
      durationType,
      durationValue,
      target.type,
      target.value,
      target.low,
      target.high,
      INTENSITY[step.kind],
      fixedString(stepNotes(step, zones), NAME_BYTES.notes),
    ])
  }

  for (const item of workout.steps) {
    if (item.type === 'step') {
      addStep(item)
      continue
    }
    const first = rows.length
    item.steps.forEach(addStep)
    rows.push([
      rows.length,
      fixedString('', NAME_BYTES.step),
      DURATION.repeatUntilStepsComplete,
      first,
      INVALID_ENUM,
      item.count,
      INVALID_UINT32,
      INVALID_UINT32,
      INVALID_ENUM,
      fixedString('', NAME_BYTES.notes),
    ])
  }

  const [sport, subSport] = sportOf(workout.kind)
  const created = Math.max(0, Math.floor(now.getTime() / 1000) - FIT_EPOCH_OFFSET)

  writer.define(0, MESG_FILE_ID, FILE_ID_FIELDS)
  writer.data(0, FILE_ID_FIELDS, [FILE_TYPE_WORKOUT, MANUFACTURER_DEVELOPMENT, 0, created || 1, created])
  writer.define(1, MESG_WORKOUT, WORKOUT_FIELDS)
  writer.data(1, WORKOUT_FIELDS, [
    sport,
    subSport,
    rows.length,
    fixedString(workout.title.trim() || 'Séance', NAME_BYTES.workout),
  ])
  writer.define(2, MESG_WORKOUT_STEP, STEP_FIELDS)
  for (const row of rows) writer.data(2, STEP_FIELDS, row)

  return writer.toFile()
}

/** Nom de fichier lisible : « 2026-11-10-10x400m.fit ». */
export function fitFileName(date: string, title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${date}-${slug || 'seance'}.fit`
}
