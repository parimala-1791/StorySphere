const authParameterNames = [
  'access_token',
  'code',
  'error',
  'error_code',
  'error_description',
  'expires_at',
  'expires_in',
  'provider_refresh_token',
  'provider_token',
  'refresh_token',
  'token_hash',
  'token_type',
  'type',
]

let pendingCallback

export function getAuthCallbackUrl() {
  return new URL('/auth/callback', window.location.origin).toString()
}

export function readAuthCallbackUrl() {
  if (typeof window === 'undefined') {
    return { hasCallback: false }
  }

  const query = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const get = (name) => query.get(name) || hash.get(name)
  const error = get('error_description') || get('error') || get('error_code')
  const code = get('code')
  const tokenHash = get('token_hash')
  const accessToken = get('access_token')
  const refreshToken = get('refresh_token')
  const hasCallback = Boolean(error || code || tokenHash || accessToken || refreshToken)

  return {
    hasCallback,
    error,
    code,
    tokenHash,
    type: get('type'),
    accessToken,
    refreshToken,
    key:
      code ||
      tokenHash ||
      (accessToken || refreshToken ? `${accessToken || ''}:${refreshToken || ''}` : '') ||
      error ||
      'auth-callback',
  }
}

export function clearAuthCallbackUrl() {
  if (typeof window === 'undefined') {
    return
  }

  const callback = readAuthCallbackUrl()
  if (!callback.hasCallback) {
    return
  }

  const url = new URL(window.location.href)
  for (const name of authParameterNames) {
    url.searchParams.delete(name)
  }

  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const hasAuthHash = authParameterNames.some((name) => hash.has(name))
  if (hasAuthHash) {
    for (const name of authParameterNames) {
      hash.delete(name)
    }
    url.hash = hash.size ? hash.toString() : ''
  }

  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  )
}

async function exchangeCallback(client, callback) {
  if (callback.error) {
    throw new Error(callback.error)
  }

  let result
  if (callback.code) {
    result = await client.auth.exchangeCodeForSession(callback.code)
  } else if (callback.tokenHash) {
    if (!callback.type) {
      throw new Error('The confirmation link is missing its verification type.')
    }
    result = await client.auth.verifyOtp({
      token_hash: callback.tokenHash,
      type: callback.type,
    })
  } else if (callback.accessToken && callback.refreshToken) {
    result = await client.auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    })
  } else {
    throw new Error('The confirmation link did not contain usable authentication details.')
  }

  if (result.error) {
    throw result.error
  }
  if (result.data.session) {
    return result.data.session
  }

  const { data, error } = await client.auth.getSession()
  if (error) {
    throw error
  }
  if (!data.session) {
    throw new Error('The confirmation completed, but no authenticated session was created.')
  }
  return data.session
}

export function completeAuthCallback(client, callback) {
  if (pendingCallback?.key === callback.key) {
    return pendingCallback.promise
  }

  const promise = exchangeCallback(client, callback).finally(() => {
    if (pendingCallback?.promise === promise) {
      pendingCallback = undefined
    }
  })
  pendingCallback = { key: callback.key, promise }
  return promise
}
