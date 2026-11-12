import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import './index.css'
// Applique le thème clair ou sombre et suit les changements du système.
import './lib/theme.ts'
import { installErrorReporting } from './lib/errorReporting.ts'
import { isSupabaseConfigured } from './lib/supabase.ts'
import { ConfigMissingPage } from './pages/MiscPages.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

if (isSupabaseConfigured) installErrorReporting()

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable')

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {isSupabaseConfigured ? (
          <AuthProvider>
            <App />
          </AuthProvider>
        ) : (
          <ConfigMissingPage />
        )}
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
