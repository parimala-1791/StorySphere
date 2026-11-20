import { useState } from 'react'
import { Flag, LoaderCircle, Send } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { createContentReport } from '../services/reporting.js'

const reasons = [
  ['spam', 'Spam or misleading'],
  ['harassment', 'Harassment or bullying'],
  ['hate', 'Hateful content'],
  ['explicit', 'Explicit content'],
  ['copyright', 'Copyright concern'],
  ['other', 'Something else'],
]

function errorText(error) {
  return error instanceof Error ? error.message : 'Your report could not be submitted.'
}

export function ReportControl({ targetId, targetType }) {
  const { user } = useAuth()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!user || isSubmitting) {
      return
    }
    setError('')
    setMessage('')
    setIsSubmitting(true)
    try {
      await createContentReport({ targetType, targetId, reason, details })
      setMessage('Thank you. Your report has been sent to the moderation team.')
      setDetails('')
      setReason('')
    } catch (submitError) {
      setError(errorText(submitError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="report-control">
      {user ? (
        <button
          aria-expanded={isOpen}
          className="report-control__trigger"
          onClick={() => {
            setIsOpen((open) => !open)
            setError('')
          }}
          type="button"
        >
          <Flag aria-hidden="true" size={14} />
          {isOpen ? 'Close report' : 'Report'}
        </button>
      ) : (
        <Link
          className="report-control__trigger"
          state={{ from: location }}
          to="/sign-in"
        >
          <Flag aria-hidden="true" size={14} />
          Sign in to report
        </Link>
      )}
      {isOpen && user && (
        <form className="report-form" onSubmit={handleSubmit}>
          <label htmlFor={`report-reason-${targetType}-${targetId}`}>Reason</label>
          <select
            id={`report-reason-${targetType}-${targetId}`}
            onChange={(event) => setReason(event.target.value)}
            required
            value={reason}
          >
            <option value="">Choose a reason</option>
            {reasons.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label htmlFor={`report-details-${targetType}-${targetId}`}>
            Additional details <span>(optional)</span>
          </label>
          <textarea
            id={`report-details-${targetType}-${targetId}`}
            maxLength={2000}
            onChange={(event) => setDetails(event.target.value)}
            rows={3}
            value={details}
          />
          <span className="report-form__count">{details.length}/2000</span>
          <button className="button button--small" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <>
                <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={14} />
                Sending…
              </>
            ) : (
              <>
                <Send aria-hidden="true" size={14} />
                Send report
              </>
            )}
          </button>
          {error && (
            <p className="reader-feedback reader-feedback--error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="reader-feedback" role="status">
              {message}
            </p>
          )}
        </form>
      )}
    </div>
  )
}
