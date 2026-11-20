import { LoaderCircle } from 'lucide-react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'

export function RequireAuth() {
  const { session, isLoading, initializationError } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div aria-busy="true" className="auth-loading">
        <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={24} />
        <span>Restoring your space…</span>
      </div>
    )
  }

  if (initializationError) {
    return (
      <section className="auth-state">
        <p className="eyebrow">
          <span className="eyebrow__rule" />
          Session unavailable
        </p>
        <h1>We could not restore your session.</h1>
        <p>{initializationError}</p>
        <Link className="button" to="/sign-in">
          Continue to sign in
        </Link>
      </section>
    )
  }

  if (!session) {
    return <Navigate replace state={{ from: location }} to="/sign-in" />
  }

  return <Outlet />
}
