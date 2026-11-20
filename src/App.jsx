import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth.jsx'
import { SiteLayout } from './components/SiteLayout.jsx'
import { AccountPage } from './pages/AccountPage.jsx'
import { AdminPage } from './pages/AdminPage.jsx'
import { AuthCallbackPage } from './pages/AuthCallbackPage.jsx'
import { AuthPage } from './pages/AuthPage.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { ExplorePage } from './pages/ExplorePage.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { PlaceholderPage } from './pages/PlaceholderPage.jsx'
import { PublicProfilePage } from './pages/PublicProfilePage.jsx'
import { RequireAdmin } from './components/RequireAdmin.jsx'
import { StoryPage } from './pages/StoryPage.jsx'
import { WritingPage } from './pages/WritingPage.jsx'

function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/story/:slug" element={<StoryPage />} />
        <Route path="/writers/:username" element={<PublicProfilePage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/sign-in" element={<AuthPage mode="sign-in" />} />
        <Route path="/sign-up" element={<AuthPage mode="sign-up" />} />
        <Route element={<RequireAuth />}>
          <Route path="/account" element={<AccountPage />} />
          <Route path="/write" element={<WritingPage key="new-story" />} />
          <Route path="/write/:slug" element={<WritingPage key="edit-story" />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
        <Route
          path="*"
          element={
            <PlaceholderPage
              eyebrow="A quiet little detour"
              title="This page is not here yet"
              description="The page may be taking shape, or the address may be mistyped."
            />
          }
        />
      </Route>
    </Routes>
  )
}

export default App
