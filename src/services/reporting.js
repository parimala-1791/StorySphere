import { getSupabaseClient } from '../lib/supabase.js'

const reportReasons = new Set([
  'spam',
  'harassment',
  'hate',
  'explicit',
  'copyright',
  'other',
])

export async function createContentReport({ targetType, targetId, reason, details = '' }) {
  if (!['story', 'comment'].includes(targetType)) {
    throw new Error('Choose a story or comment to report.')
  }
  if (!targetId || !reportReasons.has(reason)) {
    throw new Error('Choose a valid report reason.')
  }

  const cleanDetails = details.trim()
  if (cleanDetails.length > 2000) {
    throw new Error('Report details must be 2000 characters or fewer.')
  }

  const { error } = await getSupabaseClient()
    .from('reports')
    .insert({
      story_id: targetType === 'story' ? targetId : null,
      comment_id: targetType === 'comment' ? targetId : null,
      reason,
      details: cleanDetails,
    })

  if (error?.code === '23505') {
    throw new Error('You already have an open report for this content.')
  }
  if (error) {
    throw error
  }
}
