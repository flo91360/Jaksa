import { Route, Routes } from 'react-router'
import { HomeRedirect, PublicOnly, RequireAuth, RequireRole } from './auth/guards.tsx'
import { AppLayout } from './components/AppLayout.tsx'
import { AccountPage } from './pages/AccountPage.tsx'
import { InvitationPage } from './pages/InvitationPage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { MessagesPage } from './pages/MessagesPage.tsx'
import { WorkoutPage } from './pages/WorkoutPage.tsx'
import { NotFoundPage } from './pages/MiscPages.tsx'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages.tsx'
import { MyProfilePage } from './pages/athlete/MyProfilePage.tsx'
import { TodayPage } from './pages/athlete/TodayPage.tsx'
import { AthletePage } from './pages/coach/AthletePage.tsx'
import { AthletesPage } from './pages/coach/AthletesPage.tsx'
import { LibraryPage } from './pages/coach/LibraryPage.tsx'
import { PlanningPage } from './pages/coach/PlanningPage.tsx'

export function App() {
  return (
    <Routes>
      <Route
        path="/connexion"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
      <Route path="/nouveau-mot-de-passe" element={<ResetPasswordPage />} />
      <Route path="/invitation/:token" element={<InvitationPage />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route
          path="athletes"
          element={
            <RequireRole role="coach">
              <AthletesPage />
            </RequireRole>
          }
        />
        <Route
          path="athletes/:athleteId"
          element={
            <RequireRole role="coach">
              <AthletePage tab="planning" />
            </RequireRole>
          }
        />
        <Route
          path="athletes/:athleteId/fiche"
          element={
            <RequireRole role="coach">
              <AthletePage tab="fiche" />
            </RequireRole>
          }
        />
        <Route
          path="planning"
          element={
            <RequireRole role="coach">
              <PlanningPage />
            </RequireRole>
          }
        />
        <Route
          path="seances-types"
          element={
            <RequireRole role="coach">
              <LibraryPage />
            </RequireRole>
          }
        />
        <Route
          path="aujourdhui"
          element={
            <RequireRole role="athlete">
              <TodayPage />
            </RequireRole>
          }
        />
        <Route
          path="mon-profil"
          element={
            <RequireRole role="athlete">
              <MyProfilePage />
            </RequireRole>
          }
        />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="seance/:workoutId" element={<WorkoutPage />} />
        <Route path="compte" element={<AccountPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
