import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  Flag,
  FolderOpen,
  LoaderCircle,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import {
  fetchAdminReports,
  fetchAdminOverview,
  fetchAdminUsers,
  saveAdminCategory,
  setAdminCategoryActive,
  setAdminCommentModeration,
  setAdminStoryModeration,
  setAdminUserSuspended,
  setReportedContentStatus,
} from '../services/admin.js'

const adminSections = [
  { id: 'overview', label: 'Overview', icon: ShieldCheck },
  { id: 'reports', label: 'Reports', icon: Flag },
  { id: 'stories', label: 'Stories', icon: BookOpen },
  { id: 'users', label: 'Writers', icon: Users },
  { id: 'categories', label: 'Categories', icon: FolderOpen },
]

function errorText(error) {
  return error instanceof Error ? error.message : 'The administrator action could not be completed.'
}

function formatDate(value) {
  if (!value) {
    return 'Not yet'
  }
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

function isSuspended(account) {
  return Boolean(account.banned_until && new Date(account.banned_until).getTime() > Date.now())
}

function targetStory(report) {
  return report.story || report.comment?.story || null
}

function reportTargetLabel(report) {
  return report.comment ? 'Comment' : 'Story'
}

function CategoryForm({ category, onCancel, onSave }) {
  const [name, setName] = useState(category?.name || '')
  const [slug, setSlug] = useState(category?.slug || '')
  const [description, setDescription] = useState(category?.description || '')
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 0))
  const [isActive, setIsActive] = useState(category?.is_active ?? true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (isSaving) {
      return
    }
    setError('')
    setIsSaving(true)
    try {
      await onSave({
        id: category?.id,
        name,
        slug,
        description,
        sort_order: sortOrder,
        is_active: isActive,
      })
      if (!category) {
        setName('')
        setSlug('')
        setDescription('')
        setSortOrder('0')
      }
    } catch (saveError) {
      setError(errorText(saveError))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="admin-category-form" onSubmit={handleSubmit}>
      <div className="admin-category-form__fields">
        <label>
          Category name
          <input
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </label>
        <label>
          URL slug
          <input
            maxLength={80}
            onChange={(event) => setSlug(event.target.value)}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            required
            value={slug}
          />
        </label>
        <label>
          Description
          <input
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </label>
        <label>
          Sort order
          <input
            max={10000}
            min={-10000}
            onChange={(event) => setSortOrder(event.target.value)}
            required
            type="number"
            value={sortOrder}
          />
        </label>
        {category && (
          <label className="admin-category-form__checkbox">
            <input
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              type="checkbox"
            />
            Available to writers
          </label>
        )}
      </div>
      {error && (
        <p className="admin-feedback admin-feedback--error" role="alert">
          {error}
        </p>
      )}
      <div className="admin-actions">
        <button className="button button--small" disabled={isSaving} type="submit">
          {isSaving ? 'Saving…' : category ? 'Save category' : 'Add category'}
        </button>
        {category && (
          <button className="button button--outline button--small" onClick={onCancel} type="button">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

export function AdminPage() {
  const { user } = useAuth()
  const [section, setSection] = useState('overview')
  const [reloadCount, setReloadCount] = useState(0)
  const [overviewResult, setOverviewResult] = useState({
    reloadCount: -1,
    data: null,
    error: '',
  })
  const [userPage, setUserPage] = useState(1)
  const [userReloadCount, setUserReloadCount] = useState(0)
  const [usersResult, setUsersResult] = useState({
    page: 0,
    reloadCount: -1,
    users: [],
    hasMore: false,
    error: '',
  })
  const [pendingAction, setPendingAction] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState('')

  const isLoadingOverview = overviewResult.reloadCount !== reloadCount
  const overview = isLoadingOverview ? null : overviewResult.data
  const overviewError = isLoadingOverview ? '' : overviewResult.error
  const isLoadingUsers =
    usersResult.page !== userPage || usersResult.reloadCount !== userReloadCount
  const userList = isLoadingUsers ? [] : usersResult.users
  const usersError = isLoadingUsers ? '' : usersResult.error

  useEffect(() => {
    let active = true
    fetchAdminOverview()
      .then((data) => {
        if (active) {
          setOverviewResult({ reloadCount, data, error: '' })
        }
      })
      .catch((error) => {
        if (active) {
          setOverviewResult({ reloadCount, data: null, error: errorText(error) })
        }
      })

    return () => {
      active = false
    }
  }, [reloadCount])

  useEffect(() => {
    let active = true
    fetchAdminUsers(userPage)
      .then(({ users, hasMore }) => {
        if (active) {
          setUsersResult({
            page: userPage,
            reloadCount: userReloadCount,
            users,
            hasMore,
            error: '',
          })
        }
      })
      .catch((error) => {
        if (active) {
          setUsersResult({
            page: userPage,
            reloadCount: userReloadCount,
            users: [],
            hasMore: false,
            error: errorText(error),
          })
        }
      })

    return () => {
      active = false
    }
  }, [userPage, userReloadCount])

  function clearFeedback() {
    setActionError('')
    setActionMessage('')
  }

  async function runAction(actionId, message, action) {
    clearFeedback()
    setPendingAction(actionId)
    try {
      await action()
      setActionMessage(message)
      return true
    } catch (error) {
      setActionError(errorText(error))
      return false
    } finally {
      setPendingAction('')
    }
  }

  async function handleReportStatus(reportId, status, currentStatus) {
    const saved = await runAction(
      `report-${reportId}`,
      'Report status updated.',
      () => setReportedContentStatus(reportId, status),
    )
    if (saved) {
      setOverviewResult((current) =>
        current.reloadCount === reloadCount && current.data
          ? {
              ...current,
              data: {
                ...current.data,
                stats: {
                  ...current.data.stats,
                  openReports: Math.max(
                    0,
                    current.data.stats.openReports -
                      (['open', 'reviewing'].includes(currentStatus) &&
                      !['open', 'reviewing'].includes(status)
                        ? 1
                        : !['open', 'reviewing'].includes(currentStatus) &&
                            ['open', 'reviewing'].includes(status)
                          ? -1
                          : 0),
                  ),
                },
              },
            }
          : current,
      )
    }
    return saved
  }

  async function handleStoryModeration(story, nextHidden = story.is_hidden, nextFeatured = story.is_featured) {
    const actionId = `story-${story.id}`
    const saved = await runAction(
      actionId,
      nextHidden !== story.is_hidden
        ? nextHidden
          ? 'Story hidden from public feeds.'
          : 'Story is visible in public feeds again.'
        : nextFeatured
          ? 'Story featured.'
          : 'Story removed from featured stories.',
      () => setAdminStoryModeration(story.id, nextHidden, nextFeatured),
    )
    if (saved) {
      setOverviewResult((current) =>
        current.reloadCount === reloadCount && current.data
          ? {
              ...current,
              data: {
                ...current.data,
                stories: current.data.stories.map((item) =>
                  item.id === story.id
                    ? { ...item, is_hidden: nextHidden, is_featured: nextFeatured }
                    : item,
                ),
              },
            }
          : current,
      )
    }
    return saved
  }

  async function handleCommentModeration(commentId, isHidden) {
    const saved = await runAction(
      `comment-${commentId}`,
      isHidden ? 'Comment hidden.' : 'Comment is visible again.',
      () => setAdminCommentModeration(commentId, isHidden),
    )
    return saved
  }

  async function handleUserStatus(account, shouldSuspend) {
    const statusText = shouldSuspend ? 'suspend' : 'restore'
    if (
      !window.confirm(
        `Are you sure you want to ${statusText} ${account.email || 'this account'}?`,
      )
    ) {
      return
    }
    const saved = await runAction(
      `user-${account.id}`,
      shouldSuspend ? 'Account suspended.' : 'Account restored.',
      () => setAdminUserSuspended(account.id, shouldSuspend),
    )
    if (saved) {
      setUserReloadCount((count) => count + 1)
    }
  }

  async function handleCategorySave(category) {
    setActionError('')
    setActionMessage('')
    setPendingAction(`category-${category.id || 'new'}`)
    try {
      await saveAdminCategory(category)
      setActionMessage(category.id ? 'Category updated.' : 'Category added.')
      setEditingCategoryId('')
      setReloadCount((count) => count + 1)
    } catch (error) {
      setActionError(errorText(error))
      throw error
    } finally {
      setPendingAction('')
    }
  }

  async function handleCategoryActive(category) {
    const isActive = !category.is_active
    const saved = await runAction(
      `category-${category.id}`,
      isActive ? 'Category activated.' : 'Category deactivated.',
      () => setAdminCategoryActive(category.id, isActive),
    )
    if (saved) {
      setOverviewResult((current) =>
        current.reloadCount === reloadCount && current.data
          ? {
              ...current,
              data: {
                ...current.data,
                categories: current.data.categories.map((item) =>
                  item.id === category.id ? { ...item, is_active: isActive } : item,
                ),
                stats: {
                  ...current.data.stats,
                  categories: Math.max(
                    0,
                    current.data.stats.categories + (isActive ? 1 : -1),
                  ),
                },
              },
            }
          : current,
      )
    }
    return saved
  }

  function changeSection(nextSection) {
    setSection(nextSection)
    clearFeedback()
  }

  const isLoading = isLoadingOverview

  return (
    <section className="admin-page">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__rule" />
            Story Sphere administration
          </p>
          <h1>A thoughtful community needs thoughtful care.</h1>
          <p>
            Review reports, care for the community, and keep the story library welcoming.
          </p>
        </div>
        <span className="admin-heading__badge">
          <ShieldCheck aria-hidden="true" size={17} />
          Verified administrator
        </span>
      </header>

      <nav aria-label="Administration sections" className="admin-tabs" role="tablist">
        {adminSections.map(({ id, label, icon: Icon }) => (
          <button
            aria-selected={section === id}
            className={`admin-tabs__tab${section === id ? ' admin-tabs__tab--active' : ''}`}
            id={`admin-tab-${id}`}
            key={id}
            onClick={() => changeSection(id)}
            role="tab"
            type="button"
          >
            <Icon aria-hidden="true" size={16} />
            {label}
            {id === 'reports' && overview?.stats.openReports > 0 && (
              <span className="admin-tabs__count">{overview.stats.openReports}</span>
            )}
          </button>
        ))}
      </nav>

      {actionError && (
        <div className="admin-feedback admin-feedback--error" role="alert">
          <AlertTriangle aria-hidden="true" size={16} />
          {actionError}
        </div>
      )}
      {isLoading && (
        <div aria-busy="true" className="admin-inline-loading">
          <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={18} />
          Loading reports…
        </div>
      )}
      {!isLoading && reportsResult.error && (
        <div className="admin-inline-error" role="alert">
          <p>Reports could not be loaded: {reportsResult.error}</p>
          <button
            className="button button--outline button--small"
            onClick={() => setReloadCount((count) => count + 1)}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
      {actionMessage && (
        <div className="admin-feedback" role="status">
          <Check aria-hidden="true" size={16} />
          {actionMessage}
        </div>
      )}

      {isLoading ? (
        <div aria-busy="true" className="auth-loading admin-loading">
          <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={24} />
          <span>Gathering the community overview…</span>
        </div>
      ) : overviewError || !overview ? (
        <section className="admin-state" role="alert">
          <h2>The administrator workspace could not be loaded.</h2>
          <p>{overviewError || 'The requested information is not available right now.'}</p>
          <button
            className="button button--outline"
            onClick={() => setReloadCount((count) => count + 1)}
            type="button"
          >
            Try again
          </button>
        </section>
      ) : (
        <>
          {section === 'overview' && (
            <AdminOverview
              overview={overview}
              onOpenReports={() => changeSection('reports')}
              onOpenStories={() => changeSection('stories')}
            />
          )}
          {section === 'reports' && (
            <AdminReports
              onCommentModeration={handleCommentModeration}
              onReportStatus={handleReportStatus}
              onStoryModeration={handleStoryModeration}
              pendingAction={pendingAction}
            />
          )}
          {section === 'stories' && (
            <AdminStories
              onStoryModeration={handleStoryModeration}
              overview={overview}
              pendingAction={pendingAction}
            />
          )}
          {section === 'users' && (
            <AdminUsers
              error={usersError}
              hasMore={usersResult.hasMore}
              isLoading={isLoadingUsers}
              onChangePage={setUserPage}
              onReload={() => setUserReloadCount((count) => count + 1)}
              onSetSuspended={handleUserStatus}
              page={userPage}
              pendingAction={pendingAction}
              users={userList}
            />
          )}
          {section === 'categories' && (
            <AdminCategories
              editingCategoryId={editingCategoryId}
              onCancelEdit={() => setEditingCategoryId('')}
              onEdit={setEditingCategoryId}
              onSave={handleCategorySave}
              onToggleActive={handleCategoryActive}
              overview={overview}
              pendingAction={pendingAction}
            />
          )}
        </>
      )}
      <p className="admin-page__signed-in">
        Signed in as {user?.email || 'an administrator'}.
      </p>
    </section>
  )
}

function AdminOverview({ overview, onOpenReports, onOpenStories }) {
  const metrics = [
    { label: 'Community members', value: overview.stats.users, icon: Users },
    { label: 'Stories in library', value: overview.stats.stories, icon: BookOpen },
    { label: 'Published stories', value: overview.stats.published, icon: Eye },
    { label: 'Reports to review', value: overview.stats.openReports, icon: Flag },
    { label: 'Active categories', value: overview.stats.categories, icon: FolderOpen },
  ]

  return (
    <>
      <section aria-label="Platform statistics" className="admin-metrics">
        {metrics.map(({ icon: Icon, label, value }) => (
          <article className="admin-metric" key={label}>
            <span className="admin-metric__icon">
              <Icon aria-hidden="true" size={17} />
            </span>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>
      <section className="admin-panel">
        <div className="admin-panel__heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow__rule" />
              A good place to begin
            </p>
            <h2>Community care</h2>
          </div>
        </div>
        <div className="admin-overview__actions">
          <button className="admin-overview__action" onClick={onOpenReports} type="button">
            <Flag aria-hidden="true" size={19} />
            <span>
              <strong>Review community reports</strong>
              <small>Respond to reports about stories and comments.</small>
            </span>
            <ArrowRight aria-hidden="true" className="admin-overview__arrow" size={17} />
          </button>
          <button className="admin-overview__action" onClick={onOpenStories} type="button">
            <BookOpen aria-hidden="true" size={19} />
            <span>
              <strong>Manage the story library</strong>
              <small>Feature standout stories or hide content that breaks guidelines.</small>
            </span>
            <ArrowRight aria-hidden="true" className="admin-overview__arrow" size={17} />
          </button>
        </div>
      </section>
    </>
  )
}

function AdminReports({
  onCommentModeration,
  onReportStatus,
  onStoryModeration,
  pendingAction,
}) {
  const [statusFilter, setStatusFilter] = useState('open')
  const [reloadCount, setReloadCount] = useState(0)
  const [reportsResult, setReportsResult] = useState({
    key: '',
    reports: [],
    error: '',
  })
  const reportKey = `${statusFilter}:${reloadCount}`
  const isLoading = reportsResult.key !== reportKey

  useEffect(() => {
    let active = true
    fetchAdminReports(statusFilter)
      .then((reports) => {
        if (active) {
          setReportsResult({ key: reportKey, reports, error: '' })
        }
      })
      .catch((error) => {
        if (active) {
          setReportsResult({
            key: reportKey,
            reports: [],
            error: errorText(error),
          })
        }
      })

    return () => {
      active = false
    }
  }, [reportKey, statusFilter])

  const reports = isLoading ? [] : reportsResult.reports

  async function updateReportStatus(report, status) {
    const saved = await onReportStatus(report.id, status, report.status)
    if (saved) {
      setReportsResult((current) =>
        current.key === reportKey
          ? {
              ...current,
              reports: current.reports
                .map((item) => (item.id === report.id ? { ...item, status } : item))
                .filter(
                  (item) =>
                    statusFilter === 'all' ||
                    item.id !== report.id ||
                    item.status === statusFilter,
                ),
            }
          : current,
      )
    }
  }

  async function updateReportedStory(report, story, isHidden, isFeatured) {
    const saved = await onStoryModeration(story, isHidden, isFeatured)
    if (saved) {
      setReportsResult((current) =>
        current.key === reportKey
          ? {
              ...current,
              reports: current.reports.map((item) =>
                item.id === report.id
                  ? {
                      ...item,
                      story: item.story
                        ? { ...item.story, is_hidden: isHidden, is_featured: isFeatured }
                        : item.story,
                      comment: item.comment?.story
                        ? {
                            ...item.comment,
                            story: {
                              ...item.comment.story,
                              is_hidden: isHidden,
                              is_featured: isFeatured,
                            },
                          }
                        : item.comment,
                    }
                  : item,
              ),
            }
          : current,
      )
    }
  }

  async function updateReportedComment(report, commentId, isHidden) {
    const saved = await onCommentModeration(commentId, isHidden)
    if (saved) {
      setReportsResult((current) =>
        current.key === reportKey
          ? {
              ...current,
              reports: current.reports.map((item) =>
                item.id === report.id && item.comment
                  ? { ...item, comment: { ...item.comment, is_hidden: isHidden } }
                  : item,
              ),
            }
          : current,
      )
    }
  }

  return (
    <section aria-labelledby="admin-reports-title" className="admin-panel" role="tabpanel">
      <div className="admin-panel__heading">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__rule" />
            Community care
          </p>
          <h2 id="admin-reports-title">Reported content</h2>
        </div>
        <label className="admin-filter">
          <span className="sr-only">Filter reports by status</span>
          <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="open">Open reports</option>
            <option value="reviewing">Under review</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="all">All recent reports</option>
          </select>
        </label>
      </div>
      {isLoading ? (
        <div aria-busy="true" className="admin-inline-loading">
          <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={18} />
          Loading reports…
        </div>
      ) : reportsResult.error ? (
        <div className="admin-inline-error" role="alert">
          <p>Reports could not be loaded: {reportsResult.error}</p>
          <button
            className="button button--outline button--small"
            onClick={() => setReloadCount((count) => count + 1)}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : reports.length ? (
        <div className="admin-report-list">
          {reports.map((report) => {
            const story = targetStory(report)
            const reportId = `report-${report.id}`
            const contentTargetId = report.comment?.id || report.story?.id
            return (
              <article className="admin-report" key={report.id}>
                <div className="admin-report__header">
                  <span className={`admin-status admin-status--${report.status}`}>
                    {report.status}
                  </span>
                  <span>{report.reason}</span>
                  <time dateTime={report.created_at}>{formatDate(report.created_at)}</time>
                </div>
                <h3>
                  {reportTargetLabel(report)}: {report.comment?.content || story?.title || 'Unavailable content'}
                </h3>
                {report.details && <p className="admin-report__details">{report.details}</p>}
                <p className="admin-report__meta">
                  Reported by {report.reporter?.full_name || 'Community member'}
                  {report.reporter?.username ? ` (@${report.reporter.username})` : ''}
                  {story?.title && ` · Story: ${story.title}`}
                </p>
                <div className="admin-actions admin-report__actions">
                  {report.story && (
                    <button
                      className="button button--outline button--small"
                      disabled={pendingAction === `story-${report.story.id}`}
                      onClick={() =>
                        updateReportedStory(
                          report,
                          report.story,
                          !report.story.is_hidden,
                          report.story.is_featured,
                        )
                      }
                      type="button"
                    >
                      {report.story.is_hidden ? (
                        <><Eye aria-hidden="true" size={14} /> Restore story</>
                      ) : (
                        <><EyeOff aria-hidden="true" size={14} /> Hide story</>
                      )}
                    </button>
                  )}
                  {report.comment && (
                    <button
                      className="button button--outline button--small"
                      disabled={pendingAction === `comment-${report.comment.id}`}
                      onClick={() =>
                        updateReportedComment(
                          report,
                          report.comment.id,
                          !report.comment.is_hidden,
                        )
                      }
                      type="button"
                    >
                      {report.comment.is_hidden ? (
                        <><Eye aria-hidden="true" size={14} /> Restore comment</>
                      ) : (
                        <><EyeOff aria-hidden="true" size={14} /> Hide comment</>
                      )}
                    </button>
                  )}
                  {report.status === 'open' && (
                    <button
                      className="button button--small"
                      disabled={pendingAction === reportId}
                      onClick={() => updateReportStatus(report, 'reviewing')}
                      type="button"
                    >
                      Start review
                    </button>
                  )}
                  {report.status !== 'resolved' && (
                    <button
                      className="button button--small"
                      disabled={pendingAction === reportId}
                      onClick={() => updateReportStatus(report, 'resolved')}
                      type="button"
                    >
                      Resolve
                    </button>
                  )}
                  {report.status !== 'dismissed' && (
                    <button
                      className="button button--outline button--small"
                      disabled={pendingAction === reportId}
                      onClick={() => updateReportStatus(report, 'dismissed')}
                      type="button"
                    >
                      Dismiss
                    </button>
                  )}
                  {story?.slug && !story.is_hidden && (
                    <Link className="text-link" to={`/story/${story.slug}`}>
                      View story
                    </Link>
                  )}
                  {report.comment && !report.comment.is_hidden && story?.slug && (
                    <span className="admin-report__anchor">
                      Comment on “{story.title}”
                    </span>
                  )}
                </div>
                {!contentTargetId && (
                  <p className="admin-report__meta">The reported content is no longer available.</p>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="admin-empty">
          <Flag aria-hidden="true" size={22} />
          <p>No reports match this view.</p>
        </div>
      )}
    </section>
  )
}

function AdminStories({ onStoryModeration, overview, pendingAction }) {
  return (
    <section aria-labelledby="admin-stories-title" className="admin-panel" role="tabpanel">
      <div className="admin-panel__heading">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__rule" />
            Editorial stewardship
          </p>
          <h2 id="admin-stories-title">Story library</h2>
          <p>Showing the 50 most recently updated stories.</p>
        </div>
      </div>
      {overview.stories.length ? (
        <div className="admin-list">
          {overview.stories.map((story) => (
            <article className="admin-list__row" key={story.id}>
              <div className="admin-list__copy">
                <h3>
                  {story.slug && story.status === 'published' && !story.is_hidden ? (
                    <Link to={`/story/${story.slug}`}>{story.title}</Link>
                  ) : (
                    story.title
                  )}
                </h3>
                <p>
                  {story.author?.full_name || 'Writer'} · {story.status} · updated{' '}
                  {formatDate(story.updated_at)}
                </p>
                <div className="admin-list__badges">
                  {story.is_hidden && <span className="admin-status admin-status--hidden">Hidden</span>}
                  {story.is_featured && <span className="admin-status admin-status--featured">Featured</span>}
                </div>
              </div>
              <div className="admin-actions">
                <button
                  aria-label={story.is_hidden ? `Restore ${story.title}` : `Hide ${story.title}`}
                  className="button button--outline button--small"
                  disabled={pendingAction === `story-${story.id}`}
                  onClick={() => {
                    if (
                      story.is_hidden ||
                      window.confirm(`Hide “${story.title}” from public feeds?`)
                    ) {
                      onStoryModeration(
                        story,
                        !story.is_hidden,
                        story.is_featured,
                      )
                    }
                  }}
                  type="button"
                >
                  {story.is_hidden ? (
                    <><Eye aria-hidden="true" size={14} /> Restore</>
                  ) : (
                    <><EyeOff aria-hidden="true" size={14} /> Hide</>
                  )}
                </button>
                <button
                  aria-label={story.is_featured ? `Unfeature ${story.title}` : `Feature ${story.title}`}
                  className="button button--small"
                  disabled={pendingAction === `story-${story.id}` || story.status !== 'published' || story.is_hidden}
                  onClick={() =>
                    onStoryModeration(story, story.is_hidden, !story.is_featured)
                  }
                  type="button"
                >
                  {story.is_featured ? 'Unfeature' : 'Feature'}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-empty">
          <BookOpen aria-hidden="true" size={22} />
          <p>No stories are available to review yet.</p>
        </div>
      )}
    </section>
  )
}

function AdminUsers({
  error,
  hasMore,
  isLoading,
  onChangePage,
  onReload,
  onSetSuspended,
  page,
  pendingAction,
  users,
}) {
  return (
    <section aria-labelledby="admin-users-title" className="admin-panel" role="tabpanel">
      <div className="admin-panel__heading">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__rule" />
            Account stewardship
          </p>
          <h2 id="admin-users-title">Community members</h2>
          <p>Account suspension and restoration run through a trusted Supabase Edge Function.</p>
        </div>
      </div>
      {isLoading ? (
        <div aria-busy="true" className="admin-inline-loading">
          <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={19} />
          Loading accounts…
        </div>
      ) : error ? (
        <div className="admin-inline-error" role="alert">
          <p>Account management is unavailable: {error}</p>
          <button className="button button--outline button--small" onClick={onReload} type="button">
            Try again
          </button>
        </div>
      ) : users.length ? (
        <>
          <div className="admin-user-list">
            {users.map((account) => {
              const suspended = isSuspended(account)
              return (
                <article className="admin-list__row" key={account.id}>
                  <div className="admin-list__copy">
                    <h3>{account.profile?.full_name || account.email || 'Community member'}</h3>
                    <p>
                      {account.profile?.username ? `@${account.profile.username} · ` : ''}
                      {account.email || 'No email address'}
                    </p>
                    <p className="admin-user-list__dates">
                      Joined {formatDate(account.created_at)} · Last active{' '}
                      {formatDate(account.last_sign_in_at)}
                    </p>
                  </div>
                  <div className="admin-actions">
                    <span className={`admin-status ${suspended ? 'admin-status--hidden' : 'admin-status--active'}`}>
                      {suspended ? 'Suspended' : 'Active'}
                    </span>
                    <button
                      className={`button button--small${suspended ? ' button--outline' : ''}`}
                      disabled={pendingAction === `user-${account.id}`}
                      onClick={() => onSetSuspended(account, !suspended)}
                      type="button"
                    >
                      {suspended ? 'Restore account' : 'Suspend account'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
          <div className="admin-pagination">
            <button
              className="button button--outline button--small"
              disabled={page <= 1}
              onClick={() => onChangePage((current) => Math.max(1, current - 1))}
              type="button"
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              className="button button--outline button--small"
              disabled={!hasMore}
              onClick={() => onChangePage((current) => current + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        </>
      ) : (
        <div className="admin-empty">
          <Users aria-hidden="true" size={22} />
          <p>No community members are available on this page.</p>
        </div>
      )}
    </section>
  )
}

function AdminCategories({
  editingCategoryId,
  onCancelEdit,
  onEdit,
  onSave,
  onToggleActive,
  overview,
  pendingAction,
}) {
  return (
    <section aria-labelledby="admin-categories-title" className="admin-panel" role="tabpanel">
      <div className="admin-panel__heading">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__rule" />
            Story organization
          </p>
          <h2 id="admin-categories-title">Explore categories</h2>
        </div>
      </div>
      <div className="admin-category-create">
        <h3>Add a category</h3>
        <CategoryForm key="new-category" onSave={onSave} />
      </div>
      <div className="admin-category-list">
        {overview.categories.map((category) => (
          <article className="admin-category" key={category.id}>
            {editingCategoryId === category.id ? (
              <CategoryForm
                category={category}
                key={category.id}
                onCancel={onCancelEdit}
                onSave={onSave}
              />
            ) : (
              <>
                <div className="admin-list__copy">
                  <h3>{category.name}</h3>
                  <p>/{category.slug} · order {category.sort_order}</p>
                  {category.description && <p>{category.description}</p>}
                </div>
                <div className="admin-actions">
                  <span className={`admin-status ${category.is_active ? 'admin-status--active' : 'admin-status--hidden'}`}>
                    {category.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    className="button button--outline button--small"
                    disabled={pendingAction === `category-${category.id}`}
                    onClick={() => onToggleActive(category)}
                    type="button"
                  >
                    {category.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    className="button button--small"
                    onClick={() => onEdit(category.id)}
                    type="button"
                  >
                    Edit
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
      {!overview.categories.length && (
        <div className="admin-empty">
          <FolderOpen aria-hidden="true" size={22} />
          <p>No categories have been created yet.</p>
        </div>
      )}
    </section>
  )
}
