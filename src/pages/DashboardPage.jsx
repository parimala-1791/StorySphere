import { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  Bell,
  BookMarked,
  BookOpen,
  Check,
  Heart,
  LoaderCircle,
  MessageCircle,
  PencilLine,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import {
  fetchDashboardData,
  markNotificationRead,
} from '../services/community.js'

function errorText(error) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable'
  }
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function NotificationText({ notification }) {
  const actor = notification.actor
  const action = {
    like: 'liked your story',
    comment: 'left a comment on your story',
    follow: 'started following you',
  }[notification.notification_type]

  return (
    <span>
      {actor?.username ? (
        <Link to={`/writers/${actor.username}`}>{actor.full_name || `@${actor.username}`}</Link>
      ) : (
        <strong>A reader</strong>
      )}{' '}
      {action}
      {notification.story?.slug && (
        <>
          {' '}
          <Link to={`/story/${notification.story.slug}`}>
            “{notification.story.title || 'your story'}”
          </Link>
        </>
      )}
      .
    </span>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const userId = user.id
  const [reloadCount, setReloadCount] = useState(0)
  const [dashboardResult, setDashboardResult] = useState({
    userId: '',
    reloadCount: -1,
    data: null,
    error: '',
  })
  const isLoading = dashboardResult.userId !== userId || dashboardResult.reloadCount !== reloadCount
  const data = isLoading ? null : dashboardResult.data
  const loadError = isLoading ? '' : dashboardResult.error
  const [pendingNotification, setPendingNotification] = useState('')
  const [notificationError, setNotificationError] = useState('')

  useEffect(() => {
    let active = true
    fetchDashboardData(userId)
      .then((result) => {
        if (active) {
          setDashboardResult({
            userId,
            reloadCount,
            data: result,
            error: '',
          })
        }
      })
      .catch((error) => {
        if (active) {
          setDashboardResult({
            userId,
            reloadCount,
            data: null,
            error: errorText(error),
          })
        }
      })

    return () => {
      active = false
    }
  }, [reloadCount, userId])

  async function handleMarkRead(notificationId) {
    setPendingNotification(notificationId)
    setNotificationError('')
    try {
      await markNotificationRead(notificationId, userId)
      setDashboardResult((current) =>
        current.userId === userId && current.data
          ? {
              ...current,
              data: {
                ...current.data,
                notifications: current.data.notifications.map((notification) =>
                  notification.id === notificationId
                    ? { ...notification, is_read: true }
                    : notification,
                ),
              },
            }
          : current,
      )
    } catch (error) {
      setNotificationError(errorText(error))
    } finally {
      setPendingNotification('')
    }
  }

  if (isLoading) {
    return (
      <div aria-busy="true" className="auth-loading dashboard-loading">
        <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={24} />
        <span>Gathering your stories…</span>
      </div>
    )
  }

  if (loadError || !data) {
    return (
      <section className="dashboard-state" role="alert">
        <p className="eyebrow">
          <span className="eyebrow__rule" />
          Your reading room
        </p>
        <h1>Your dashboard could not be loaded.</h1>
        <p>{loadError || 'Your activity is not available right now.'}</p>
        <button
          className="button button--outline"
          onClick={() => setReloadCount((count) => count + 1)}
          type="button"
        >
          Try again
        </button>
      </section>
    )
  }

  const unreadCount = data.notifications.filter((notification) => !notification.is_read).length
  const displayName = user.user_metadata?.full_name || 'Your Story Sphere'
  const metrics = [
    { label: 'Published stories', value: data.stats.published, icon: BookOpen },
    { label: 'Drafts', value: data.stats.drafts, icon: PencilLine },
    { label: 'Likes received', value: data.stats.likes, icon: Heart },
    { label: 'Comments received', value: data.stats.comments, icon: MessageCircle },
    { label: 'Followers', value: data.stats.followers, icon: Users },
    { label: 'Following', value: data.stats.following, icon: Users },
    { label: 'Bookmarks', value: data.stats.bookmarks, icon: BookMarked },
    { label: 'Stories read', value: data.stats.history, icon: BookOpen },
  ]

  return (
    <section className="dashboard-page">
      <header className="dashboard-heading">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__rule" />
            Your reading room
          </p>
          <h1>Welcome back, {displayName}.</h1>
          <p>A quiet place to keep your words, your reading, and your community close.</p>
        </div>
        <Link className="button" to="/write">
          <PencilLine aria-hidden="true" size={16} />
          Write a story
        </Link>
      </header>

      <section aria-label="Your activity" className="dashboard-metrics">
        {metrics.map(({ icon: Icon, label, value }) => (
          <article className="dashboard-metric" key={label}>
            <span className="dashboard-metric__icon">
              <Icon aria-hidden="true" size={17} />
            </span>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>

      <section aria-labelledby="my-stories-title" className="dashboard-panel dashboard-stories">
        <div className="dashboard-panel__heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow__rule" />
              Your work
            </p>
            <h2 id="my-stories-title">My stories</h2>
          </div>
          <Link className="text-link" to="/write">
            Create a story <ArrowUpRight aria-hidden="true" size={15} />
          </Link>
        </div>
        {data.stories.length ? (
          <div className="dashboard-story-list">
            {data.stories.map((story) => (
              <article className="dashboard-story" key={story.id}>
                <div className="dashboard-story__copy">
                  <span
                    className={`writing-status${story.status === 'published' ? ' writing-status--published' : ''}`}
                  >
                    {story.status}
                  </span>
                  <h3>{story.title}</h3>
                  <span>Updated {formatDate(story.updated_at)}</span>
                </div>
                <div className="dashboard-story__actions">
                  <Link className="text-link" to={`/write/${story.slug}`}>
                    Edit <ArrowUpRight aria-hidden="true" size={14} />
                  </Link>
                  {story.status === 'published' && (
                    <Link className="text-link" to={`/story/${story.slug}`}>
                      Read <BookOpen aria-hidden="true" size={14} />
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty">
            <BookOpen aria-hidden="true" size={24} />
            <p>Your first story is waiting to be written.</p>
            <Link className="text-link" to="/write">
              Open your writing space <ArrowUpRight aria-hidden="true" size={14} />
            </Link>
          </div>
        )}
      </section>

      <div className="dashboard-columns">
        <section aria-labelledby="bookmarks-title" className="dashboard-panel">
          <div className="dashboard-panel__heading">
            <div>
              <p className="eyebrow">
                <span className="eyebrow__rule" />
                Saved for later
              </p>
              <h2 id="bookmarks-title">Bookmarks</h2>
            </div>
            <BookMarked aria-hidden="true" size={21} />
          </div>
          {data.bookmarks.length ? (
            <ul className="dashboard-reading-list">
              {data.bookmarks.map(({ created_at: savedAt, story }) =>
                story ? (
                  <li key={story.id}>
                    <Link className="dashboard-reading-list__title" to={`/story/${story.slug}`}>
                      {story.title}
                    </Link>
                    <span>
                      By{' '}
                      {story.author?.username ? (
                        <Link to={`/writers/${story.author.username}`}>
                          {story.author.full_name || `@${story.author.username}`}
                        </Link>
                      ) : (
                        'a community writer'
                      )}
                      {' · '}Saved {formatDate(savedAt)}
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          ) : (
            <div className="dashboard-empty dashboard-empty--compact">
              <BookMarked aria-hidden="true" size={21} />
              <p>Stories you bookmark will be gathered here.</p>
            </div>
          )}
        </section>

        <section aria-labelledby="history-title" className="dashboard-panel">
          <div className="dashboard-panel__heading">
            <div>
              <p className="eyebrow">
                <span className="eyebrow__rule" />
                Pick up where you left off
              </p>
              <h2 id="history-title">Reading history</h2>
            </div>
            <BookOpen aria-hidden="true" size={21} />
          </div>
          {data.history.length ? (
            <ul className="dashboard-reading-list">
              {data.history.map(({ last_read_at: readAt, read_count: readCount, story }) =>
                story ? (
                  <li key={story.id}>
                    <Link className="dashboard-reading-list__title" to={`/story/${story.slug}`}>
                      {story.title}
                    </Link>
                    <span>
                      {readCount} {readCount === 1 ? 'read' : 'reads'} · Last opened{' '}
                      {formatDate(readAt)}
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          ) : (
            <div className="dashboard-empty dashboard-empty--compact">
              <BookOpen aria-hidden="true" size={21} />
              <p>Stories you read will appear here.</p>
              <Link className="text-link" to="/explore">
                Find a story <ArrowUpRight aria-hidden="true" size={14} />
              </Link>
            </div>
          )}
        </section>
      </div>

      <section
        aria-labelledby="notifications-title"
        className="dashboard-panel dashboard-notifications"
        id="notifications"
      >
        <div className="dashboard-panel__heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow__rule" />
              Your community
            </p>
            <h2 id="notifications-title">Notifications</h2>
          </div>
          <span className="dashboard-notifications__unread">
            <Bell aria-hidden="true" size={16} />
            {unreadCount} unread
          </span>
        </div>
        {notificationError && (
          <p className="reader-feedback reader-feedback--error" role="alert">
            {notificationError}
          </p>
        )}
        {data.notifications.length ? (
          <div className="dashboard-notification-list">
            {data.notifications.map((notification) => (
              <article
                className={`dashboard-notification${notification.is_read ? '' : ' dashboard-notification--unread'}`}
                key={notification.id}
              >
                <div className="dashboard-notification__icon">
                  {notification.notification_type === 'like' ? (
                    <Heart aria-hidden="true" size={16} />
                  ) : notification.notification_type === 'comment' ? (
                    <MessageCircle aria-hidden="true" size={16} />
                  ) : (
                    <Users aria-hidden="true" size={16} />
                  )}
                </div>
                <div className="dashboard-notification__copy">
                  <p>
                    <NotificationText notification={notification} />
                  </p>
                  <time dateTime={notification.created_at}>
                    {formatDate(notification.created_at)}
                  </time>
                </div>
                {!notification.is_read && (
                  <button
                    aria-label="Mark notification as read"
                    className="dashboard-notification__mark"
                    disabled={pendingNotification === notification.id}
                    onClick={() => handleMarkRead(notification.id)}
                    type="button"
                  >
                    {pendingNotification === notification.id ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="auth-loading__icon"
                        size={16}
                      />
                    ) : (
                      <Check aria-hidden="true" size={16} />
                    )}
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty dashboard-empty--compact">
            <Bell aria-hidden="true" size={21} />
            <p>Community activity and writer updates will appear here.</p>
          </div>
        )}
      </section>

      <div className="dashboard-account-link">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__rule" />
            Keep your profile current
          </p>
          <h2>Make your space your own.</h2>
        </div>
        <Link className="button button--outline" to="/account">
          Account settings <ArrowUpRight aria-hidden="true" size={15} />
        </Link>
      </div>
    </section>
  )
}
