import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/auth-context.ts'
import { SITE } from '../lib/site.ts'
import { ThemeToggle } from './ThemeToggle.tsx'
import { LegalLinks } from './ui.tsx'

/** Année du pied de page, lue une fois au chargement. */
const YEAR = new Date().getFullYear()

const LINK_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600'

/** Lien présenté comme un bouton (pages publiques : la navigation se fait par des liens). */
export function ButtonLink({
  to,
  variant = 'primary',
  className = '',
  children,
}: {
  to: string
  variant?: 'primary' | 'secondary'
  className?: string
  children: ReactNode
}) {
  const tone =
    variant === 'primary'
      ? 'bg-emerald-700 text-white shadow-sm hover:bg-emerald-800'
      : 'border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50'
  return (
    <Link to={to} className={`${LINK_BUTTON} ${tone} ${className}`}>
      {children}
    </Link>
  )
}

/** Mise en page des pages visibles sans compte : accueil, pages légales. */
export function PublicLayout({ children, width = 'max-w-5xl' }: { children: ReactNode; width?: string }) {
  const { session } = useAuth()
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight text-slate-900">
            <img src="/favicon.svg" alt="" className="size-8" />
            {SITE.name}
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <ButtonLink to={session ? '/' : '/connexion'} variant="secondary">
              {session ? 'Mon espace' : 'Se connecter'}
            </ButtonLink>
          </div>
        </div>
      </header>

      <main className={`mx-auto w-full flex-1 px-4 py-8 ${width}`}>{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-6">
          <LegalLinks />
          <p className="text-center text-xs text-slate-500">
            © {YEAR} {SITE.name}
            {SITE.contactEmail && (
              <>
                {' · '}
                <a href={`mailto:${SITE.contactEmail}`} className="hover:underline">
                  {SITE.contactEmail}
                </a>
              </>
            )}
          </p>
        </div>
      </footer>
    </div>
  )
}
