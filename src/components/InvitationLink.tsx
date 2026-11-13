import { useState } from 'react'
import { invitationPath } from '../domain/invitations.ts'
import { appUrl } from '../lib/supabase.ts'
import { canShare, copyText, shareLink } from '../lib/share.ts'
import { Button } from './ui.tsx'

/** Lien d'invitation avec les boutons Copier / Partager. */
export function InvitationLink({ token, athleteName }: { token: string; athleteName: string }) {
  const url = appUrl(invitationPath(token))
  const [copied, setCopied] = useState(false)
  const message = athleteName
    ? `${athleteName}, voici ton lien pour rejoindre ton coach sur Jaksa :`
    : 'Voici ton lien pour rejoindre ton coach sur Jaksa :'

  return (
    <div className="space-y-2">
      <input
        readOnly
        value={url}
        aria-label="Lien d’invitation"
        onFocus={(event) => event.currentTarget.select()}
        className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            setCopied(await copyText(url))
            window.setTimeout(() => setCopied(false), 2500)
          }}
        >
          {copied ? 'Lien copié ✓' : 'Copier le lien'}
        </Button>
        {canShare() && (
          <Button variant="secondary" onClick={() => void shareLink(url, message)}>
            Partager…
          </Button>
        )}
      </div>
    </div>
  )
}
