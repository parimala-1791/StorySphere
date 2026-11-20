import { getSupabaseClient } from '../lib/supabase.js'

export async function fetchStoryFeed({
  search = null,
  categorySlugs = null,
  categorySlug = null,
  sort = 'newest',
  limit = 12,
  offset = 0,
  featuredOnly = false,
  recentDays = null,
} = {}) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('get_story_feed_v2', {
    p_search: search,
    p_category_slugs: categorySlugs || (categorySlug ? [categorySlug] : null),
    p_sort: sort,
    p_limit: limit,
    p_offset: offset,
    p_featured_only: featuredOnly,
    p_recent_days: recentDays,
  })

  if (error) {
    throw error
  }
  if (!Array.isArray(data)) {
    throw new Error('The story feed returned an unexpected response.')
  }

  return resolveStoryCovers(data, supabase)
}

export async function resolveStoryCovers(stories, supabase = getSupabaseClient()) {
  if (!Array.isArray(stories)) {
    throw new Error('The story feed returned an unexpected response.')
  }

  return Promise.all(
    stories.map(async (story) => {
      if (!story.story_cover_path) {
        return { ...story, cover_url: '', cover_error: '' }
      }

      const { data: cover, error: coverError } = await supabase.storage
        .from('story-covers')
        .createSignedUrl(story.story_cover_path, 3600)

      if (coverError) {
        return {
          ...story,
          cover_url: '',
          cover_error: coverError.message,
        }
      }
      if (!cover?.signedUrl) {
        throw new Error(`The cover for "${story.story_title}" could not be opened.`)
      }

      return {
        ...story,
        cover_url: cover.signedUrl,
        cover_error: '',
      }
    }),
  )
}

export async function fetchCategories() {
  const { data, error } = await getSupabaseClient()
    .from('categories')
    .select('id, name, slug, description')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    throw error
  }
  if (!Array.isArray(data)) {
    throw new Error('The category list returned an unexpected response.')
  }

  return data
}
