import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  isMissingRelation,
  useConversations,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
} from '../api/exchanges.ts'
import { useMyProfile } from '../api/profile.ts'
import { useUserId } from '../auth/auth-context.ts'
import { Alert, Button, EmptyState, LoadingBlock, PageHeader, UnreadBadge } from '../components/ui.tsx'
import { todayIso } from '../domain/calendar.ts'
import { MESSAGE_MAX, cleanBody, formatDayLabel, formatTime, formatWhen, groupByDay } from '../domain/messages.ts'
import type { Conversation } from '../lib/database.types.ts'
import { errorMessage } from '../lib/errors.ts'
import { firstName } from '../lib/format.ts'

/**
 * Messagerie. Le coach voit la liste de ses athlètes (?athlete=… ouvre une
 * conversation) ; l'athlète voit directement la conversation avec son coach.
 */
export function MessagesPage() {
  const me = useMyProfile()
  const meId = useUserId()
  const conversations = useConversations()
  const [params, setParams] = useSearchParams()
  const [today] = useState(() => todayIso())

  if (conversations.isPending || me.isPending) return <LoadingBlock />
  if (isMissingRelation(conversations.error)) {
    return (
      <>
        <PageHeader title="Messages" />
        <Alert tone="info">La messagerie sera disponible dès que la base de données aura été mise à jour.</Alert>
      </>
    )
  }
  if (conversations.isError) return <Alert tone="error">{errorMessage(conversations.error)}</Alert>

  const isCoach = me.data?.role === 'coach'
  const list = isCoach
    ? conversations.data.filter((c) => c.coach_id === meId && (c.status === 'active' || c.last_message_at))
    : conversations.data.filter((c) => c.athlete_id === meId)
  const selectedId = params.get(isCoach ? 'athlete' : 'coach')
  const selected = isCoach
    ? list.find((c) => c.athlete_id === selectedId)
    : (list.find((c) => c.coach_id === selectedId) ?? list.find((c) => c.status === 'active') ?? list[0])

  if (list.length === 0) {
    return (
      <>
        <PageHeader title="Messages" />
        <EmptyState title={isCoach ? 'Aucun athlète pour l’instant' : 'Tu n’es rattaché à aucun coach'}>
          {isCoach ? (
            <>
              Invite tes athlètes depuis la page{' '}
              <Link to="/athletes" className="font-medium text-emerald-800 underline">
                Athlètes
              </Link>
              .
            </>
          ) : (
            'Ouvre le lien d’invitation qu’il t’a envoyé.'
          )}
        </EmptyState>
      </>
    )
  }

  const open = (c: Conversation) => setParams(isCoach ? { athlete: c.athlete_id } : { coach: c.coach_id })

  return (
    <>
      <PageHeader title="Messages" />
      <div
        className={`grid gap-4 ${isCoach ? 'md:grid-cols-[18rem_1fr]' : ''} md:h-[calc(100dvh-12rem)] md:min-h-[28rem]`}
      >
        {isCoach && (
          <nav
            aria-label="Conversations"
            className={`overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm ${selected ? 'hidden md:block' : ''}`}
          >
            <ul className="divide-y divide-slate-100">
              {list.map((c) => {
                const active = selected?.athlete_id === c.athlete_id
                const name = c.athlete_name || c.athlete_email
                return (
                  <li key={c.athlete_id}>
                    <button
                      type="button"
                      onClick={() => open(c)}
                      aria-current={active || undefined}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ${active ? 'bg-emerald-50' : ''}`}
                    >
                      <Avatar name={name} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-sm ${c.unread_count > 0 ? 'font-bold' : 'font-semibold'} text-slate-900`}>
                            {name}
                          </span>
                          {c.last_message_at && (
                            <span className="shrink-0 text-xs text-slate-500">{formatWhen(c.last_message_at, today)}</span>
                          )}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className={`min-w-0 flex-1 truncate text-sm ${c.unread_count > 0 ? 'text-slate-900' : 'text-slate-500'}`}>
                            {c.last_body
                              ? `${c.last_sender_id === meId ? 'Toi : ' : ''}${c.last_body}`
                              : 'Aucun message'}
                          </span>
                          {c.unread_count > 0 && <UnreadBadge count={c.unread_count} />}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>
        )}

        {selected ? (
          <ConversationPane
            key={`${selected.coach_id}-${selected.athlete_id}`}
            conversation={selected}
            meId={meId}
            title={isCoach ? selected.athlete_name || selected.athlete_email : selected.coach_name || 'Ton coach'}
            onBack={isCoach ? () => setParams({}) : undefined}
            today={today}
          />
        ) : (
          <div className="hidden items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-500 md:flex">
            Choisis un athlète pour lire ou écrire un message.
          </div>
        )}
      </div>
    </>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800"
    >
      {initials || '?'}
    </span>
  )
}

function ConversationPane({
  conversation,
  meId,
  title,
  onBack,
  today,
}: {
  conversation: Conversation
  meId: string
  title: string
  onBack?: () => void
  today: string
}) {
  const { coach_id: coachId, athlete_id: athleteId } = conversation
  const messages = useMessages(coachId, athleteId)
  const send = useSendMessage(coachId, athleteId)
  const { mutate: markRead } = useMarkConversationRead()
  const [text, setText] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const list = messages.data ?? []
  const unreadIds = list.filter((m) => m.sender_id !== meId && m.read_at === null).map((m) => m.id).join(',')

  // Messages reçus affichés : lus. Défilement jusqu'au dernier message.
  useEffect(() => {
    if (unreadIds) markRead({ coachId, athleteId })
  }, [unreadIds, markRead, coachId, athleteId])
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [list.length])

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    const body = cleanBody(text, MESSAGE_MAX)
    if (!body) return
    await send.mutateAsync(body)
    setText('')
  }

  const lastMine = [...list].reverse().find((m) => m.sender_id === meId)

  return (
    <section
      aria-label={`Conversation avec ${title}`}
      className="flex h-[calc(100dvh-15.5rem)] min-h-80 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:h-auto md:min-h-0"
    >
      <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Toutes les conversations"
            className="inline-flex size-11 items-center justify-center rounded-xl text-xl text-slate-600 hover:bg-slate-100 md:hidden"
          >
            ←
          </button>
        )}
        <Avatar name={title} />
        <h2 className="min-w-0 truncate font-semibold text-slate-900">{title}</h2>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-live="polite">
        {messages.isPending && <LoadingBlock />}
        {messages.isError && <Alert tone="error">{errorMessage(messages.error)}</Alert>}
        {messages.data?.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">
            Pas encore de message. Écris à {firstName(title) || title} !
          </p>
        )}
        {groupByDay(list).map((group) => (
          <div key={group.day} className="space-y-1.5">
            <p className="text-center text-xs font-semibold text-slate-500">{formatDayLabel(group.day, today)}</p>
            {group.items.map((message) => {
              const mine = message.sender_id === meId
              return (
                <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 sm:max-w-[70%] ${mine ? 'rounded-br-md bg-emerald-700 text-white' : 'rounded-bl-md bg-slate-100 text-slate-900'}`}
                  >
                    <p className="text-sm whitespace-pre-line">{message.body}</p>
                    <p className={`mt-0.5 text-right text-[11px] ${mine ? 'text-emerald-100' : 'text-slate-500'}`}>
                      {formatTime(message.created_at)}
                      {mine && message.id === lastMine?.id && (message.read_at ? ' · Lu' : ' · Envoyé')}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-slate-200 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <label htmlFor="message-body" className="sr-only">
          Message
        </label>
        <textarea
          id="message-body"
          rows={1}
          maxLength={MESSAGE_MAX}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Entrée envoie sur ordinateur ; Maj + Entrée passe à la ligne.
            if (event.key === 'Enter' && !event.shiftKey && window.matchMedia('(pointer: fine)').matches) {
              void submit(event)
            }
          }}
          placeholder="Ton message…"
          className="block max-h-40 min-h-11 w-full flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-emerald-600 sm:text-sm"
        />
        <Button type="submit" busy={send.isPending} disabled={!cleanBody(text, MESSAGE_MAX)}>
          Envoyer
        </Button>
      </form>
      {send.isError && (
        <div className="px-3 pb-3">
          <Alert tone="error">{errorMessage(send.error)}</Alert>
        </div>
      )}
    </section>
  )
}
