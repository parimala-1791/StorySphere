import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './AuthContext.js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase.js'
import {
  clearAuthCallbackUrl,
  completeAuthCallback,
  readAuthCallbackUrl,
} from './authCallback.js'

function toMessage(error) {
  return error instanceof Error ? error.message : 'An unexpected authentication error occurred.'
}

function callbackErrorMessage(error) {
  const message = toMessage(error)
  if (/expired|invalid|already used|code verifier|pkce/i.test(message)) {
    return 'This confirmation link is invalid or has expired. Enter your email below to request another one.'
  }
  return `We could not complete email confirmation. ${message}`
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured)
  const [initializationError, setInitializationError] = useState('')
  const [authCallback, setAuthCallback] = useState(() => {
    const callback = readAuthCallbackUrl()
    if (!callback.hasCallback) {
      return { status: 'idle', error: '' }
    }
    return isSupabaseConfigured
      ? { status: 'processing', error: '' }
      : {
          status: 'error',
          error: 'Supabase is not configured, so this confirmation link cannot be processed.',
        }
  })

  useEffect(() => {
    if (!isSupabaseConfigured) {
      clearAuthCallbackUrl()
      return undefined
    }

    let active = true
    let authEventCount = 0
    let initialEventCount = 0
    let subscription

    Promise.resolve()
      .then(() => {
        if (!active) {
          return undefined
        }

        const client = getSupabaseClient()
        const callback = readAuthCallbackUrl()
        let callbackInProgress = callback.hasCallback
        const authListener = client.auth.onAuthStateChange((_event, nextSession) => {
          authEventCount += 1
          setSession(nextSession)
          setInitializationError('')
          if (!callbackInProgress) {
            setIsLoading(false)
          }
        })
        subscription = authListener.data.subscription

        if (callback.hasCallback) {
          let callbackSucceeded = false
          completeAuthCallback(client, callback)
            .then((nextSession) => {
              if (active) {
                callbackSucceeded = true
                setSession(nextSession)
                setInitializationError('')
                setAuthCallback({ status: 'success', error: '' })
              }
            })
            .catch((error) => {
              if (active) {
                setAuthCallback({
                  status: 'error',
                  error: callbackErrorMessage(error),
                })
              }
            })
            .finally(async () => {
              clearAuthCallbackUrl()
              const eventCountBeforeRestore = authEventCount
              try {
                const { data, error } = await client.auth.getSession()
                if (active && authEventCount === eventCountBeforeRestore) {
                  if (error && !callbackSucceeded) {
                    setInitializationError(error.message)
                  } else if (data.session) {
                    setSession(data.session)
                  }
                }
              } catch (error) {
                if (active && !callbackSucceeded) {
                  setInitializationError(toMessage(error))
                }
              }
              callbackInProgress = false
              if (active) {
                setIsLoading(false)
              }
            })
          return undefined
        }

        initialEventCount = authEventCount

        return client.auth.getSession().then(({ data, error }) => {
          if (!active) {
            return
          }

          if (error && authEventCount === initialEventCount) {
            setInitializationError(error.message)
          } else if (authEventCount === initialEventCount) {
            setSession(data.session)
          }
          setIsLoading(false)
        })
      })
      .catch((error) => {
        if (active && authEventCount === initialEventCount) {
          setInitializationError(toMessage(error))
          setIsLoading(false)
        }
      })

    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await getSupabaseClient().auth.signOut()
    if (error) {
      throw error
    }
    setAuthCallback({ status: 'idle', error: '' })
  }, [])

  const clearAuthCallback = useCallback(() => {
    setAuthCallback({ status: 'idle', error: '' })
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      initializationError,
      authCallback,
      clearAuthCallback,
      signOut,
    }),
    [session, isLoading, initializationError, authCallback, clearAuthCallback, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
