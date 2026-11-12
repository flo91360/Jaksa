import { type Plan, type PlanUsage, formatPlanLimit, formatPlanPrice, formatUsage, nextPlan } from '../domain/plans.ts'
import { SITE } from '../lib/site.ts'

/** Comment obtenir plus de places : par e-mail tant que le paiement en ligne n'existe pas. */
export function UpgradeHint({ usage }: { usage: PlanUsage }) {
  const next = nextPlan(usage.plan.code)
  if (!next) return null
  const offer = `l’offre ${next.name} (${formatPlanLimit(next).toLowerCase()})`
  return (
    <span>
      {SITE.contactEmail ? (
        <>
          Pour suivre plus d’athlètes, écris-nous à{' '}
          <a href={`mailto:${SITE.contactEmail}?subject=${encodeURIComponent(`Offre ${next.name}`)}`} className="font-medium underline">
            {SITE.contactEmail}
          </a>{' '}
          : nous t’ouvrons {offer}.
        </>
      ) : (
        <>Pour suivre plus d’athlètes, {offer} ouvre bientôt. Archiver un athlète libère aussi une place.</>
      )}
    </span>
  )
}

/** Barre « 2 athlètes sur 3 ». */
export function UsageBar({ usage }: { usage: PlanUsage }) {
  const limit = usage.plan.athleteLimit
  return (
    <div>
      <p className="text-sm text-slate-700">
        Offre <strong>{usage.plan.name}</strong> · {formatUsage(usage)}
      </p>
      {limit !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div
            className={`h-full rounded-full ${usage.full ? 'bg-amber-500' : 'bg-emerald-600'}`}
            style={{ width: `${Math.min(100, Math.round((usage.active / limit) * 100))}%` }}
          />
        </div>
      )}
    </div>
  )
}

/** Une offre, sur la page publique. */
export function PlanTile({ plan, highlighted = false }: { plan: Plan; highlighted?: boolean }) {
  return (
    <li
      className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${highlighted ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-200'}`}
    >
      <h3 className="font-semibold text-slate-900">{plan.name}</h3>
      <p className="mt-2 text-xl font-bold text-slate-900">{formatPlanLimit(plan)}</p>
      <p className={`mt-1 text-sm font-semibold ${plan.monthlyPrice === 0 ? 'text-emerald-800' : 'text-slate-500'}`}>
        {formatPlanPrice(plan)}
      </p>
      <p className="mt-3 text-sm text-slate-600">{plan.summary}</p>
    </li>
  )
}
