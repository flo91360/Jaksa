import { NavLink, Outlet, useLocation } from 'react-router'
import { useMyProfile } from '../api/profile.ts'
import type { UserRole } from '../lib/database.types.ts'

type NavItem = { to: string; label: string; icon: string }

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  coach: [
    { to: '/planning', label: 'Planning', icon: 'M4 7h16M4 7v12h16V7M4 7V5h16v2M8 3v4m8-4v4m-8 6h3' },
    { to: '/seances-types', label: 'Séances types', icon: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h11M9 8h6' },
    { to: '/athletes', label: 'Athlètes', icon: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm-12 9a8 8 0 0 1 16 0' },
    { to: '/compte', label: 'Compte', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z' },
  ],
  athlete: [
    { to: '/aujourdhui', label: "Aujourd'hui", icon: 'M4 7h16M4 7v12h16V7M4 7V5h16v2M8 3v4m8-4v4m-8 6h3' },
    { to: '/mon-profil', label: 'Mon profil', icon: 'M16 8a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm-12 13a8 8 0 0 1 16 0' },
    { to: '/compte', label: 'Compte', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z' },
  ],
}

function NavIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

export function AppLayout() {
  const { data: profile } = useMyProfile()
  const items = profile ? NAV_BY_ROLE[profile.role] : []
  // Les calendriers prennent toute la largeur des grands écrans.
  const { pathname } = useLocation()
  const width = pathname === '/planning' || /^\/athletes\/[^/]+\/?$/.test(pathname) ? 'max-w-7xl' : 'max-w-5xl'

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className={`mx-auto flex h-14 ${width} items-center justify-between gap-4 px-4`}>
          <NavLink to="/" className="flex items-center gap-2 font-bold tracking-tight text-slate-900">
            <img src="/favicon.svg" alt="" className="size-8" />
            Rob1Coach
          </NavLink>
          <nav aria-label="Navigation principale" className="hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          {profile && <span className="truncate text-sm text-slate-500 md:hidden">{profile.full_name}</span>}
        </div>
      </header>

      <main className={`mx-auto ${width} px-4 py-6`}>
        <Outlet />
      </main>

      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="mx-auto flex max-w-md justify-around">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${isActive ? 'text-emerald-700' : 'text-slate-500'}`
              }
            >
              <NavIcon path={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
