import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Heart,
  Link2,
  LoaderCircle,
  MessageCircle,
  Send,
  Share2,
} from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { ReportControl } from '../components/ReportControl.jsx'
import { StoryGrid, StoryGridSkeleton } from '../components/StoryCard.jsx'
import {
  createStoryComment,
  fetchRelatedStories,
  fetchStoryBySlug,
  fetchStoryComments,
  fetchStoryInteractions,
  recordStoryRead,
  setStoryBookmark,
  setStoryLike,
} from '../services/storyReader.js'

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Publication date unavailable'
  }

  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function readingMinutes(content) {
  const words = content.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 220))
}

function displayError(error) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function Avatar({ author, size = 'regular' }) {
  return author?.avatar_url ? (
    <img
      alt=""
      className={`reader-avatar reader-avatar--${size}`}
      src={author.avatar_url}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`reader-avatar reader-avatar--${size} reader-avatar--initials`}
    >
      {initials(author?.full_name || 'Story author')}
    </span>
  )
}

function ReaderCover({ story }) {
  const [imageFailed, setImageFailed] = useState(false)

  if (story.cover_url && !imageFailed) {
    return (
      <img
        alt=""
        className="story-reader__cover-image"
        onError={() => setImageFailed(true)}
        src={story.cover_url}
      />
    )
  }

  return (
    <div className="story-reader__cover-fallback" role={story.cover_error || imageFailed ? 'status' : undefined}>
      <BookOpen aria-hidden="true" size={38} />
      <span>{story.cover_error || imageFailed ? 'Cover unavailable' : 'A story to discover'}</span>
    </div>
  )
}

function CommentItem({ comment, currentUserId }) {
  const author = comment.author
  const authorName =
    comment.author_id === currentUserId
      ? 'You'
      : author?.full_name || 'Community member'

  return (
    <article className="reader-comment">
      <Avatar author={author} size="small" />
      <div className="reader-comment__body">
        <div className="reader-comment__meta">
          <strong>{authorName}</strong>
          {author?.username && (
            <Link to={`/writers/${author.username}`}>@{author.username}</Link>
          )}
          <time dateTime={comment.created_at}>{formatDate(comment.created_at)}</time>
        </div>
        <p>{comment.content}</p>
        <ReportControl targetId={comment.id} targetType="comment" />
      </div>
    </article>
  )
}

export function StoryPage() {
  const { slug } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  const userId = user?.id
  const [storyResult, setStoryResult] = useState({ slug: '', story: null, error: '' })
  const isLoadingStory = storyResult.slug !== slug
  const story = isLoadingStory ? null : storyResult.story
  const storyError = isLoadingStory ? '' : storyResult.error
  const storyId = story?.id
  const [commentsResult, setCommentsResult] = useState({
    storyId: '',
    comments: [],
    error: '',
  })
  const isLoadingComments = Boolean(storyId) && commentsResult.storyId !== storyId
  const comments = commentsResult.storyId === storyId ? commentsResult.comments : []
  const commentsError =
    commentsResult.storyId === storyId ? commentsResult.error : ''
  const categorySlugs = useMemo(
    () => story?.categories?.map((category) => category.slug).filter(Boolean) || [],
    [story?.categories],
  )
  const relatedKey = JSON.stringify([storyId, categorySlugs])
  const [relatedResult, setRelatedResult] = useState({
    key: '',
    stories: [],
    error: '',
  })
  const isLoadingRelated = Boolean(storyId) && relatedResult.key !== relatedKey
  const relatedStories =
    relatedResult.key === relatedKey ? relatedResult.stories : []
  const relatedError = relatedResult.key === relatedKey ? relatedResult.error : ''
  const interactionKey = `${userId || ''}:${storyId || ''}`
  const [interactionResult, setInteractionResult] = useState({
    key: '',
    liked: false,
    bookmarked: false,
    error: '',
  })
  const interactionMatches = !userId || interactionResult.key === interactionKey
  const isLoadingInteractions = Boolean(userId && storyId && !interactionMatches)
  const liked = Boolean(userId && interactionMatches && interactionResult.liked)
  const bookmarked = Boolean(userId && interactionMatches && interactionResult.bookmarked)
  const [interactionPending, setInteractionPending] = useState('')
  const [interactionError, setInteractionError] = useState('')
  const [readingError, setReadingError] = useState({ key: '', error: '' })
  const currentReadingError =
    readingError.key === interactionKey ? readingError.error : ''
  const interactionFeedbackError =
    interactionError || interactionResult.error || currentReadingError
  const [commentText, setCommentText] = useState('')
  const [commentError, setCommentError] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const [shareError, setShareError] = useState('')
  const readRecorded = useRef(new Set())

  useEffect(() => {
    let active = true

    fetchStoryBySlug(slug)
      .then((result) => {
        if (active) {
          setStoryResult({ slug, story: result, error: '' })
        }
      })
      .catch((error) => {
        if (active) {
          setStoryResult({ slug, story: null, error: displayError(error) })
        }
      })

    return () => {
      active = false
    }
  }, [slug])

  useEffect(() => {
    if (!storyId) {
      return undefined
    }

    let active = true

    fetchStoryComments(storyId)
      .then((items) => {
        if (active) {
          setCommentsResult({ storyId, comments: items, error: '' })
        }
      })
      .catch((error) => {
        if (active) {
          setCommentsResult({
            storyId,
            comments: [],
            error: displayError(error),
          })
        }
      })

    return () => {
      active = false
    }
  }, [storyId])

  useEffect(() => {
    if (!storyId || !userId) {
      return undefined
    }

    let active = true

    fetchStoryInteractions(storyId, userId)
      .then((result) => {
        if (active) {
          setInteractionResult({ key: interactionKey, ...result, error: '' })
        }
      })
      .catch((error) => {
        if (active) {
          setInteractionResult({
            key: interactionKey,
            liked: false,
            bookmarked: false,
            error: displayError(error),
          })
        }
      })

    return () => {
      active = false
    }
  }, [interactionKey, storyId, userId])

  useEffect(() => {
    if (!storyId) {
      return undefined
    }

    let active = true

    fetchRelatedStories(categorySlugs, storyId)
      .then((items) => {
        if (active) {
          setRelatedResult({ key: relatedKey, stories: items, error: '' })
        }
      })
      .catch((error) => {
        if (active) {
          setRelatedResult({
            key: relatedKey,
            stories: [],
            error: displayError(error),
          })
        }
      })

    return () => {
      active = false
    }
  }, [categorySlugs, relatedKey, storyId])

  useEffect(() => {
    if (!storyId || !userId) {
      return undefined
    }

    const readKey = `${userId}:${storyId}`
    if (readRecorded.current.has(readKey)) {
      return undefined
    }
    readRecorded.current.add(readKey)

    let active = true
    recordStoryRead(storyId).catch((error) => {
      if (active) {
        setReadingError({
          key: readKey,
          error: `Reading history could not be saved: ${displayError(error)}`,
        })
      }
    })

    return () => {
      active = false
    }
  }, [storyId, userId])

  async function handleToggleLike() {
    if (!user || !story || interactionPending) {
      return
    }

    const nextLiked = !liked
    setInteractionPending('like')
    setInteractionError('')
    try {
      await setStoryLike(story.id, user.id, nextLiked)
      setInteractionResult((current) =>
        current.key === interactionKey
          ? { ...current, liked: nextLiked, error: '' }
          : current,
      )
      setStoryResult((current) =>
        current.slug === slug && current.story
          ? {
              ...current,
              story: {
                ...current.story,
                likes_count: Math.max(
                  0,
                  current.story.likes_count + (nextLiked ? 1 : -1),
                ),
              },
            }
          : current,
      )
    } catch (error) {
      setInteractionError(displayError(error))
    } finally {
      setInteractionPending('')
    }
  }

  async function handleToggleBookmark() {
    if (!user || !story || interactionPending) {
      return
    }

    const nextBookmarked = !bookmarked
    setInteractionPending('bookmark')
    setInteractionError('')
    try {
      await setStoryBookmark(story.id, user.id, nextBookmarked)
      setInteractionResult((current) =>
        current.key === interactionKey
          ? { ...current, bookmarked: nextBookmarked, error: '' }
          : current,
      )
    } catch (error) {
      setInteractionError(displayError(error))
    } finally {
      setInteractionPending('')
    }
  }

  async function handleShare() {
    if (!story) {
      return
    }

    setShareMessage('')
    setShareError('')
    const url = `${window.location.origin}/story/${story.slug}`
    try {
      if (navigator.share) {
        await navigator.share({ title: story.title, text: story.excerpt, url })
        setShareMessage('Story shared.')
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setShareMessage('Story link copied to your clipboard.')
      } else {
        throw new Error('Sharing is not available in this browser.')
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setShareMessage(displayError(error))
        setShareError(displayError(error))
      }
    }
  }

  async function handleCommentSubmit(event) {
    event.preventDefault()
    if (!story || isSubmittingComment) {
      return
    }

    const cleanContent = commentText.trim()
    if (!cleanContent) {
      setCommentError('Write a comment before posting.')
      return
    }
    if (cleanContent.length > 3000) {
      setCommentError('Comments must be 3000 characters or fewer.')
      return
    }

    setCommentError('')
    setIsSubmittingComment(true)
    try {
      const savedComment = await createStoryComment(story.id, cleanContent)
      setCommentsResult({
        storyId: story.id,
        comments: [savedComment, ...comments],
        error: '',
      })
      setStoryResult((current) =>
        current.slug === slug && current.story
          ? {
              ...current,
              story: {
                ...current.story,
                comments_count: current.story.comments_count + 1,
              },
            }
          : current,
      )
      setCommentText('')
    } catch (error) {
      setCommentError(displayError(error))
    } finally {
      setIsSubmittingComment(false)
    }
  }

  if (isLoadingStory) {
    return (
      <div aria-busy="true" className="story-reader-loading">
        <div className="skeleton story-reader-loading__cover" />
        <div className="skeleton skeleton-line skeleton-line--short" />
        <div className="skeleton skeleton-line skeleton-line--title" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line skeleton-line--medium" />
        <span className="sr-only">Opening story…</span>
      </div>
    )
  }

  if (storyError) {
    return (
      <section className="story-reader-state" role="alert">
        <p className="eyebrow">
          <span className="eyebrow__rule" />
          The reading room
        </p>
        <h1>We could not open this story.</h1>
        <p>{storyError}</p>
        <Link className="button button--outline" to="/explore">
          <ArrowLeft aria-hidden="true" size={16} />
          Back to Explore
        </Link>
      </section>
    )
  }

  if (!story) {
    return (
      <section className="story-reader-state">
        <p className="eyebrow">
          <span className="eyebrow__rule" />
          The reading room
        </p>
        <h1>This story is not available.</h1>
        <p>It may have been unpublished or moved by its author.</p>
        <Link className="button button--outline" to="/explore">
          <ArrowLeft aria-hidden="true" size={16} />
          Browse stories
        </Link>
      </section>
    )
  }

  const signInState = { from: location }

  return (
    <article className="story-reader">
      <nav aria-label="Breadcrumb" className="story-reader__breadcrumb">
        <Link className="text-link" to="/explore">
          <ArrowLeft aria-hidden="true" size={16} />
          Back to stories
        </Link>
        {story.categories.map((category) => (
          <span key={category.slug}>
            <span aria-hidden="true">/</span>{' '}
            <Link to={`/explore?category=${encodeURIComponent(category.slug)}`}>
              {category.name}
            </Link>
          </span>
        ))}
      </nav>

      <header className="story-reader__header">
        <div className="story-reader__heading">
          {story.categories.length > 0 && (
            <div className="story-reader__categories">
              {story.categories.map((category) => (
                <Link
                  className="story-reader__category"
                  key={category.slug}
                  to={`/explore?category=${encodeURIComponent(category.slug)}`}
                >
                  {category.name}
                </Link>
              ))}
            </div>
          )}
          <h1>{story.title}</h1>
          {story.excerpt && <p className="story-reader__excerpt">{story.excerpt}</p>}
          <div className="story-reader__byline">
            <Avatar author={story.author} />
            <div>
              <Link
                className="story-reader__author"
                to={`/writers/${story.author.username}`}
              >
                {story.author.full_name}
              </Link>
              <span className="story-reader__byline-meta">
                @{story.author.username}
                <span aria-hidden="true"> · </span>
                <time dateTime={story.published_at || story.created_at}>
                  {formatDate(story.published_at || story.created_at)}
                </time>
                <span aria-hidden="true"> · </span>
                {readingMinutes(story.content)} min read
              </span>
              {user?.id === story.author_id && (
                <Link className="story-reader__edit" to={`/write/${story.slug}`}>
                  Edit your story
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="story-reader__cover">
          <ReaderCover story={story} />
        </div>
      </header>

      <div className="story-reader__layout">
        <div className="story-reader__main">
          <div className="story-reader__content">{story.content}</div>
          {story.tags.length > 0 && (
            <ul aria-label="Story tags" className="story-reader__tags">
              {story.tags.map((tag) => (
                <li key={tag.slug}>#{tag.name}</li>
              ))}
            </ul>
          )}
          <div className="story-reader__actions">
            {user ? (
              <>
                <button
                  aria-pressed={liked}
                  className={`reader-action${liked ? ' reader-action--active' : ''}`}
                  disabled={isLoadingInteractions || Boolean(interactionPending)}
                  onClick={handleToggleLike}
                  type="button"
                >
                  {interactionPending === 'like' ? (
                    <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={17} />
                  ) : (
                    <Heart aria-hidden="true" fill={liked ? 'currentColor' : 'none'} size={17} />
                  )}
                  {liked ? 'Liked' : 'Like'} <span>{story.likes_count}</span>
                </button>
                <button
                  aria-pressed={bookmarked}
                  className={`reader-action${bookmarked ? ' reader-action--active' : ''}`}
                  disabled={isLoadingInteractions || Boolean(interactionPending)}
                  onClick={handleToggleBookmark}
                  type="button"
                >
                  {interactionPending === 'bookmark' ? (
                    <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={17} />
                  ) : (
                    <Bookmark
                      aria-hidden="true"
                      fill={bookmarked ? 'currentColor' : 'none'}
                      size={17}
                    />
                  )}
                  {bookmarked ? 'Saved' : 'Bookmark'}
                </button>
              </>
            ) : (
              <Link className="reader-action" state={signInState} to="/sign-in">
                <Heart aria-hidden="true" size={17} />
                Sign in to like or save
              </Link>
            )}
            <button className="reader-action" onClick={handleShare} type="button">
              <Share2 aria-hidden="true" size={17} />
              Share
            </button>
            <ReportControl targetId={story.id} targetType="story" />
          </div>
          {interactionFeedbackError && (
            <p className="reader-feedback reader-feedback--error" role="alert">
              {interactionFeedbackError}
            </p>
          )}
          {shareMessage && (
            <p
              className={`reader-feedback${shareError ? ' reader-feedback--error' : ''}`}
              role={shareError ? 'alert' : 'status'}
            >
              {shareMessage}
            </p>
          )}

          <section aria-labelledby="reader-comments-title" className="reader-comments">
            <div className="reader-comments__heading">
              <div>
                <p className="eyebrow">
                  <span className="eyebrow__rule" />
                  A thoughtful conversation
                </p>
                <h2 id="reader-comments-title">Comments</h2>
              </div>
              <span className="reader-comments__count">
                <MessageCircle aria-hidden="true" size={16} />
                {story.comments_count}
              </span>
            </div>

            {user ? (
              <form className="reader-comment-form" onSubmit={handleCommentSubmit}>
                <label htmlFor="story-comment">Add to the conversation</label>
                <textarea
                  id="story-comment"
                  maxLength={3000}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Share a kind, thoughtful response..."
                  rows={4}
                  value={commentText}
                />
                <div className="reader-comment-form__footer">
                  <span>{commentText.length}/3000</span>
                  <button
                    className="button button--small"
                    disabled={isLoadingComments || isSubmittingComment || !commentText.trim()}
                    type="submit"
                  >
                    {isSubmittingComment ? (
                      <>
                        <LoaderCircle
                          aria-hidden="true"
                          className="auth-loading__icon"
                          size={15}
                        />
                        Posting…
                      </>
                    ) : (
                      <>
                        <Send aria-hidden="true" size={15} />
                        Post comment
                      </>
                    )}
                  </button>
                </div>
                {commentError && (
                  <p className="reader-feedback reader-feedback--error" role="alert">
                    {commentError}
                  </p>
                )}
              </form>
            ) : (
              <div className="reader-comments__signin">
                <p>Sign in to join the conversation.</p>
                <Link className="text-link" state={signInState} to="/sign-in">
                  Sign in <ArrowUpRight aria-hidden="true" size={15} />
                </Link>
              </div>
            )}

            {isLoadingComments ? (
              <div aria-busy="true" className="reader-comments__loading">
                <div className="skeleton skeleton-line skeleton-line--title" />
                <div className="skeleton skeleton-line" />
                <span className="sr-only">Loading comments…</span>
              </div>
            ) : commentsError ? (
              <div className="feed-message feed-message--error" role="alert">
                <p>Comments could not be loaded: {commentsError}</p>
              </div>
            ) : comments.length ? (
              <div className="reader-comments__list">
                {comments.map((comment) => (
                  <CommentItem comment={comment} currentUserId={user?.id} key={comment.id} />
                ))}
              </div>
            ) : (
              <div className="reader-comments__empty">
                <MessageCircle aria-hidden="true" size={20} />
                <p>No comments yet. Be the first to share a thoughtful response.</p>
              </div>
            )}
          </section>
        </div>

        <aside aria-label="Story details" className="story-reader__aside">
          <div className="reader-detail-card">
            <p className="eyebrow">
              <span className="eyebrow__rule" />
              About the writer
            </p>
            <Avatar author={story.author} />
            <h2>
              <Link to={`/writers/${story.author.username}`}>{story.author.full_name}</Link>
            </h2>
            <p className="reader-detail-card__username">@{story.author.username}</p>
            <p className="reader-detail-card__note">
              {story.author.bio || 'A writer in the Story Sphere community.'}
            </p>
          </div>
          <div className="reader-detail-card reader-detail-card--stats">
            <span>
              <Heart aria-hidden="true" size={16} />
              {story.likes_count} {story.likes_count === 1 ? 'like' : 'likes'}
            </span>
            <span>
              <MessageCircle aria-hidden="true" size={16} />
              {story.comments_count} {story.comments_count === 1 ? 'comment' : 'comments'}
            </span>
            <span>
              <Link2 aria-hidden="true" size={16} />
              {readingMinutes(story.content)} minute read
            </span>
          </div>
        </aside>
      </div>

      <section aria-labelledby="related-stories-title" className="reader-related">
        <div className="reader-related__heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow__rule" />
              Keep exploring
            </p>
            <h2 id="related-stories-title">More stories for you</h2>
          </div>
          <Link className="text-link" to="/explore">
            <ArrowUpRight aria-hidden="true" size={15} />
            Explore all
          </Link>
        </div>
        {isLoadingRelated ? (
          <StoryGridSkeleton count={3} />
        ) : relatedError ? (
          <div className="feed-message feed-message--error" role="alert">
            <p>Related stories could not be loaded: {relatedError}</p>
          </div>
        ) : relatedStories.length ? (
          <StoryGrid stories={relatedStories} />
        ) : (
          <div className="reader-related__empty">
            <BookOpen aria-hidden="true" size={22} />
            <p>No related stories are available yet.</p>
          </div>
        )}
      </section>
    </article>
  )
}
