import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, LoaderCircle, Mail } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { getAuthCallbackUrl } from '../auth/authCallback.js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase.js'

function errorText(error) {
  return error instanceof Error ? error.message : 'A new confirmation email could not be requested.'
}

export function AuthCallbackPage() {
  const { authCallback, clearAuthCallback, isLoading, session } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')

  useEffect(() => {
    if (!isLoading && session && authCallback.status !== 'error') {
      navigate('/dashboard', { replace: true })
    }
  }, [authCallback.status, isLoading, navigate, session])

  async function handleResend(event) {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || isSubmitting) {
      return
    }

    setResendError('')
    setResendMessage('')
    setIsSubmitting(true)
    try {
      const { error } = await getSupabaseClient().auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: { emailRedirectTo: getAuthCallbackUrl() },
      })
      if (error) {
        throw error
      }
      setResendMessage(
        'If this address has an account awaiting confirmation, a new link is on its way.',
      )
    } catch (error) {
      setResendError(errorText(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  function returnToSignIn() {
    clearAuthCallback()
    navigate('/sign-in', { replace: true })
  }

  if (
    isLoading ||
    authCallback.status === 'processing' ||
    (session && authCallback.status !== 'error')
  ) {
    return (
      <div aria-busy="true" className="auth-loading">
        <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={24} />
        <span>Confirming your email and restoring your space…</span>
      </div>
    )
  }

  return (
    <section className="auth-state auth-callback">
      <p className="eyebrow">
        <span className="eyebrow__rule" />
        Email confirmation
      </p>
      <h1>
        {authCallback.status === 'error'
          ? 'This confirmation link needs attention.'
          : 'Confirm your email to continue.'}
      </h1>
      <p>
        {authCallback.error ||
          'The confirmation response was missing or incomplete. You can request a fresh confirmation email below.'}
      </p>
      {!isSupabaseConfigured && (
        <div className="form-message form-message--notice" role="status">
          Authentication is unavailable until Supabase is configured.
        </div>
      )}
      <form className="auth-form auth-callback__form" onSubmit={handleResend}>
        <div className="form-field">
          <label htmlFor="confirmation-email">Email address</label>
          <div className="text-input">
            <Mail aria-hidden="true" className="form-field__icon" size={17} />
            <input
              autoComplete="email"
              id="confirmation-email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </div>
        </div>
        <button
          className="button auth-form__submit"
          disabled={isSubmitting || !isSupabaseConfigured}
          type="submit"
        >
          {isSubmitting ? 'Sending…' : 'Request another confirmation email'}
          {!isSubmitting && <ArrowRight aria-hidden="true" size={17} />}
        </button>
      </form>
      {resendError && (
        <div className="form-message form-message--error" role="alert">
          {resendError}
        </div>
      )}
      {resendMessage && (
        <div className="form-message form-message--success" role="status">
          <CheckCircle2 aria-hidden="true" size={16} />
          {resendMessage}
        </div>
      )}
      <button className="text-link auth-callback__signin" onClick={returnToSignIn} type="button">
        Return to sign in
      </button>
      <Link className="auth-callback__home" onClick={clearAuthCallback} to="/">
        Back to Story Sphere
      </Link>
    </section>
  )
}
