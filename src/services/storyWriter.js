import { getSupabaseClient } from '../lib/supabase.js'

export const STORY_COVER_LIMIT = 5 * 1024 * 1024
export const STORY_COVER_TYPES = {
  'image/avif': 'avif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const STORY_FIELDS =
  'id, author_id, category_id, title, slug, excerpt, content, cover_path, status, published_at, created_at, updated_at'

function createStorySlug(title) {
  const base = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '')
  const suffix = crypto.randomUUID().slice(0, 8)

  return `${base || 'story'}-${suffix}`
}

export async function fetchWritingOptions() {
  const supabase = getSupabaseClient()
  const [categoriesResult, tagsResult] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, slug, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase.from('tags').select('id, name, slug').order('name', { ascending: true }),
  ])

  if (categoriesResult.error) {
    throw categoriesResult.error
  }
  if (tagsResult.error) {
    throw tagsResult.error
  }
  if (!Array.isArray(categoriesResult.data) || !Array.isArray(tagsResult.data)) {
    throw new Error('Writing categories and tags returned an unexpected response.')
  }

  return { categories: categoriesResult.data, tags: tagsResult.data }
}

export async function fetchWriterStory(slug, userId) {
  const supabase = getSupabaseClient()
  const { data: story, error } = await supabase
    .from('stories')
    .select(STORY_FIELDS)
    .eq('slug', slug)
    .eq('author_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }
  if (!story) {
    return null
  }

  const [categoryResult, storyTagResult, coverResult] = await Promise.all([
    supabase
      .from('story_categories')
      .select(
        'category_id, category:categories!story_categories_category_id_fkey(id, name, slug, is_active, sort_order)',
      )
      .eq('story_id', story.id)
      .order('created_at', { ascending: true }),
    supabase.from('story_tags').select('tag_id').eq('story_id', story.id),
    story.cover_path
      ? supabase.storage.from('story-covers').createSignedUrl(story.cover_path, 3600)
      : Promise.resolve({ data: null, error: null }),
  ])

  if (categoryResult.error) {
    throw categoryResult.error
  }
  if (storyTagResult.error) {
    throw storyTagResult.error
  }

  const categories = categoryResult.data.map(({ category }) => category).filter(Boolean)
  const categoryIds = categoryResult.data.map(({ category_id }) => category_id)
  if (story.category_id) {
    const primaryCategoryIndex = categoryIds.indexOf(story.category_id)
    if (primaryCategoryIndex > 0) {
      categoryIds.splice(primaryCategoryIndex, 1)
      categoryIds.unshift(story.category_id)
    } else if (primaryCategoryIndex < 0) {
      categoryIds.unshift(story.category_id)
    }

    if (primaryCategoryIndex < 0) {
      const { data: legacyCategory, error: legacyCategoryError } = await supabase
        .from('categories')
        .select('id, name, slug, is_active, sort_order')
        .eq('id', story.category_id)
        .maybeSingle()
      if (legacyCategoryError) {
        throw legacyCategoryError
      }
      if (legacyCategory && !categories.some(({ id }) => id === legacyCategory.id)) {
        categories.unshift(legacyCategory)
      }
    }
  }

  return {
    ...story,
    category_ids: categoryIds,
    categories: categories.sort(
      (left, right) =>
        left.sort_order - right.sort_order || left.name.localeCompare(right.name),
    ),
    tag_ids: storyTagResult.data.map(({ tag_id }) => tag_id),
    cover_url: coverResult.data?.signedUrl || '',
    cover_error:
      coverResult.error?.message ||
      (story.cover_path && !coverResult.data?.signedUrl
        ? 'The signed cover link was not returned.'
        : ''),
  }
}

export async function createWriterDraft(userId, values) {
  const { data, error } = await getSupabaseClient()
    .from('stories')
    .insert({
      title: values.title,
      slug: createStorySlug(values.title),
      excerpt: values.excerpt,
      content: values.content,
      category_id: values.categoryIds?.[0] || null,
      status: 'draft',
    })
    .select(STORY_FIELDS)
    .single()

  if (error) {
    throw error
  }
  if (!data || data.author_id !== userId) {
    throw new Error('Your draft was not returned after saving.')
  }

  return data
}

export async function uploadWriterCover(userId, storyId, file) {
  const extension = STORY_COVER_TYPES[file.type]
  if (!extension || file.size > STORY_COVER_LIMIT) {
    throw new Error('Choose an AVIF, JPEG, PNG, or WebP cover no larger than 5 MB.')
  }

  const path = `${userId}/${storyId}/${crypto.randomUUID()}.${extension}`
  const { error } = await getSupabaseClient()
    .storage.from('story-covers')
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })

  if (error) {
    throw new Error(`Story cover upload failed: ${error.message}`)
  }

  return path
}

export async function updateWriterStory(storyId, userId, values) {
  const { data, error } = await getSupabaseClient()
    .from('stories')
    .update({
      title: values.title,
      excerpt: values.excerpt,
      content: values.content,
      cover_path: values.coverPath,
      status: values.status,
    })
    .eq('id', storyId)
    .eq('author_id', userId)
    .select(STORY_FIELDS)
    .single()

  if (error) {
    throw error
  }
  if (!data) {
    throw new Error('Your story was not returned after saving.')
  }

  return data
}

export async function syncWriterStoryCategories(storyId, categoryIds) {
  const { error } = await getSupabaseClient().rpc('set_story_categories', {
    p_story_id: storyId,
    p_category_ids: categoryIds,
  })

  if (error) {
    throw error
  }
}

export async function syncWriterStoryTags(storyId, tagIds) {
  const supabase = getSupabaseClient()
  const selectedIds = [...new Set(tagIds)]
  const { data: existingTags, error: existingError } = await supabase
    .from('story_tags')
    .select('tag_id')
    .eq('story_id', storyId)

  if (existingError) {
    throw existingError
  }

  const existingIds = existingTags.map(({ tag_id }) => tag_id)
  const additions = selectedIds.filter((id) => !existingIds.includes(id))
  const removals = existingIds.filter((id) => !selectedIds.includes(id))

  if (additions.length) {
    const { error } = await supabase
      .from('story_tags')
      .upsert(
        additions.map((tag_id) => ({ story_id: storyId, tag_id })),
        { onConflict: 'story_id,tag_id', ignoreDuplicates: true },
      )
    if (error) {
      throw error
    }
  }

  if (removals.length) {
    const { error } = await supabase
      .from('story_tags')
      .delete()
      .eq('story_id', storyId)
      .in('tag_id', removals)
    if (error) {
      throw error
    }
  }
}

export async function removeWriterCover(path) {
  if (!path) {
    return
  }
  const { error } = await getSupabaseClient().storage.from('story-covers').remove([path])
  if (error) {
    throw error
  }
}

export async function deleteWriterStory(story, userId) {
  const { data, error } = await getSupabaseClient()
    .from('stories')
    .delete()
    .eq('id', story.id)
    .eq('author_id', userId)
    .select('id')
    .maybeSingle()

  if (error) {
    throw error
  }
  if (!data) {
    throw new Error('The story was not found or you no longer have permission to delete it.')
  }

  if (story.cover_path) {
    try {
      await removeWriterCover(story.cover_path)
      return ''
    } catch (cleanupError) {
      return `The story was deleted, but its cover could not be removed: ${
        cleanupError instanceof Error ? cleanupError.message : 'Storage cleanup failed.'
      }`
    }
  }

  return ''
}
