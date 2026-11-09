import { THEME_LABELS, type ThemePreference, nextThemePreference } from '../domain/theme.ts'
import { setThemePreference, useThemePreference } from '../lib/theme.ts'

const ICONS: Record<ThemePreference, string> = {
  // Écran
  system: 'M4 5h16v11H4V5Zm4 15h8m-4-4v4',
  // Soleil
  light: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-14v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  // Lune
  dark: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z',
}

function ThemeIcon({ value }: { value: ThemePreference }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[value]} />
    </svg>
  )
}

/** Bouton de l'en-tête : passe de système à clair, puis sombre. */
export function ThemeToggle() {
  const current = useThemePreference()
  const next = nextThemePreference(current)
  const label = `${THEME_LABELS[current]} (passer au ${THEME_LABELS[next].toLowerCase()})`
  return (
    <button
      type="button"
      onClick={() => setThemePreference(next)}
      title={label}
      aria-label={label}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
    >
      <ThemeIcon value={current} />
    </button>
  )
}

const CHOICES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
]

/** Choix explicite, sur la page Compte. */
export function ThemeChoice() {
  const current = useThemePreference()
  return (
    <div role="radiogroup" aria-label="Thème" className="inline-flex rounded-xl border border-slate-300 p-1">
      {CHOICES.map((choice) => (
        <button
          key={choice.value}
          type="button"
          role="radio"
          aria-checked={current === choice.value}
          onClick={() => setThemePreference(choice.value)}
          className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${current === choice.value ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
        >
          <ThemeIcon value={choice.value} />
          {choice.label}
        </button>
      ))}
    </div>
  )
}
