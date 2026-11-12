import { useState } from 'react'
import { Link } from 'react-router'
import { useAcceptTerms } from '../api/account.ts'
import type { UserRole } from '../lib/database.types.ts'
import { errorMessage } from '../lib/errors.ts'
import { SITE } from '../lib/site.ts'
import { supabase } from '../lib/supabase.ts'
import { Alert, Button, Card } from './ui.tsx'

/** Case d'accord : conditions, confidentialité et, pour l'athlète, partage de ses données de santé avec son coach. */
export function ConsentCheckbox({
  role,
  checked,
  onChange,
}: {
  role: UserRole
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        required
        className="mt-0.5 size-5 shrink-0 accent-emerald-700"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="text-sm text-slate-700">
        J’accepte les{' '}
        <Link to="/conditions" target="_blank" className="font-medium text-emerald-800 underline">
          conditions d’utilisation
        </Link>{' '}
        et la{' '}
        <Link to="/confidentialite" target="_blank" className="font-medium text-emerald-800 underline">
          politique de confidentialité
        </Link>
        {role === 'athlete'
          ? '. J’accepte que mes données d’entraînement et de santé (fréquence cardiaque, blessures, douleurs) soient enregistrées et visibles par mon coach.'
          : '. Je m’engage à n’utiliser les données de mes athlètes que pour les entraîner.'}
      </span>
    </label>
  )
}

/**
 * Affiché à la place des pages tant que la personne n'a pas accepté la version en cours des
 * conditions : comptes créés avant la 0.7.0, ou conditions modifiées depuis.
 */
export function ConsentGate({ role, firstTime }: { role: UserRole; firstTime: boolean }) {
  const accept = useAcceptTerms()
  const [checked, setChecked] = useState(false)
  return (
    <div className="mx-auto max-w-xl py-6">
      <Card
        title={firstTime ? `Avant de continuer sur ${SITE.name}` : 'Nos conditions ont changé'}
        description={
          firstTime
            ? 'Ton accord est nécessaire pour enregistrer tes données, en particulier celles qui touchent à la santé.'
            : 'Merci de relire les conditions d’utilisation et la politique de confidentialité, puis de confirmer ton accord.'
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            accept.mutate()
          }}
        >
          <ConsentCheckbox role={role} checked={checked} onChange={setChecked} />
          <p className="text-sm text-slate-600">
            Tu peux à tout moment télécharger tes données ou supprimer ton compte depuis « Compte ».
          </p>
          {accept.isError && <Alert tone="error">{errorMessage(accept.error)}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={accept.isPending} disabled={!checked}>
              Continuer
            </Button>
            <Button variant="ghost" onClick={() => void supabase.auth.signOut()}>
              Me déconnecter
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
