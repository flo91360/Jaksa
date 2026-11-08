import { useParams } from 'react-router'
import {
  useAthleteProfile,
  useCoachLink,
  usePrivateNote,
  useSavePrivateNote,
  useSetAthleteStatus,
  useUpdateAthleteProfile,
} from '../../api/athletes.ts'
import { useUserId } from '../../auth/auth-context.ts'
import { AthleteInfoForm, PhysiologyForm, PrivateNoteForm } from '../../components/AthleteForms.tsx'
import { ZoneEditor } from '../../components/ZoneEditor.tsx'
import { Alert, Button, Card, EmptyState, LoadingBlock, PageHeader } from '../../components/ui.tsx'
import { errorMessage } from '../../lib/errors.ts'
import { formatDate } from '../../lib/format.ts'

/** Fiche d'un athlète vue par son coach. */
export function AthletePage() {
  const { athleteId = '' } = useParams()
  const coachId = useUserId()
  const link = useCoachLink(coachId, athleteId)
  const profile = useAthleteProfile(athleteId)
  const note = usePrivateNote(coachId, athleteId)
  const update = useUpdateAthleteProfile(athleteId)
  const saveNote = useSavePrivateNote(coachId, athleteId)
  const setStatus = useSetAthleteStatus(coachId, athleteId)

  if (link.isPending || profile.isPending) return <LoadingBlock />
  if (link.isError || profile.isError) {
    return <Alert tone="error">{errorMessage(link.error ?? profile.error)}</Alert>
  }
  if (!link.data || !profile.data) {
    return (
      <>
        <PageHeader title="Athlète introuvable" back={{ to: '/athletes', label: 'Mes athlètes' }} />
        <EmptyState title="Cet athlète n’est pas (ou plus) dans ta liste." />
      </>
    )
  }

  const athlete = link.data
  const fiche = profile.data
  const archived = athlete.status === 'archived'

  return (
    <>
      <PageHeader
        back={{ to: '/athletes', label: 'Mes athlètes' }}
        title={athlete.athlete_name || athlete.athlete_email}
        subtitle={`${athlete.athlete_email} · suivi depuis le ${formatDate(athlete.linked_at)}`}
        actions={
          <Button
            variant={archived ? 'secondary' : 'ghost'}
            busy={setStatus.isPending}
            onClick={() => {
              if (archived || window.confirm('Archiver cet athlète ? Il disparaîtra de ta liste principale.')) {
                setStatus.mutate(archived ? 'active' : 'archived')
              }
            }}
          >
            {archived ? 'Réactiver' : 'Archiver'}
          </Button>
        }
      />

      <div className="space-y-6">
        {archived && <Alert tone="warning">Athlète archivé : il n’apparaît plus dans ta liste principale.</Alert>}
        {setStatus.isError && <Alert tone="error">{errorMessage(setStatus.error)}</Alert>}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Physiologie" description="Sert au calcul des zones de fréquence cardiaque.">
            <PhysiologyForm profile={fiche} onSave={(patch) => update.mutateAsync(patch)} />
          </Card>
          <Card title="Notes privées" description="Visibles par toi seul, jamais par l’athlète.">
            {note.isPending ? (
              <LoadingBlock />
            ) : note.isError ? (
              <Alert tone="error">{errorMessage(note.error)}</Alert>
            ) : (
              <PrivateNoteForm body={note.data} onSave={(body) => saveNote.mutateAsync(body)} />
            )}
          </Card>
        </div>

        <Card
          title="Zones FC et allures"
          description={
            fiche.zones_updated_at
              ? `Mises à jour le ${formatDate(fiche.zones_updated_at)}. L’athlète les voit dans son espace.`
              : 'Calcule les FC, puis indique l’allure que tu associes à chaque zone. L’athlète les voit dans son espace.'
          }
        >
          <ZoneEditor zones={fiche.zones} physiology={fiche} onSave={(zones) => update.mutateAsync({ zones })} />
        </Card>

        <Card title="Profil et objectifs" description="Renseigné par l’athlète ou par toi.">
          <AthleteInfoForm profile={fiche} onSave={(patch) => update.mutateAsync(patch)} />
        </Card>
      </div>
    </>
  )
}
