import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' })
  }

  const authorization = request.headers.get('Authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) {
    return jsonResponse(401, { error: 'Sign in to continue.' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Admin user management is missing required Supabase secrets.')
    return jsonResponse(500, { error: 'Administrator services are not configured.' })
  }

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    })
    const { data: authData, error: authError } = await userClient.auth.getUser(token)
    if (authError || !authData.user) {
      return jsonResponse(401, { error: 'Your session is invalid or has expired.' })
    }

    const { data: isAdmin, error: accessError } = await userClient.rpc('is_admin')
    if (accessError) {
      console.error('Admin role verification failed:', accessError.message)
      return jsonResponse(503, { error: 'Administrator access could not be verified.' })
    }
    if (isAdmin !== true) {
      return jsonResponse(403, { error: 'Administrator access is required.' })
    }

    let payload: Record<string, unknown>
    try {
      payload = await request.json()
    } catch {
      return jsonResponse(400, { error: 'The request body must be valid JSON.' })
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    if (payload.action === 'list-users') {
      const page = Number(payload.page)
      if (!Number.isInteger(page) || page < 1 || page > 10000) {
        return jsonResponse(400, { error: 'The requested user page is invalid.' })
      }

      const { data, error } = await serviceClient.auth.admin.listUsers({
        page,
        perPage: 50,
      })
      if (error) {
        console.error('Could not list authentication users:', error.message)
        return jsonResponse(502, { error: 'User accounts could not be loaded.' })
      }
      return jsonResponse(200, {
        users: data.users.map((account) => ({
          id: account.id,
          email: account.email || '',
          created_at: account.created_at,
          last_sign_in_at: account.last_sign_in_at || null,
          banned_until: account.banned_until || null,
        })),
      })
    }

    if (
      !['suspend-user', 'restore-user'].includes(String(payload.action)) ||
      !isUuid(payload.userId)
    ) {
      return jsonResponse(400, { error: 'The requested account operation is invalid.' })
    }
    if (payload.userId === authData.user.id) {
      return jsonResponse(400, { error: 'You cannot suspend or restore your own account.' })
    }

    if (payload.action === 'suspend-user') {
      const { data: targetIsAdmin, error: targetRoleError } = await serviceClient.rpc(
        'is_user_admin',
        { p_user_id: payload.userId },
      )
      if (targetRoleError) {
        console.error('Could not verify the target account role:', targetRoleError.message)
        return jsonResponse(503, { error: 'The target account role could not be verified.' })
      }
      if (targetIsAdmin === true) {
        return jsonResponse(409, { error: 'Administrator accounts cannot be suspended here.' })
      }
    }

    const { data: targetData, error: targetError } =
      await serviceClient.auth.admin.getUserById(payload.userId)
    if (targetError || !targetData.user) {
      return jsonResponse(404, { error: 'The requested account could not be found.' })
    }

    const banDuration = payload.action === 'suspend-user' ? '876000h' : 'none'
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(
      payload.userId,
      { ban_duration: banDuration },
    )
    if (updateError) {
      console.error('Could not update the authentication account:', updateError.message)
      return jsonResponse(502, { error: 'The account status could not be changed.' })
    }

    return jsonResponse(200, {
      userId: payload.userId,
      isSuspended: payload.action === 'suspend-user',
    })
  } catch (error) {
    console.error('Admin user management request failed:', error)
    return jsonResponse(500, { error: 'The administrator operation could not be completed.' })
  }
})
