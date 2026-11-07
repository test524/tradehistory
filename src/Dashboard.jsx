import { useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api'
import ImportModal from './ImportModal'
import Report from './Report'
import './Dashboard.css'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}` // m is 0-based
const fmt = (n) => Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
const money = (n) => (n < 0 ? '-' : '') + fmt(n)
const compact = (n) =>
  (n > 0 ? '+' : n < 0 ? '-' : '') +
  Math.abs(n).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })
const signed = (n) => (n > 0 ? '+' : n < 0 ? '-' : '') + fmt(n)

export default function Dashboard({ user, theme, onToggleTheme, onLogout }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  // data for one month; `key` says which month it belongs to
  const [data, setData] = useState({ key: '', entries: {}, error: '' })
  const [selected, setSelected] = useState(null) // 'YYYY-MM-DD'
  const [value, setValue] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [tab, setTab] = useState('calendar') // 'calendar' | 'report'
  const [all, setAll] = useState({ rows: [], loading: false, error: '' })
  const [toast, setToast] = useState('')
  const [reloadTick, setReloadTick] = useState(0)
  const fabRef = useRef(null)

  // close the account menu on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => {
      if (!fabRef.current?.contains(e.target)) setMenuOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate())

  // load the visible month
  const monthKey = `${year}-${month}`
  useEffect(() => {
    let cancelled = false
    api
      .listPnl(iso(year, month, 1), iso(year, month, daysInMonth))
      .then((rows) => {
        if (cancelled) return
        setData({ key: monthKey, entries: Object.fromEntries(rows.map((r) => [r.date, r.pnl])), error: '' })
      })
      .catch((err) => {
        if (cancelled) return
        setData({ key: monthKey, entries: {}, error: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [year, month, daysInMonth, monthKey, reloadTick])

  // all-time data for the report tab (refreshed every time the tab opens or data is imported)
  useEffect(() => {
    if (tab !== 'report') return
    let cancelled = false
    setAll((a) => ({ ...a, loading: true, error: '' }))
    api
      .listAllPnl()
      .then((rows) => !cancelled && setAll({ rows, loading: false, error: '' }))
      .catch((err) => !cancelled && setAll({ rows: [], loading: false, error: err.message }))
    return () => {
      cancelled = true
    }
  }, [tab, reloadTick])

  // still waiting for the month on screen (first load or after changing month)
  const loading = data.key !== monthKey
  const entries = useMemo(() => (loading ? {} : data.entries), [loading, data.entries])
  const loadError = loading ? '' : data.error

  const stats = useMemo(() => {
    const vals = Object.values(entries)
    const wins = vals.filter((v) => v > 0).length
    return {
      count: vals.length,
      total: vals.reduce((a, b) => a + b, 0),
      wins,
      losses: vals.length - wins,
      best: vals.length ? Math.max(...vals) : null,
      worst: vals.length ? Math.min(...vals) : null,
      rate: vals.length ? Math.round((wins / vals.length) * 100) : null,
    }
  }, [entries])
  const hasEntries = stats.count > 0
  const tone = (n) => (n === null ? '' : n > 0 ? 'is-win' : 'is-loss')

  const shiftMonth = (delta) => {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
    setSelected(null)
  }

  const openDay = (date) => {
    setSelected(date)
    setValue(date in entries ? String(entries[date]) : '')
    setFormError('')
  }

  // phone number keypads have no minus key, so offer a sign toggle
  const flipSign = () => setValue((v) => (v.trim().startsWith('-') ? v.trim().slice(1) : `-${v.trim()}`))

  const save = async (e) => {
    e.preventDefault()
    const n = Number(value.trim())
    if (value.trim() === '' || !Number.isFinite(n)) return setFormError('Enter a number, e.g. 1250 or -300.50')
    setFormError('')
    setSaving(true)
    try {
      const rec = await api.savePnl(selected, n)
      setData((prev) => ({ ...prev, entries: { ...prev.entries, [rec.date]: rec.pnl } }))
      setSelected(null)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(<div key={`b${i}`} className="cal__cell cal__cell--blank" />)
  for (let d = 1; d <= daysInMonth; d++) {
    const date = iso(year, month, d)
    const pnl = entries[date]
    const cellTone = pnl === undefined ? '' : pnl > 0 ? 'cal__cell--win' : 'cal__cell--loss'
    cells.push(
      <button
        key={date}
        type="button"
        className={`cal__cell ${cellTone} ${date === todayIso ? 'cal__cell--today' : ''}`}
        onClick={() => openDay(date)}
        aria-label={`${date}${pnl === undefined ? '' : `, P&L ${money(pnl)}`}`}
      >
        <span className="cal__day">{d}</span>
        {pnl !== undefined && (
          <span className="cal__pnl">
            <span className="cal__full">{signed(pnl)}</span>
            <span className="cal__short">{compact(pnl)}</span>
          </span>
        )}
      </button>,
    )
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="dash">
      <main className="dash__main">
        <div className="tabs" role="tablist" aria-label="View">
          {[
            ['calendar', 'Calendar'],
            ['report', 'Report'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`tabs__btn ${tab === id ? 'is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'report' ? (
          all.loading ? (
            <div className="report__loading" role="status" aria-label="Loading">
              <span className="spinner spinner--lg" />
            </div>
          ) : all.error ? (
            <p className="dash__error" role="alert">
              {all.error}
            </p>
          ) : (
            <Report rows={all.rows} />
          )
        ) : (
          <>
        <div className="cal__bar">
          <button type="button" className="cal__nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            ‹
          </button>
          <h2 className="cal__title">{monthLabel}</h2>
          <button type="button" className="cal__nav" onClick={() => shiftMonth(1)} aria-label="Next month">
            ›
          </button>
        </div>

        <section className={`stats ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
          <div className={`stat stat--main ${hasEntries ? tone(stats.total) : ''}`}>
            <span className="stat__label">Month P&amp;L</span>
            <span className="stat__value">{hasEntries ? signed(stats.total) : '—'}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Win rate</span>
            <span className="stat__value">{stats.rate === null ? '—' : `${stats.rate}%`}</span>
            <span className="stat__sub">
              {stats.wins} green · {stats.losses} red
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Best day</span>
            <span className={`stat__value ${tone(stats.best)}`}>{stats.best === null ? '—' : signed(stats.best)}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Worst day</span>
            <span className={`stat__value ${tone(stats.worst)}`}>
              {stats.worst === null ? '—' : signed(stats.worst)}
            </span>
          </div>
        </section>

        {loadError && (
          <p className="dash__error" role="alert">
            {loadError}
          </p>
        )}

        <div className={`cal__grid ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
          {loading && (
            <div className="cal__loader" role="status" aria-label="Loading">
              <span className="spinner spinner--lg" />
            </div>
          )}
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal__weekday">
              {w}
            </div>
          ))}
          {cells}
        </div>

        <p className="cal__legend">
          <i className="dot dot--win" /> Profit <i className="dot dot--loss" /> Loss / break-even
          <span>Click a day to add or edit its P&amp;L</span>
        </p>
          </>
        )}
      </main>

      <div className="fab" ref={fabRef}>
        {menuOpen && (
          <div className="fab__menu" role="menu">
            <div className="fab__info">
              <strong>{user.name}</strong>
              <span>{user.phone}</span>
            </div>
            <button
              type="button"
              className="fab__item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                setImporting(true)
              }}
            >
              <span>📥 Import</span>
            </button>
            <button type="button" className="fab__item fab__item--theme" role="menuitemcheckbox" aria-checked={theme === 'dark'} onClick={onToggleTheme}>
              <span>{theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}</span>
              <span className={`switch ${theme === 'dark' ? 'is-on' : ''}`} aria-hidden="true" />
            </button>
            <button type="button" className="fab__item fab__item--danger" role="menuitem" onClick={onLogout}>
              Log out
            </button>
          </div>
        )}
        <button
          type="button"
          className="fab__btn"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Account menu"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          {menuOpen ? '✕' : user.name.trim().charAt(0).toUpperCase()}
        </button>
      </div>

      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onImported={({ saved, skipped }) => {
            setImporting(false)
            setData((d) => ({ ...d, key: '' })) // show the loader, then reload the month
            setReloadTick((t) => t + 1)
            setToast(`Imported ${saved} day${saved === 1 ? '' : 's'}${skipped ? `, ${skipped} kept as they were` : ''}`)
            setTimeout(() => setToast(''), 4000)
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {selected && (
        <div className="modal" onClick={() => setSelected(null)}>
          <form className="modal__box" onClick={(e) => e.stopPropagation()} onSubmit={save} noValidate>
            <h3 className="modal__title">
              {new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </h3>
            <label htmlFor="pnl" className="login__label">
              Profit / loss for the day
            </label>
            <div className="modal__field">
              <button
                type="button"
                className="modal__sign"
                onClick={flipSign}
                aria-label="Switch between profit and loss"
                title="Switch between profit and loss"
              >
                +/−
              </button>
              <input
                id="pnl"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 1250 or -300"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="login__input"
                autoFocus
              />
            </div>
            {formError && (
              <p className="login__error" role="alert">
                {formError}
              </p>
            )}
            <div className="modal__actions">
              <button type="button" className="modal__cancel" onClick={() => setSelected(null)}>
                Cancel
              </button>
              <button type="submit" className="login__button modal__save" disabled={saving}>
                {saving ? (
                  <>
                    <span className="spinner" /> Saving…
                  </>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
