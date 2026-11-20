import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  LoaderCircle,
  UserRoundPlus,
  UserRoundCheck,
} from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { StoryGrid, StoryGridSkeleton } from '../components/StoryCard.jsx'
import {
  fetchProfileStats,
  fetchProfileStories,
  fetchPublicProfile,
  setWriterFollow,
} from '../services/community.js'

const PROFILE_STORY_PAGE_SIZE = 12

function errorText(error) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable'
  }
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(date)
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function ProfileAvatar({ profile }) {
  const [failed, setFailed] = useState(false)

  if (profile.avatar_url && !failed) {
    return (
      <img
        alt=""
        className="public-profile__avatar"
        onError={() => setFailed(true)}
        src={profile.avatar_url}
      />
    )
  }

  return (
    <span aria-hidden="true" className="public-profile__avatar public-profile__avatar--initials">
      {initials(profile.full_name || 'Story writer')}
    </span>
  )
}

export function PublicProfilePage() {
  const { username = '' } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  const currentUserId = user?.id
  const [profileResult, setProfileResult] = useState({
    username: '',
    profile: null,
    error: '',
  })
  const isLoadingProfile = profileResult.username !== username
  const profile = isLoadingProfile ? null : profileResult.profile
  const profileId = profile?.id
  const profileError = isLoadingProfile ? '' : profileResult.error
  const profileKey = `${profileId || ''}:${currentUserId || ''}`
  const [statsResult, setStatsResult] = useState({ key: '', stats: null, error: '' })
  const isLoadingStats = Boolean(profile) && statsResult.key !== profileKey
  const stats = statsResult.key === profileKey ? statsResult.stats : null
  const statsError = statsResult.key === profileKey ? statsResult.error : ''
  const [storiesResult, setStoriesResult] = useState({
    username: '',
    stories: [],
    error: '',
    hasMore: false,
    loadMoreError: '',
  })
  const isLoadingStories = Boolean(profile) && storiesResult.username !== username
  const profileStories =
    storiesResult.username === username ? storiesResult.stories : []
  const storiesError =
    storiesResult.username === username ? storiesResult.error : ''
  const hasMore =
    storiesResult.username === username && storiesResult.hasMore
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const requestVersion = useRef(0)
  const [followPending, setFollowPending] = useState(false)
  const [followError, setFollowError] = useState('')

  useEffect(() => {
    let active = true
    fetchPublicProfile(username)
      .then((result) => {
        if (active) {
          setProfileResult({
            username,
            profile: result,
            error: '',
          })
        }
      })
      .catch((error) => {
        if (active) {
          setProfileResult({ username, profile: null, error: errorText(error) })
        }
      })

    return () => {
      active = false
    }
  }, [username])

  useEffect(() => {
    if (!profileId) {
      return undefined
    }

    let active = true
    fetchProfileStats(profileId, currentUserId)
      .then((result) => {
        if (active) {
          setStatsResult({ key: profileKey, stats: result, error: '' })
        }
      })
      .catch((error) => {
        if (active) {
          setStatsResult({
            key: profileKey,
            stats: null,
            error: errorText(error),
          })
        }
      })

    return () => {
      active = false
    }
  }, [currentUserId, profileId, profileKey])

  useEffect(() => {
    if (!profileId) {
      return undefined
    }

    let active = true
    const version = ++requestVersion.current
    fetchProfileStories(username, PROFILE_STORY_PAGE_SIZE, 0)
      .then((stories) => {
        if (active && requestVersion.current === version) {
          setStoriesResult({
            username,
            stories,
            error: '',
            hasMore: stories.length === PROFILE_STORY_PAGE_SIZE,
            loadMoreError: '',
          })
        }
      })
      .catch((error) => {
        if (active && requestVersion.current === version) {
          setStoriesResult({
            username,
            stories: [],
            error: errorText(error),
            hasMore: false,
            loadMoreError: '',
          })
        }
      })

    return () => {
      active = false
    }
  }, [profileId, username])

  async function handleFollow() {
    if (!profileId || !currentUserId || !stats || followPending || currentUserId === profileId) {
      return
    }

    const shouldFollow = !stats.isFollowing
    setFollowPending(true)
    setFollowError('')
    try {
      await setWriterFollow(profileId, currentUserId, shouldFollow)
      setStatsResult((current) =>
        current.key === profileKey
          ? {
              ...current,
              stats: {
                ...current.stats,
                isFollowing: shouldFollow,
                followers: Math.max(0, current.stats.followers + (shouldFollow ? 1 : -1)),
              },
            }
          : current,
      )
    } catch (error) {
      setFollowError(errorText(error))
    } finally {
      setFollowPending(false)
    }
  }

  async function handleLoadMore() {
    if (!profile || !hasMore || isLoadingMore) {
      return
    }

    const version = requestVersion.current
    const offset = profileStories.length
    setIsLoadingMore(true)
    setStoriesResult((current) => ({ ...current, loadMoreError: '' }))
    try {
      const nextStories = await fetchProfileStories(
        username,
        PROFILE_STORY_PAGE_SIZE,
        offset,
      )
      if (version === requestVersion.current) {
        setStoriesResult((current) =>
          current.username === username
            ? {
                ...current,
                stories: [...current.stories, ...nextStories],
                hasMore: nextStories.length === PROFILE_STORY_PAGE_SIZE,
              }
            : current,
        )
      }
    } catch (error) {
      if (version === requestVersion.current) {
        setStoriesResult((current) =>
          current.username === username
            ? { ...current, loadMoreError: errorText(error) }
            : current,
        )
      }
    } finally {
      if (version === requestVersion.current) {
        setIsLoadingMore(false)
      }
    }
  }

  if (isLoadingProfile) {
    return (
      <div aria-busy="true" className="auth-loading public-profile-loading">
        <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={24} />
        <span>Finding this writer…</span>
      </div>
    )
  }

  if (profileError || !profile) {
    return (
      <section className="public-profile-state" role={profileError ? 'alert' : undefined}>
        <p className="eyebrow">
          <span className="eyebrow__rule" />
          Writer profile
        </p>
        <h1>{profileError ? 'This profile could not be opened.' : 'Writer not found.'}</h1>
        <p>{profileError || 'The username may have changed, or this profile is unavailable.'}</p>
        <Link className="button button--outline" to="/explore">
          Explore stories
        </Link>
      </section>
    )
  }

  const isOwnProfile = currentUserId === profile.id

  return (
    <section className="public-profile">
      <header className="public-profile__hero">
        <div className="public-profile__identity">
          <ProfileAvatar profile={profile} />
          <div className="public-profile__copy">
            <p className="eyebrow">
              <span className="eyebrow__rule" />
              A voice in Story Sphere
            </p>
            <h1>{profile.full_name}</h1>
            <p className="public-profile__username">@{profile.username}</p>
            {profile.bio && <p className="public-profile__bio">{profile.bio}</p>}
            <p className="public-profile__joined">Joined {formatDate(profile.created_at)}</p>
          </div>
        </div>

        <div className="public-profile__actions">
          {isOwnProfile ? (
            <Link className="button button--outline" to="/account">
              Edit your profile
            </Link>
          ) : currentUserId ? (
            <button
              className={`button${stats?.isFollowing ? ' button--outline' : ''}`}
              disabled={!stats || isLoadingStats || followPending}
              onClick={handleFollow}
              type="button"
            >
              {followPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="auth-loading__icon"
                  size={16}
                />
              ) : stats?.isFollowing ? (
                <UserRoundCheck aria-hidden="true" size={16} />
              ) : (
                <UserRoundPlus aria-hidden="true" size={16} />
              )}
              {followPending ? 'Updating…' : stats?.isFollowing ? 'Following' : 'Follow writer'}
            </button>
          ) : (
            <Link
              className="button"
              state={{ from: location }}
              to="/sign-in"
            >
              <UserRoundPlus aria-hidden="true" size={16} />
              Sign in to follow
            </Link>
          )}
        </div>
      </header>

      {statsError ? (
        <div className="feed-message feed-message--error" role="alert">
          <p>Writer activity could not be loaded: {statsError}</p>
        </div>
      ) : (
        <div aria-busy={isLoadingStats} className="public-profile__stats">
          <div>
            <strong>{stats?.stories ?? '—'}</strong>
            <span>Stories</span>
          </div>
          <div>
            <strong>{stats?.followers ?? '—'}</strong>
            <span>Followers</span>
          </div>
          <div>
            <strong>{stats?.following ?? '—'}</strong>
            <span>Following</span>
          </div>
        </div>
      )}
      {followError && (
        <p className="reader-feedback reader-feedback--error" role="alert">
          {followError}
        </p>
      )}

      <section aria-labelledby="writer-stories-title" className="public-profile__stories">
        <div className="public-profile__stories-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow__rule" />
              From this writer
            </p>
            <h2 id="writer-stories-title">Published stories</h2>
          </div>
          <BookOpen aria-hidden="true" size={24} />
        </div>

        {isLoadingStories ? (
          <StoryGridSkeleton count={6} />
        ) : storiesError ? (
          <div className="feed-message feed-message--error" role="alert">
            <p>Published stories could not be loaded: {storiesError}</p>
          </div>
        ) : profileStories.length ? (
          <>
            <StoryGrid stories={profileStories} />
            {storiesResult.loadMoreError && (
              <div className="feed-message feed-message--error" role="alert">
                <p>More stories could not be loaded: {storiesResult.loadMoreError}</p>
                <button className="text-link" onClick={handleLoadMore} type="button">
                  Try again
                </button>
              </div>
            )}
            {hasMore && (
              <div className="public-profile__load-more">
                <button
                  className="button button--outline"
                  disabled={isLoadingMore}
                  onClick={handleLoadMore}
                  type="button"
                >
                  {isLoadingMore ? 'Loading stories…' : 'Load more stories'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="public-profile__empty">
            <BookOpen aria-hidden="true" size={26} />
            <h3>No published stories yet.</h3>
            <p>When this writer shares a story, it will find a home here.</p>
          </div>
        )}
      </section>
    </section>
  )
}
