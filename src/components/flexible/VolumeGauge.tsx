import { type WeekSummary, describeRemaining, formatKm, formatTarget, volumeBar } from '../../domain/flexible.ts'

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** Volume de la semaine : kilomètres courus, fourchette du coach et kilomètres restants. */
export function VolumeGauge({ summary, you }: { summary: WeekSummary; you: boolean }) {
  const bar = volumeBar(summary)
  const target = summary.target
  if (!target || !bar) {
    return (
      <p className="text-sm text-slate-600">
        <strong className="text-lg font-bold text-slate-900">{formatKm(summary.doneKm)}</strong> courus cette semaine.{' '}
        {you ? 'Ton coach n’a pas fixé de volume.' : 'Pas de volume fixé.'}
      </p>
    )
  }
  const above = summary.volume === 'above'
  const reached = summary.volume === 'within'
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-slate-600">
        <strong className="text-2xl font-bold text-slate-900">{formatKm(summary.doneKm)}</strong>
        <span>courus sur {formatTarget(target)}</span>
      </p>
      <div
        className="relative mt-3 h-3 rounded-full bg-slate-100"
        role="img"
        aria-label={`${formatKm(summary.doneKm)} courus, fourchette de ${formatTarget(target)}`}
      >
        {/* Fourchette visée */}
        <div
          className="absolute inset-y-0 rounded-sm bg-emerald-200"
          style={{ left: `${bar.from}%`, width: `${Math.max(bar.to - bar.from, 1)}%` }}
        />
        {/* Volume couru */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${above ? 'bg-amber-500' : 'bg-emerald-600'}`}
          style={{ width: `${bar.done}%` }}
        />
        {/* Bornes de la fourchette */}
        <div className="absolute -inset-y-1 w-0.5 bg-slate-500" style={{ left: `${bar.from}%` }} />
        <div className="absolute -inset-y-1 w-0.5 bg-slate-500" style={{ left: `${bar.to}%` }} />
      </div>
      <div className="relative mt-1.5 h-4 text-xs text-slate-500" aria-hidden="true">
        {target.km_min !== target.km_max && bar.to - bar.from >= 8 && (
          <span className="absolute -translate-x-1/2" style={{ left: `${bar.from}%` }}>
            {number.format(target.km_min)}
          </span>
        )}
        <span className="absolute -translate-x-1/2" style={{ left: `${bar.to}%` }}>
          {number.format(target.km_max)} km
        </span>
      </div>
      <p className={`mt-2 text-sm font-semibold ${above ? 'text-amber-800' : reached ? 'text-emerald-800' : 'text-slate-800'}`}>
        {describeRemaining(summary, you)}
      </p>
    </div>
  )
}
