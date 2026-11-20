import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../auth/useAuth.js'
import { BrandMark } from './BrandMark.jsx'
import { isSupabaseConfigured } from '../lib/supabase.js'
import { checkAdminAccess } from '../services/admin.js'

export function SiteLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [logoutMessage, setLogoutMessage] = useState('')
  const [isSigningOut, setIsSigningOut] = useState(false)
  const { authCallback, session, isLoading, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [adminCheck, setAdminCheck] = useState({ userId: '', isAdmin: false, error: '' })
  const userId = session?.user?.id || ''
  const handledCallback = useRef('')

  useEffect(() => {
    if (authCallback.status === 'idle') {
      handledCallback.current = ''
      return
    }

    if (
      authCallback.status === 'success' &&
      !isLoading &&
      session &&
      handledCallback.current !== 'success'
    ) {
      handledCallback.current = 'success'
      navigate('/dashboard', { replace: true })
    } else if (
      authCallback.status === 'error' &&
      location.pathname !== '/auth/callback' &&
      handledCallback.current !== 'error'
    ) {
      handledCallback.current = 'error'
      navigate('/auth/callback', { replace: true })
    }
  }, [authCallback.status, isLoading, location.pathname, navigate, session])

  useEffect(() => {
    if (!userId) {
      return undefined
    }

    let active = true
    checkAdminAccess()
      .then((isAdmin) => {
        if (active) {
          setAdminCheck({ userId, isAdmin, error: '' })
        }
      })
      .catch((error) => {
        if (active) {
          setAdminCheck({
            userId,
            isAdmin: false,
            error: error instanceof Error ? error.message : 'Administrator access is unavailable.',
          })
        }
      })

    return () => {
      active = false
    }
  }, [userId])

  function closeMenu() {
    setMenuOpen(false)
  }

  async function handleSignOut() {
    setLogoutError('')
    setLogoutMessage('')
    setIsSigningOut(true)
    try {
      await signOut()
      setLogoutMessage('You have signed out.')
      closeMenu()
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : 'Sign out failed. Please try again.',
      )
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link
          aria-label="Story Sphere home"
          className="site-header__brand"
          onClick={closeMenu}
          to="/"
        >
          <BrandMark />
        </Link>
        <button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="menu-toggle"
          onClick={() => setMenuOpen((isOpen) => !isOpen)}
          type="button"
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <nav
          aria-label="Main navigation"
          className={`site-nav${menuOpen ? ' site-nav--open' : ''}`}
        >
          <NavLink
            className={({ isActive }) =>
              `site-nav__link${isActive ? ' site-nav__link--active' : ''}`
            }
            onClick={closeMenu}
            to="/explore"
          >
            Explore stories
          </NavLink>
          {isLoading ? (
            <span className="site-nav__loading">Restoring your space…</span>
          ) : session ? (
            <>
              {adminCheck.userId === userId && adminCheck.isAdmin && (
                <NavLink
                  className={({ isActive }) =>
                    `site-nav__link${isActive ? ' site-nav__link--active' : ''}`
                  }
                  onClick={closeMenu}
                  to="/admin"
                >
                  <ShieldCheck aria-hidden="true" size={15} />
                  Admin
                </NavLink>
              )}
              {adminCheck.userId === userId && adminCheck.error && (
                <span className="site-nav__loading" role="status">
                  Administrator access could not be checked.
                </span>
              )}
              <NavLink
                className={({ isActive }) =>
                  `site-nav__link${isActive ? ' site-nav__link--active' : ''}`
                }
                onClick={closeMenu}
                to="/dashboard"
              >
                Dashboard
              </NavLink>
              <NavLink
                className={({ isActive }) =>
                  `site-nav__link${isActive ? ' site-nav__link--active' : ''}`
                }
                onClick={closeMenu}
                to="/account"
              >
                My profile
              </NavLink>
              <button
                className="site-nav__link site-nav__button"
                disabled={isSigningOut}
                onClick={handleSignOut}
                type="button"
              >
                <LogOut aria-hidden="true" size={15} />
                {isSigningOut ? 'Signing out…' : 'Sign out'}
              </button>
            </>
          ) : (
            <NavLink
              className={({ isActive }) =>
                `site-nav__link${isActive ? ' site-nav__link--active' : ''}`
              }
              onClick={closeMenu}
              to="/sign-in"
            >
              Sign in
            </NavLink>
          )}
          <Link className="button button--small" onClick={closeMenu} to="/write">
            Start writing
          </Link>
        </nav>
      </header>

      <main id="main-content">
        {!isSupabaseConfigured && (
          <div className="setup-notice" role="status">
            <span className="setup-notice__dot" aria-hidden="true" />
            <span>
              Supabase is not configured yet. Add your project URL and publishable key
              to <code>.env.local</code> when your project is ready.
            </span>
          </div>
        )}
        {logoutError && (
          <div className="global-feedback global-feedback--error" role="alert">
            {logoutError}
          </div>
        )}
        {logoutMessage && (
          <div className="global-feedback" role="status">
            {logoutMessage}
          </div>
        )}
        <Outlet />
      </main>

      <footer className="site-footer">
        <Link aria-label="Story Sphere home" className="site-footer__brand" to="/">
          <BrandMark />
          <span>Every voice has a place here.</span>
        </Link>
        <span className="site-footer__copyright">A community for the stories we carry.</span>
      </footer>
    </div>
  )
}
