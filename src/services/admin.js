import { getSupabaseClient } from '../lib/supabase.js'

function assertSucceeded(result) {
  if (result.error) {
    throw result.error
  }
}

async function assertFunctionSucceeded(result) {
  if (!result.error) {
    return
  }
  const response = result.error.context
  if (response instanceof Response) {
    const body = await response.clone().json().catch(() => null)
    if (typeof body?.error === 'string') {
      throw new Error(body.error)
    }
  }
  throw result.error
}

export async function checkAdminAccess() {
  const { data, error } = await getSupabaseClient().rpc('is_admin')
  if (error) {
    throw error
  }
  if (typeof data !== 'boolean') {
    throw new Error('The administrator access check returned an unexpected response.')
  }
  return data
}

export async function fetchAdminOverview() {
  const supabase = getSupabaseClient()
  const results = await Promise.all([
    supabase
      .from('stories')
      .select(
        'id, title, slug, status, is_hidden, is_featured, updated_at, author:profiles!stories_author_id_fkey(username, full_name)',
      )
      .order('updated_at', { ascending: false })
      .limit(50),
    supabase
      .from('categories')
      .select('id, name, slug, description, sort_order, is_active')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('stories').select('id', { count: 'exact', head: true }),
    supabase
      .from('stories')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published'),
    supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'reviewing']),
    supabase
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
  ])
  results.forEach(assertSucceeded)

  const [stories, categories, usersCount, storiesCount, publishedCount, openReportsCount, categoriesCount] =
    results

  return {
    stories: stories.data || [],
    categories: categories.data || [],
    stats: {
      users: usersCount.count ?? 0,
      stories: storiesCount.count ?? 0,
      published: publishedCount.count ?? 0,
      openReports: openReportsCount.count ?? 0,
      categories: categoriesCount.count ?? 0,
    },
  }
}

export async function fetchAdminReports(status = 'open') {
  let query = getSupabaseClient()
    .from('reports')
    .select(
      'id, reason, details, status, created_at, reporter:profiles!reports_reporter_id_fkey(username, full_name), story:stories!reports_story_id_fkey(id, title, slug, is_hidden, is_featured, author:profiles!stories_author_id_fkey(username, full_name)), comment:comments!reports_comment_id_fkey(id, content, is_hidden, author:profiles!comments_author_id_fkey(username, full_name), story:stories!comments_story_id_fkey(id, title, slug, is_hidden, is_featured))',
    )
    .order('created_at', { ascending: false })
    .limit(100)

  if (status !== 'all') {
    query = query.eq('status', status)
  }
  const { data, error } = await query
  if (error) {
    throw error
  }
  if (!Array.isArray(data)) {
    throw new Error('The moderation queue returned an unexpected response.')
  }
  return data
}

export async function fetchAdminUsers(page) {
  const result = await getSupabaseClient().functions.invoke('admin-user-management', {
    body: { action: 'list-users', page },
  })
  await assertFunctionSucceeded(result)
  const { data } = result
  if (!Array.isArray(data?.users)) {
    throw new Error('The administrator user list returned an unexpected response.')
  }

  const ids = data.users.map((account) => account.id)
  let profiles = []
  if (ids.length) {
    const result = await getSupabaseClient()
      .from('profiles')
      .select('id, username, full_name')
      .in('id', ids)
    if (result.error) {
      throw result.error
    }
    profiles = result.data || []
  }
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]))

  return {
    users: data.users.map((account) => ({
      ...account,
      profile: profilesById.get(account.id) || null,
    })),
    hasMore: data.users.length === 50,
  }
}

export async function setAdminUserSuspended(userId, isSuspended) {
  const result = await getSupabaseClient().functions.invoke('admin-user-management', {
    body: {
      action: isSuspended ? 'suspend-user' : 'restore-user',
      userId,
    },
  })
  await assertFunctionSucceeded(result)
}

export async function setReportedContentStatus(reportId, status) {
  const { error } = await getSupabaseClient().rpc('review_report', {
    p_report_id: reportId,
    p_status: status,
  })
  if (error) {
    throw error
  }
}

export async function setAdminStoryModeration(storyId, isHidden, isFeatured) {
  const { error } = await getSupabaseClient().rpc('set_story_moderation', {
    p_story_id: storyId,
    p_is_hidden: isHidden,
    p_is_featured: isFeatured,
  })
  if (error) {
    throw error
  }
}

export async function setAdminCommentModeration(commentId, isHidden) {
  const { error } = await getSupabaseClient().rpc('set_comment_moderation', {
    p_comment_id: commentId,
    p_is_hidden: isHidden,
  })
  if (error) {
    throw error
  }
}

export async function saveAdminCategory(category) {
  const name = category.name.trim()
  const slug = category.slug.trim().toLowerCase()
  const description = category.description.trim()
  const sortOrder = Number(category.sort_order)

  if (!name || name.length > 60) {
    throw new Error('Category names must be between 1 and 60 characters.')
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Use a lowercase, hyphen-separated category slug.')
  }
  if (description.length > 500) {
    throw new Error('Category descriptions must be 500 characters or fewer.')
  }
  if (!Number.isInteger(sortOrder)) {
    throw new Error('Category order must be a whole number.')
  }

  const supabase = getSupabaseClient()
  const values = {
    name,
    slug,
    description,
    sort_order: sortOrder,
  }
  const result = category.id
    ? await supabase
        .from('categories')
        .update({ ...values, is_active: category.is_active })
        .eq('id', category.id)
        .select('id')
        .single()
    : await supabase.from('categories').insert(values).select('id').single()

  if (result.error) {
    throw result.error
  }
  if (!result.data) {
    throw new Error('The category change was not confirmed by the database.')
  }
}

export async function setAdminCategoryActive(categoryId, isActive) {
  const { data, error } = await getSupabaseClient()
    .from('categories')
    .update({ is_active: isActive })
    .eq('id', categoryId)
    .select('id')
    .maybeSingle()
  if (error) {
    throw error
  }
  if (!data) {
    throw new Error('This category was not found or is no longer available.')
  }
}
