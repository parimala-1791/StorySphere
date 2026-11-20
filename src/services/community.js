import { getSupabaseClient } from '../lib/supabase.js'
import { resolveStoryCovers } from './storyFeed.js'

function assertSucceeded(result) {
  if (result.error) {
    throw result.error
  }
}

function publicAvatarUrl(supabase, avatarPath) {
  if (!avatarPath) {
    return ''
  }

  const { data } = supabase.storage.from('profile-pictures').getPublicUrl(avatarPath)
  return data.publicUrl
}

export async function fetchPublicProfile(username) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_path, bio, created_at')
    .eq('username', username.toLowerCase())
    .maybeSingle()

  if (error) {
    throw error
  }
  if (!data) {
    return null
  }

  return {
    ...data,
    avatar_url: publicAvatarUrl(supabase, data.avatar_path),
  }
}

export async function fetchProfileStats(profileId, currentUserId) {
  const supabase = getSupabaseClient()
  const followerQuery = supabase
    .from('follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('followed_id', profileId)
  const followingQuery = supabase
    .from('follows')
    .select('followed_id', { count: 'exact', head: true })
    .eq('follower_id', profileId)
  const storiesQuery = supabase
    .from('stories')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', profileId)
    .eq('status', 'published')
    .eq('is_hidden', false)
  const followStateQuery =
    currentUserId && currentUserId !== profileId
      ? supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', currentUserId)
          .eq('followed_id', profileId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })

  const [followersResult, followingResult, storiesResult, followStateResult] =
    await Promise.all([followerQuery, followingQuery, storiesQuery, followStateQuery])

  for (const result of [
    followersResult,
    followingResult,
    storiesResult,
    followStateResult,
  ]) {
    assertSucceeded(result)
  }

  return {
    followers: followersResult.count ?? 0,
    following: followingResult.count ?? 0,
    stories: storiesResult.count ?? 0,
    isFollowing: Boolean(followStateResult.data),
  }
}

export async function fetchProfileStories(username, limit = 12, offset = 0) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('get_profile_story_feed_v2', {
    p_username: username,
    p_limit: limit,
    p_offset: offset,
  })

  if (error) {
    throw error
  }
  if (!Array.isArray(data)) {
    throw new Error('The writer story feed returned an unexpected response.')
  }

  return resolveStoryCovers(data, supabase)
}

export async function setWriterFollow(profileId, userId, shouldFollow) {
  const supabase = getSupabaseClient()
  if (profileId === userId) {
    throw new Error('You cannot follow your own profile.')
  }

  const result = shouldFollow
    ? await supabase
        .from('follows')
        .upsert(
          { followed_id: profileId },
          { onConflict: 'follower_id,followed_id', ignoreDuplicates: true },
        )
    : await supabase
        .from('follows')
        .delete()
        .eq('follower_id', userId)
        .eq('followed_id', profileId)

  if (result.error) {
    throw result.error
  }
}

export async function fetchDashboardData(userId) {
  const supabase = getSupabaseClient()
  const results = await Promise.all([
    supabase
      .from('stories')
      .select('id, title, slug, status, updated_at, published_at')
      .eq('author_id', userId)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('stories')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', userId)
      .eq('status', 'published'),
    supabase
      .from('stories')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', userId)
      .eq('status', 'draft'),
    supabase
      .from('likes')
      .select('story_id, stories!inner(author_id)', { count: 'exact', head: true })
      .eq('stories.author_id', userId),
    supabase
      .from('comments')
      .select('id, stories!inner(author_id)', { count: 'exact', head: true })
      .eq('stories.author_id', userId)
      .eq('is_hidden', false),
    supabase
      .from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('followed_id', userId),
    supabase
      .from('follows')
      .select('followed_id', { count: 'exact', head: true })
      .eq('follower_id', userId),
    supabase
      .from('bookmarks')
      .select(
        'created_at, story:stories!inner(id, slug, title, excerpt, published_at, author:profiles!stories_author_id_fkey(username, full_name))',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('reading_history')
      .select(
        'last_read_at, read_count, story:stories!inner(id, slug, title, author:profiles!stories_author_id_fkey(username, full_name))',
      )
      .eq('user_id', userId)
      .order('last_read_at', { ascending: false })
      .limit(8),
    supabase
      .from('notifications')
      .select(
        'id, actor_id, notification_type, story_id, comment_id, is_read, created_at, actor:profiles!notifications_actor_id_fkey(full_name, username), story:stories!notifications_story_id_fkey(title, slug)',
      )
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('bookmarks')
      .select('story_id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('reading_history')
      .select('story_id', { count: 'exact', head: true })
      .eq('user_id', userId),
  ])

  results.forEach(assertSucceeded)
  const [
    stories,
    publishedStories,
    drafts,
    likes,
    comments,
    followers,
    following,
    bookmarks,
    history,
    notifications,
    bookmarkCount,
    historyCount,
  ] = results

  return {
    stories: stories.data || [],
    bookmarks: bookmarks.data || [],
    history: history.data || [],
    notifications: notifications.data || [],
    stats: {
      published: publishedStories.count ?? 0,
      drafts: drafts.count ?? 0,
      likes: likes.count ?? 0,
      comments: comments.count ?? 0,
      followers: followers.count ?? 0,
      following: following.count ?? 0,
      bookmarks: bookmarkCount.count ?? 0,
      history: historyCount.count ?? 0,
    },
  }
}

export async function markNotificationRead(notificationId, userId) {
  const { data, error } = await getSupabaseClient()
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('recipient_id', userId)
    .select('id')
    .maybeSingle()

  if (error) {
    throw error
  }
  if (!data) {
    throw new Error('This notification was not found or is no longer available.')
  }
}
