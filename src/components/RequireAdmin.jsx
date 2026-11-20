import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { checkAdminAccess } from '../services/admin.js'

function errorText(error) {
  return error instanceof Error ? error.message : 'Administrator access could not be checked.'
}

export function RequireAdmin() {
  const { user } = useAuth()
  const userId = user?.id || ''
  const [checkResult, setCheckResult] = useState({
    userId: '',
    retryCount: -1,
    isAdmin: false,
    error: '',
  })
  const [retryCount, setRetryCount] = useState(0)
  const isChecking =
    Boolean(userId) &&
    (checkResult.userId !== userId || checkResult.retryCount !== retryCount)

  useEffect(() => {
    if (!userId) {
      return undefined
    }

    let active = true
    checkAdminAccess()
      .then((isAdmin) => {
        if (active) {
          setCheckResult({ userId, retryCount, isAdmin, error: '' })
        }
      })
      .catch((error) => {
        if (active) {
          setCheckResult({ userId, retryCount, isAdmin: false, error: errorText(error) })
        }
      })

    return () => {
      active = false
    }
  }, [retryCount, userId])

  if (isChecking) {
    return (
      <div aria-busy="true" className="auth-loading admin-loading">
        <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={24} />
        <span>Verifying administrator access…</span>
      </div>
    )
  }

  if (checkResult.userId === userId && checkResult.retryCount === retryCount && checkResult.error) {
    return (
      <section className="admin-state" role="alert">
        <p className="eyebrow">
          <span className="eyebrow__rule" />
          Administrator access
        </p>
        <h1>We could not verify your access.</h1>
        <p>{checkResult.error}</p>
        <button
          className="button button--outline"
          onClick={() => setRetryCount((count) => count + 1)}
          type="button"
        >
          Try again
        </button>
      </section>
    )
  }

  if (
    checkResult.userId === userId &&
    checkResult.retryCount === retryCount &&
    !checkResult.isAdmin
  ) {
    return (
      <section className="admin-state" role="status">
        <p className="eyebrow">
          <span className="eyebrow__rule" />
          Restricted area
        </p>
        <h1>This space is for administrators.</h1>
        <p>Your account does not have the trusted administrator role required for this area.</p>
        <Link className="button button--outline" to="/dashboard">
          Return to your dashboard
        </Link>
      </section>
    )
  }

  return <Outlet />
}
