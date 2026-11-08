import { useState } from 'react'
import { useAthleteProfiles, useCoachAthletes } from '../../api/athletes.ts'
import { useDeleteTemplate, useTemplates } from '../../api/planning.ts'
import { useUserId } from '../../auth/auth-context.ts'
import { Alert, Button, EmptyState, LoadingBlock, PageHeader } from '../../components/ui.tsx'
import { TemplateEditor, WorkoutEditor } from '../../components/workout/WorkoutEditor.tsx'
import { KIND_STYLES } from '../../components/workout/kindStyles.ts'
import { todayIso } from '../../domain/calendar.ts'
import { contentOf } from '../../domain/planning.ts'
import { WORKOUT_KINDS, summarizeWorkout } from '../../domain/workouts.ts'
import type { WorkoutTemplate } from '../../lib/database.types.ts'
import { errorMessage } from '../../lib/errors.ts'

type Editing = { type: 'template'; template?: WorkoutTemplate } | { type: 'plan'; template: WorkoutTemplate } | null

/** Bibliothèque de séances types du coach. */
export function LibraryPage() {
  const coachId = useUserId()
  const templates = useTemplates()
  const remove = useDeleteTemplate()
  const links = useCoachAthletes(coachId)
  const active = (links.data ?? []).filter((link) => link.status === 'active')
  const profiles = useAthleteProfiles(active.map((link) => link.athlete_id))
  const [editing, setEditing] = useState<Editing>(null)

  const athletes = active.map((link) => ({
    id: link.athlete_id,
    name: link.athlete_name || link.athlete_email,
    zones: profiles.data?.find((p) => p.athlete_id === link.athlete_id)?.zones ?? [],
  }))

  return (
    <>
      <PageHeader
        title="Séances types"
        subtitle="Ta bibliothèque : à planifier en un clic pour n’importe quel athlète."
        actions={<Button onClick={() => setEditing({ type: 'template' })}>Nouvelle séance type</Button>}
      />
      {templates.isPending && <LoadingBlock />}
      {templates.isError && <Alert tone="error">{errorMessage(templates.error)}</Alert>}
      {remove.isError && <Alert tone="error">{errorMessage(remove.error)}</Alert>}
      {templates.data?.length === 0 && (
        <EmptyState title="Bibliothèque vide">
          Crée tes séances habituelles (VMA, seuil, sortie longue…) pour les planifier plus vite. Une séance du
          calendrier peut aussi y être ajoutée.
        </EmptyState>
      )}
      {templates.data && templates.data.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {templates.data.map((template) => (
            <li
              key={template.id}
              className={`flex flex-col gap-3 rounded-2xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm ${KIND_STYLES[template.kind].card}`}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{WORKOUT_KINDS[template.kind]}</p>
                <p className="font-semibold text-slate-900">{template.title}</p>
                <p className="mt-1 text-sm text-slate-600">{summarizeWorkout(template.steps) || template.description || '—'}</p>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={athletes.length === 0}
                  onClick={() => setEditing({ type: 'plan', template })}
                >
                  Planifier
                </Button>
                <Button variant="ghost" onClick={() => setEditing({ type: 'template', template })}>
                  Modifier
                </Button>
                <Button
                  variant="ghost"
                  className="text-red-700"
                  onClick={() => {
                    if (window.confirm(`Supprimer « ${template.title} » de la bibliothèque ?`)) remove.mutate(template.id)
                  }}
                >
                  Supprimer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing?.type === 'template' && <TemplateEditor template={editing.template} onClose={() => setEditing(null)} />}
      {editing?.type === 'plan' && (
        <WorkoutEditor
          initial={{ date: todayIso(), content: contentOf(editing.template) }}
          athletes={athletes}
          existing={[]}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
