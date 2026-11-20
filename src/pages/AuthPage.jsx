import { useState } from 'react'
import {
  ArrowRight,
  AtSign,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  UserRound,
} from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { getAuthCallbackUrl } from '../auth/authCallback.js'
import { BrandMark } from '../components/BrandMark.jsx'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase.js'

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  minLength,
}) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input">
        <LockKeyhole aria-hidden="true" className="form-field__icon" size={17} />
        <input
          autoComplete={autoComplete}
          id={id}
          minLength={minLength}
          onChange={onChange}
          required
          type={visible ? 'text' : 'password'}
          value={value}
        />
        <button
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="password-input__toggle"
          onClick={onToggle}
          type="button"
        >
          {visible ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
        </button>
      </div>
    </div>
  )
}

export function AuthPage({ mode }) {
  const isSignUp = mode === 'sign-up'
  const { session, isLoading, initializationError } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  if (isLoading) {
    return (
      <div aria-busy="true" className="auth-loading">
        <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={24} />
        <span>Restoring your space…</span>
      </div>
    )
  }

  if (session) {
    return <Navigate replace to="/dashboard" />
  }

  function navigateAfterAuthentication() {
    const destination = location.state?.from?.pathname
    const safeDestination =
      typeof destination === 'string' &&
      destination.startsWith('/') &&
      !destination.startsWith('//')
        ? destination
        : '/dashboard'
    navigate(safeDestination, { replace: true })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setSuccessMessage('')

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedUsername = username.trim().toLowerCase()

    if (isSignUp) {
      if (!fullName.trim() || fullName.trim().length > 80) {
        setFormError('Enter your name using 1 to 80 characters.')
        return
      }

      if (!USERNAME_PATTERN.test(normalizedUsername)) {
        setFormError('Your username must be 3–30 characters: lowercase letters, numbers, or underscores.')
        return
      }

      if (password !== confirmPassword) {
        setFormError('Your passwords do not match.')
        return
      }
    }

    if (!isSupabaseConfigured) {
      setFormError('Connect a Supabase project in .env.local before creating an account.')
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = getSupabaseClient()

      if (isSignUp) {
        const { data: existingProfile, error: usernameError } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', normalizedUsername)
          .maybeSingle()

        if (usernameError) {
          throw usernameError
        }
        if (existingProfile) {
          setFormError('That username is already taken. Try another one.')
          return
        }

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              username: normalizedUsername,
            },
            emailRedirectTo: getAuthCallbackUrl(),
          },
        })

        if (error) {
          throw error
        }
        if (!data.user) {
          throw new Error('Supabase did not return a user for this sign-up.')
        }

        if (data.session) {
          navigateAfterAuthentication()
        } else {
          setSuccessMessage(
            'Your account was created. Confirm your email from the link we sent, and we will take you to your dashboard.',
          )
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })

        if (error) {
          throw error
        }
        if (!data.session) {
          throw new Error('Supabase did not start an authenticated session.')
        }
        navigateAfterAuthentication()
      }
    } catch (error) {
      setFormError(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-layout">
      <aside className="auth-aside">
        <Link aria-label="Story Sphere home" className="auth-aside__brand" to="/">
          <BrandMark />
        </Link>
        <div className="auth-aside__copy">
          <p className="eyebrow">
            <span className="eyebrow__rule" />
            {isSignUp ? 'A place for your words' : 'Welcome back'}
          </p>
          <h1>{isSignUp ? 'Your story has a place here.' : 'Come back to the stories.'}</h1>
          <p>
            {isSignUp
              ? 'Join a thoughtful community of readers and writers. Make a little room for what you have to say.'
              : 'Pick up where you left off, find a new voice, or return to the words you saved.'}
          </p>
        </div>
        <div aria-hidden="true" className="auth-aside__ornament">
          <span className="auth-aside__ornament-ring" />
          <span className="auth-aside__ornament-book">
            <BrandMark compact />
          </span>
          <span className="auth-aside__ornament-caption">Every voice belongs</span>
        </div>
      </aside>

      <div className="auth-panel">
        <div className="auth-panel__heading">
          <p className="eyebrow">
            <span className="eyebrow__rule" />
            {isSignUp ? 'Join Story Sphere' : 'Your reading room awaits'}
          </p>
          <h2>{isSignUp ? 'Create your account' : 'Sign in'}</h2>
          <p>
            {isSignUp
              ? 'A few details, then you can make yourself at home.'
              : 'Enter your details to continue to your space.'}
          </p>
        </div>

        {!isSupabaseConfigured && (
          <div className="form-message form-message--notice" role="status">
            Authentication is unavailable until Supabase is configured.
          </div>
        )}
        {initializationError && (
          <div className="form-message form-message--error" role="alert">
            Could not restore your previous session: {initializationError}
          </div>
        )}
        {formError && (
          <div className="form-message form-message--error" role="alert">
            {formError}
          </div>
        )}
        {successMessage && (
          <div className="form-message form-message--success" role="status">
            {successMessage}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignUp && (
            <>
              <div className="form-field">
                <label htmlFor="full-name">Full name</label>
                <div className="text-input">
                  <UserRound aria-hidden="true" className="form-field__icon" size={17} />
                  <input
                    autoComplete="name"
                    id="full-name"
                    maxLength={80}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    value={fullName}
                  />
                </div>
              </div>
              <div className="form-field">
                <label htmlFor="username">Username</label>
                <div className="text-input">
                  <AtSign aria-hidden="true" className="form-field__icon" size={17} />
                  <input
                    autoComplete="username"
                    id="username"
                    maxLength={30}
                    minLength={3}
                    onChange={(event) =>
                      setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                    }
                    pattern="[a-z0-9_]{3,30}"
                    required
                    value={username}
                  />
                </div>
                <span className="form-field__hint">3–30 lowercase letters, numbers, or underscores.</span>
              </div>
            </>
          )}

          <div className="form-field">
            <label htmlFor="email">Email address</label>
            <div className="text-input">
              <Mail aria-hidden="true" className="form-field__icon" size={17} />
              <input
                autoComplete="email"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </div>
          </div>

          <PasswordField
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            id="password"
            label="Password"
            onChange={(event) => setPassword(event.target.value)}
            onToggle={() => setPasswordVisible((visible) => !visible)}
            value={password}
            visible={passwordVisible}
            minLength={isSignUp ? 8 : undefined}
          />

          {isSignUp && (
            <PasswordField
              autoComplete="new-password"
              id="confirm-password"
              label="Confirm password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              onToggle={() => setPasswordVisible((visible) => !visible)}
              value={confirmPassword}
              visible={passwordVisible}
              minLength={8}
            />
          )}

          <button
            className="button auth-form__submit"
            disabled={isSubmitting || !isSupabaseConfigured}
            type="submit"
          >
            {isSubmitting
              ? 'Please wait…'
              : isSignUp
                ? 'Create account'
                : 'Sign in to Story Sphere'}
            {!isSubmitting && <ArrowRight aria-hidden="true" size={17} />}
          </button>
        </form>

        <p className="auth-panel__switch">
          {isSignUp ? 'Already have a space here?' : 'New to Story Sphere?'}{' '}
          <Link to={isSignUp ? '/sign-in' : '/sign-up'}>
            {isSignUp ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
      </div>
    </section>
  )
}
