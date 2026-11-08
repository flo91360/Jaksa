import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react'
import {
  type ActivityLap,
  type ActivitySeries,
  type Series,
  formatClock,
  indexAt,
  niceRange,
  paceRange,
  paceSeries,
  segments,
} from '../../domain/activityDetail.ts'
import { formatPace } from '../../domain/pace.ts'
import { formatDistance } from '../../domain/workouts.ts'
import type { HrZone } from '../../domain/zones.ts'
import { zoneFill } from '../zoneColors.ts'

type Chart = {
  key: string
  title: string
  values: Series
  range: [number, number]
  color: string
  /** Allure : les valeurs basses (plus rapides) en haut. */
  inverted?: boolean
  area?: boolean
  format: (v: number) => string
  bands?: { from: number; to: number; color: string }[]
}

const HEIGHT = 112
const MARGIN = { left: 48, right: 10, top: 12, bottom: 20 }

/** Largeur disponible d'un élément, suivie au redimensionnement. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    setWidth(Math.floor(element.getBoundingClientRect().width))
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

/** Graduations du temps : toutes les 5, 10, 15, 30 ou 60 minutes, selon la durée. */
function timeTicks(duration: number, width: number): number[] {
  const wanted = Math.max(2, Math.floor(width / 90))
  const step = [60, 120, 300, 600, 900, 1800, 3600, 7200].find((s) => duration / s <= wanted) ?? 7200
  const ticks: number[] = []
  for (let t = 0; t <= duration; t += step) ticks.push(t)
  return ticks
}

function valueTicks([low, high]: [number, number]): number[] {
  return [low, (low + high) / 2, high]
}

/**
 * Courbes d'une activité, l'une sous l'autre sur le même axe du temps (jamais deux échelles sur un
 * même graphique) : FC (avec les zones de l'athlète en fond), allure, altitude, cadence, puissance.
 * Un curseur commun, à la souris, au doigt ou aux flèches du clavier, lit toutes les valeurs à la fois.
 */
export function ActivityCharts({
  series,
  foot,
  zones,
  laps,
}: {
  series: ActivitySeries
  foot: boolean
  zones: HrZone[]
  laps: ActivityLap[]
}) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const { t } = series
  const duration = t.at(-1) ?? 0

  const charts: Chart[] = []
  if (series.hr) {
    const range = niceRange(series.hr, 10, 30)
    if (range)
      charts.push({
        key: 'hr',
        title: 'Fréquence cardiaque',
        values: series.hr,
        range,
        color: '#e11d48',
        format: (v) => `${Math.round(v)} bpm`,
        bands: zones
          .filter((z) => z.hr_min !== null || z.hr_max !== null)
          .map((z) => ({ from: z.hr_min ?? range[0], to: z.hr_max ?? range[1], color: zoneFill(z.zone) })),
      })
  }
  const pace = paceSeries(series, foot)
  if (pace) {
    const range = foot ? paceRange(pace) : niceRange(pace, 5, 10)
    if (range)
      charts.push({
        key: 'pace',
        title: foot ? 'Allure' : 'Vitesse',
        values: pace,
        range,
        color: '#047857',
        inverted: foot,
        format: (v) => (foot ? `${formatPace(v)} /km` : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km/h`),
      })
  }
  if (series.altitude) {
    const range = niceRange(series.altitude, 10, 30)
    if (range)
      charts.push({
        key: 'altitude',
        title: 'Altitude',
        values: series.altitude,
        range,
        color: '#57534e',
        area: true,
        format: (v) => `${Math.round(v)} m`,
      })
  }
  if (series.cadence) {
    const range = niceRange(series.cadence, 10, 20)
    if (range)
      charts.push({
        key: 'cadence',
        title: 'Cadence',
        values: series.cadence,
        range,
        color: '#7c3aed',
        format: (v) => `${Math.round(v)} ${foot ? 'pas/min' : 'tr/min'}`,
      })
  }
  if (series.power) {
    const range = niceRange(series.power, 50, 100)
    if (range)
      charts.push({
        key: 'power',
        title: 'Puissance',
        values: series.power,
        range,
        color: '#b45309',
        format: (v) => `${Math.round(v)} W`,
      })
  }

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const x = (time: number) => MARGIN.left + (duration > 0 ? (time / duration) * plotWidth : 0)

  const move = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const time = ((event.clientX - box.left) / Math.max(1, box.width)) * duration
    setHover(indexAt(t, Math.min(duration, Math.max(0, time))))
  }
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const stepPoints = Math.max(1, Math.round(t.length / 100))
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const current = hover ?? 0
      const next = current + (event.key === 'ArrowRight' ? stepPoints : -stepPoints)
      setHover(Math.min(t.length - 1, Math.max(0, next)))
    } else if (event.key === 'Escape') setHover(null)
  }

  if (charts.length === 0 || t.length < 2) {
    return <p className="text-sm text-slate-500">La montre n’a enregistré aucune courbe pour cette activité.</p>
  }

  const readout = hover !== null ? readValues(charts, series, hover) : null
  const lapLines = laps.length > 1 && laps.length <= 80 ? laps.slice(1).map((lap) => lap.start_s) : []

  return (
    <div
      ref={ref}
      className="space-y-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      tabIndex={0}
      role="group"
      aria-label="Courbes de l’activité. Flèches gauche et droite pour lire les valeurs."
      onKeyDown={keys}
    >
      <div className="min-h-10 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600 tabular-nums" aria-live="polite">
        {readout ? (
          <span className="flex flex-wrap gap-x-4 gap-y-0.5">
            <span className="font-semibold text-slate-900">{formatClock(t[hover ?? 0])}</span>
            {readout.map(([label, value]) => (
              <span key={label}>
                {label} <span className="font-semibold text-slate-900">{value}</span>
              </span>
            ))}
          </span>
        ) : (
          <span>
            Survole les courbes (ou touche-les) pour lire les valeurs à chaque instant. Les traits verticaux marquent les tours.
          </span>
        )}
      </div>
      {width > 0 &&
        charts.map((chart, chartIndex) => (
          <ChartPanel
            key={chart.key}
            chart={chart}
            t={t}
            width={width}
            x={x}
            duration={duration}
            hover={hover}
            lapLines={lapLines}
            showTime={chartIndex === charts.length - 1}
            onMove={move}
            onLeave={() => setHover(null)}
          />
        ))}
    </div>
  )
}

function readValues(charts: Chart[], series: ActivitySeries, index: number): [string, string][] {
  const values: [string, string][] = []
  const distance = series.distance?.[index]
  if (distance !== null && distance !== undefined) values.push(['Distance', formatDistance(distance)])
  for (const chart of charts) {
    const v = chart.values[index]
    if (v !== null && v !== undefined) values.push([chart.key === 'hr' ? 'FC' : chart.title, chart.format(v)])
  }
  return values
}

function ChartPanel({
  chart,
  t,
  width,
  x,
  duration,
  hover,
  lapLines,
  showTime,
  onMove,
  onLeave,
}: {
  chart: Chart
  t: number[]
  width: number
  x: (time: number) => number
  duration: number
  hover: number | null
  lapLines: number[]
  showTime: boolean
  onMove: (event: PointerEvent<SVGRectElement>) => void
  onLeave: () => void
}) {
  const height = HEIGHT + (showTime ? MARGIN.bottom : 4)
  const plotHeight = HEIGHT - MARGIN.top
  const [low, high] = chart.range
  const y = (v: number) => {
    const ratio = (Math.min(high, Math.max(low, v)) - low) / Math.max(1e-9, high - low)
    return MARGIN.top + (chart.inverted ? ratio : 1 - ratio) * plotHeight
  }
  const parts = segments(t, chart.values)
  const line = parts
    .map((part) => part.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' '))
    .join(' ')
  const bottom = MARGIN.top + plotHeight
  const area = chart.area
    ? parts
        .map(
          (part) =>
            `M${x(part[0].t).toFixed(1)} ${bottom} ` +
            part.map((p) => `L${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ') +
            ` L${x(part[part.length - 1].t).toFixed(1)} ${bottom} Z`,
        )
        .join(' ')
    : null
  const hoverValue = hover !== null ? chart.values[hover] : null
  const right = width - MARGIN.right

  return (
    <figure className="m-0">
      <figcaption className="px-1 text-xs font-semibold text-slate-700">{chart.title}</figcaption>
      <svg width={width} height={height} className="block touch-pan-y select-none" aria-hidden="true">
        {chart.bands?.map((band) => {
          const top = Math.min(y(band.from), y(band.to))
          const bandHeight = Math.abs(y(band.to) - y(band.from))
          return bandHeight > 0.5 ? (
            <rect
              key={band.from}
              x={MARGIN.left}
              width={right - MARGIN.left}
              y={top}
              height={bandHeight}
              fill={band.color}
              opacity={0.09}
            />
          ) : null
        })}
        {valueTicks(chart.range).map((v) => (
          <g key={v}>
            <line x1={MARGIN.left} x2={right} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={MARGIN.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[10px] tabular-nums">
              {chart.format(v).replace(/ (bpm|\/km|m|km\/h|pas\/min|tr\/min|W)$/, '')}
            </text>
          </g>
        ))}
        {lapLines.map((start) => (
          <line
            key={start}
            x1={x(start)}
            x2={x(start)}
            y1={MARGIN.top}
            y2={bottom}
            stroke="#cbd5e1"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
        ))}
        {area && <path d={area} fill={chart.color} opacity={0.14} />}
        <path d={line} fill="none" stroke={chart.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {showTime &&
          timeTicks(duration, width).map((tick) => (
            <text key={tick} x={x(tick)} y={height - 5} textAnchor="middle" className="fill-slate-500 text-[10px] tabular-nums">
              {formatClock(tick)}
            </text>
          ))}
        {hover !== null && (
          <>
            <line x1={x(t[hover])} x2={x(t[hover])} y1={MARGIN.top} y2={bottom} stroke="#0f172a" strokeWidth={1} opacity={0.5} />
            {hoverValue !== null && hoverValue !== undefined && (
              <circle cx={x(t[hover])} cy={y(hoverValue)} r={4} fill={chart.color} stroke="#fff" strokeWidth={2} />
            )}
          </>
        )}
        <rect
          x={MARGIN.left}
          y={0}
          width={Math.max(0, right - MARGIN.left)}
          height={bottom}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={onLeave}
        />
      </svg>
    </figure>
  )
}
