import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/errorReporting.ts'
import { AuthLayout, Button } from './ui.tsx'

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
    return (
      <AuthLayout title="Un problème est survenu" subtitle="La page n’a pas pu s’afficher. L’erreur a été signalée.">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.location.reload()}>Recharger la page</Button>
          <Button variant="secondary" onClick={() => window.location.assign('/')}>
            Retour à l’accueil
          </Button>
        </div>
      </AuthLayout>
    )
  }
}
