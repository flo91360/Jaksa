import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/errorReporting.ts'
import { Button } from './ui.tsx'

/**
 * Dernier filet : si une page plante, on affiche un écran propre (au lieu d'une page blanche)
 * et l'erreur est notée dans le journal.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, `affichage${info.componentStack ? info.componentStack.split('\n').slice(0, 3).join(' ') : ''}`)
  }

  render() {
    if (!this.state.failed) return this.props.children
    // Écran autonome : il est affiché en dehors du routeur, donc sans <Link> ni composant qui en dépend.
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Un problème est survenu</h1>
          <p className="mt-2 text-sm text-slate-600">La page n’a pas pu s’afficher. L’erreur a été signalée.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => window.location.reload()}>Recharger la page</Button>
            <Button variant="secondary" onClick={() => window.location.assign('/')}>
              Retour à l’accueil
            </Button>
          </div>
        </div>
      </main>
    )
  }
}
