import { useAthleteProfile, useUpdateAthleteProfile } from '../../api/athletes.ts'
import { useUserId } from '../../auth/auth-context.ts'
import { AthleteInfoForm } from '../../components/AthleteForms.tsx'
import { ZoneTable } from '../../components/ZoneTable.tsx'
import { Alert, Card, LoadingBlock, PageHeader } from '../../components/ui.tsx'
import type { AthleteProfile } from '../../lib/database.types.ts'
import { errorMessage } from '../../lib/errors.ts'
import { formatDate } from '../../lib/format.ts'

export function MyProfilePage() {
  const athleteId = useUserId()
  const profile = useAthleteProfile(athleteId)
  const update = useUpdateAthleteProfile(athleteId)

  if (profile.isPending) return <LoadingBlock />
  if (profile.isError) return <Alert tone="error">{errorMessage(profile.error)}</Alert>
  if (!profile.data) return <Alert tone="warning">Fiche introuvable.</Alert>

  const fiche = profile.data
  return (
    <>
      <PageHeader title="Mon profil" subtitle="Ces informations sont partagées avec ton coach." />
      <div className="space-y-6">
        <Card title="Mes informations" description="Objectifs, blessures, disponibilités : aide ton coach à adapter ton plan.">
          <AthleteInfoForm profile={fiche} onSave={(patch) => update.mutateAsync(patch)} />
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Ma physiologie" description="Renseignée par ton coach.">
            <PhysiologySummary profile={fiche} />
          </Card>
          <Card
            title="Mes zones"
            description={fiche.zones_updated_at ? `Mises à jour le ${formatDate(fiche.zones_updated_at)}` : undefined}
          >
            <ZoneTable zones={fiche.zones} />
          </Card>
        </div>
      </div>
    </>
  )
}

function PhysiologySummary({ profile }: { profile: AthleteProfile }) {
  const rows: [string, string][] = [
    ['FC max', profile.hr_max === null ? '' : `${profile.hr_max} bpm`],
    ['FC repos', profile.hr_rest === null ? '' : `${profile.hr_rest} bpm`],
    ['FC seuil', profile.hr_threshold === null ? '' : `${profile.hr_threshold} bpm`],
    ['VMA', profile.vma_kmh === null ? '' : `${String(profile.vma_kmh).replace('.', ',')} km/h`],
  ]
  return (
    <dl className="grid grid-cols-2 gap-3">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs font-medium text-slate-500">{label}</dt>
          <dd className="mt-1 text-lg font-semibold text-slate-900">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
