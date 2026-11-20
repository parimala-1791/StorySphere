import { getSupabaseClient } from '../lib/supabase.js'
import { fetchStoryFeed } from './storyFeed.js'

function assertQuerySucceeded(result) {
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

export async function fetchStoryBySlug(slug) {
  const supabase = getSupabaseClient()
  const { data: story, error } = await supabase
    .from('stories')
    .select(
      'id, author_id, category_id, title, slug, excerpt, content, cover_path, published_at, created_at',
    )
    .eq('slug', slug)
    .eq('status', 'published')
    .eq('is_hidden', false)
    .maybeSingle()

  if (error) {
    throw error
  }
  if (!story) {
    return null
  }

  const [authorResult, categoriesResult, tagsResult, likesResult, commentsResult] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, full_name, avatar_path, bio')
        .eq('id', story.author_id)
        .maybeSingle(),
      supabase
        .from('story_categories')
        .select(
          'category_id, category:categories!story_categories_category_id_fkey(id, name, slug, sort_order, is_active)',
        )
        .eq('story_id', story.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('story_tags')
        .select('tag:tags(name, slug)')
        .eq('story_id', story.id),
      supabase
        .from('likes')
        .select('user_id', { count: 'exact', head: true })
        .eq('story_id', story.id),
      supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('story_id', story.id),
    ])

  for (const result of [authorResult, categoriesResult, tagsResult, likesResult, commentsResult]) {
    assertQuerySucceeded(result)
  }

  if (!authorResult.data) {
    throw new Error('The story author profile could not be found.')
  }

  const categories = categoriesResult.data
    .map(({ category }) => category)
    .filter(Boolean)
  if (story.category_id && !categories.some(({ id }) => id === story.category_id)) {
    const { data: legacyCategory, error: legacyCategoryError } = await supabase
      .from('categories')
      .select('id, name, slug, sort_order, is_active')
      .eq('id', story.category_id)
      .maybeSingle()
    if (legacyCategoryError) {
      throw legacyCategoryError
    }
    if (legacyCategory) {
      categories.push(legacyCategory)
    }
  }
  categories.sort(
    (left, right) =>
      left.sort_order - right.sort_order || left.name.localeCompare(right.name),
  )

  let coverUrl = ''
  let coverError = ''
  if (story.cover_path) {
    const { data: cover, error: coverUrlError } = await supabase.storage
      .from('story-covers')
      .createSignedUrl(story.cover_path, 3600)
    if (coverUrlError) {
      coverError = coverUrlError.message
    } else if (cover?.signedUrl) {
      coverUrl = cover.signedUrl
    } else {
      coverError = 'The story cover could not be opened.'
    }
  }

  return {
    ...story,
    categories,
    author: {
      ...authorResult.data,
      avatar_url: publicAvatarUrl(supabase, authorResult.data.avatar_path),
    },
    tags: tagsResult.data.map(({ tag }) => tag).filter(Boolean),
    cover_url: coverUrl,
    cover_error: coverError,
    likes_count: likesResult.count ?? 0,
    comments_count: commentsResult.count ?? 0,
  }
}

export async function fetchStoryComments(storyId) {
  const { data, error } = await getSupabaseClient()
    .from('comments')
    .select(
      'id, story_id, author_id, content, created_at, updated_at, author:profiles!comments_author_id_fkey(id, username, full_name, avatar_path)',
    )
    .eq('story_id', storyId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    throw error
  }
  if (!Array.isArray(data)) {
    throw new Error('The comments service returned an unexpected response.')
  }

  const supabase = getSupabaseClient()
  return data.map((comment) => ({
    ...comment,
    author: comment.author
      ? {
          ...comment.author,
          avatar_url: publicAvatarUrl(supabase, comment.author.avatar_path),
        }
      : null,
  }))
}

export async function fetchStoryInteractions(storyId, userId) {
  if (!userId) {
    return { liked: false, bookmarked: false }
  }

  const supabase = getSupabaseClient()
  const [likeResult, bookmarkResult] = await Promise.all([
    supabase
      .from('likes')
      .select('story_id')
      .eq('story_id', storyId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('bookmarks')
      .select('story_id')
      .eq('story_id', storyId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])
  assertQuerySucceeded(likeResult)
  assertQuerySucceeded(bookmarkResult)

  return {
    liked: Boolean(likeResult.data),
    bookmarked: Boolean(bookmarkResult.data),
  }
}

export async function setStoryLike(storyId, userId, shouldLike) {
  const supabase = getSupabaseClient()
  const result = shouldLike
    ? await supabase
        .from('likes')
        .upsert({ story_id: storyId }, { onConflict: 'user_id,story_id', ignoreDuplicates: true })
    : await supabase
        .from('likes')
        .delete()
        .eq('story_id', storyId)
        .eq('user_id', userId)

  if (result.error) {
    throw result.error
  }
}

export async function setStoryBookmark(storyId, userId, shouldBookmark) {
  const supabase = getSupabaseClient()
  const result = shouldBookmark
    ? await supabase
        .from('bookmarks')
        .upsert(
          { story_id: storyId },
          { onConflict: 'user_id,story_id', ignoreDuplicates: true },
        )
    : await supabase
        .from('bookmarks')
        .delete()
        .eq('story_id', storyId)
        .eq('user_id', userId)

  if (result.error) {
    throw result.error
  }
}

export async function createStoryComment(storyId, content) {
  const cleanContent = content.trim()
  if (cleanContent.length < 1 || cleanContent.length > 3000) {
    throw new Error('Comments must be between 1 and 3000 characters.')
  }

  const { data, error } = await getSupabaseClient()
    .from('comments')
    .insert({ story_id: storyId, content: cleanContent })
    .select(
      'id, story_id, author_id, content, created_at, updated_at, author:profiles!comments_author_id_fkey(id, username, full_name, avatar_path)',
    )
    .single()

  if (error) {
    throw error
  }
  if (!data) {
    throw new Error('Your comment was not returned after saving.')
  }

  const supabase = getSupabaseClient()
  return {
    ...data,
    author: data.author
      ? {
          ...data.author,
          avatar_url: publicAvatarUrl(supabase, data.author.avatar_path),
        }
      : null,
  }
}

export async function recordStoryRead(storyId) {
  const { error } = await getSupabaseClient().rpc('record_story_read', {
    p_story_id: storyId,
  })

  if (error) {
    throw error
  }
}

export async function fetchRelatedStories(categorySlugs, currentStoryId) {
  const stories = await fetchStoryFeed({
    categorySlugs: categorySlugs || null,
    limit: 8,
  })
  return stories.filter((story) => story.story_id !== currentStoryId).slice(0, 3)
}
