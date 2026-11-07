import { useMemo } from 'react'

const fmt = (n) => Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
const signed = (n) => (n > 0 ? '+' : n < 0 ? '-' : '') + fmt(n)
const tone = (n) => (n > 0 ? 'is-win' : n < 0 ? 'is-loss' : '')
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dayName = (iso) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]
const monthLabel = (ym) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })
const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function analyse(rows) {
  const list = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const days = list.length
  const wins = list.filter((r) => r.pnl > 0)
  const losses = list.filter((r) => r.pnl < 0)
  const grossWin = wins.reduce((a, r) => a + r.pnl, 0)
  const grossLoss = losses.reduce((a, r) => a + r.pnl, 0)
  const total = grossWin + grossLoss

  let winStreak = 0, lossStreak = 0, curWin = 0, curLoss = 0
  let equity = 0, peak = 0, maxDrawdown = 0
  const curve = []
  for (const r of list) {
    curWin = r.pnl > 0 ? curWin + 1 : 0
    curLoss = r.pnl < 0 ? curLoss + 1 : 0
    winStreak = Math.max(winStreak, curWin)
    lossStreak = Math.max(lossStreak, curLoss)
    equity += r.pnl
    peak = Math.max(peak, equity)
    maxDrawdown = Math.max(maxDrawdown, peak - equity)
    curve.push({ date: r.date, equity })
  }

  const group = (keyOf) => {
    const m = new Map()
    for (const r of list) {
      const k = keyOf(r)
      const g = m.get(k) ?? { key: k, total: 0, days: 0, wins: 0 }
      g.total += r.pnl
      g.days += 1
      g.wins += r.pnl > 0 ? 1 : 0
      m.set(k, g)
    }
    return [...m.values()]
  }

  return {
    days,
    total,
    avgDay: total / days,
    winRate: Math.round((wins.length / days) * 100),
    winCount: wins.length,
    lossCount: losses.length,
    flatCount: days - wins.length - losses.length,
    avgWin: wins.length ? grossWin / wins.length : null,
    avgLoss: losses.length ? grossLoss / losses.length : null,
    profitFactor: grossLoss < 0 ? grossWin / -grossLoss : null,
    best: list.reduce((a, r) => (r.pnl > a.pnl ? r : a), list[0]),
    worst: list.reduce((a, r) => (r.pnl < a.pnl ? r : a), list[0]),
    winStreak,
    lossStreak,
    maxDrawdown,
    from: list[0].date,
    to: list[days - 1].date,
    curve,
    weekdays: group((r) => dayName(r.date))
      .filter((g) => g.days)
      .sort((a, b) => WEEKDAYS.indexOf(a.key) - WEEKDAYS.indexOf(b.key)),
    months: group((r) => r.date.slice(0, 7)).sort((a, b) => b.key.localeCompare(a.key)),
  }
}

function Stat({ label, value, sub, cls = '' }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className={`stat__value ${cls}`}>{value}</span>
      {sub && <span className="stat__sub">{sub}</span>}
    </div>
  )
}

function EquityChart({ curve }) {
  const W = 600, H = 170, P = 8
  const ys = curve.map((p) => p.equity)
  const min = Math.min(0, ...ys)
  const max = Math.max(0, ...ys)
  const span = max - min || 1
  const x = (i) => P + (curve.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (curve.length - 1))
  const y = (v) => P + ((max - v) * (H - 2 * P)) / span
  const pts = curve.map((p, i) => `${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ')
  const up = curve[curve.length - 1].equity >= 0
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cumulative P&L over time" preserveAspectRatio="none">
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} className="chart__zero" />
      <polyline points={pts} className={`chart__line ${up ? 'is-win' : 'is-loss'}`} fill="none" />
    </svg>
  )
}

function Bars({ items, label, value, sub }) {
  const maxAbs = Math.max(...items.map((i) => Math.abs(value(i))), 1)
  return (
    <ul className="bars">
      {items.map((i) => (
        <li key={i.key} className="bars__row">
          <span className="bars__label">{label(i)}</span>
          <span className="bars__track">
            <span
              className={`bars__fill ${value(i) >= 0 ? 'is-win' : 'is-loss'}`}
              style={{ width: `${Math.max(2, (Math.abs(value(i)) / maxAbs) * 100)}%` }}
            />
          </span>
          <span className={`bars__value ${tone(value(i))}`}>{signed(value(i))}</span>
          <span className="bars__sub">{sub(i)}</span>
        </li>
      ))}
    </ul>
  )
}

export default function Report({ rows }) {
  const r = useMemo(() => (rows.length ? analyse(rows) : null), [rows])

  if (!r) {
    return <p className="report__empty">No data yet. Add a day on the calendar or import a file, then come back here.</p>
  }

  return (
    <div className="report">
      <p className="report__range">
        {r.days} trading day{r.days === 1 ? '' : 's'} · {shortDate(r.from)} → {shortDate(r.to)}
      </p>

      <section className="stats stats--report">
        <div className={`stat stat--main ${tone(r.total)}`}>
          <span className="stat__label">Total P&amp;L</span>
          <span className="stat__value">{signed(r.total)}</span>
        </div>
        <Stat label="Average per day" value={signed(r.avgDay)} cls={tone(r.avgDay)} />
        <Stat label="Win rate" value={`${r.winRate}%`} sub={`${r.winCount} green · ${r.lossCount} red${r.flatCount ? ` · ${r.flatCount} flat` : ''}`} />
        <Stat label="Average win" value={r.avgWin === null ? '—' : signed(r.avgWin)} cls={r.avgWin === null ? '' : 'is-win'} />
        <Stat label="Average loss" value={r.avgLoss === null ? '—' : signed(r.avgLoss)} cls={r.avgLoss === null ? '' : 'is-loss'} />
        <Stat
          label="Profit factor"
          value={r.profitFactor === null ? '—' : r.profitFactor.toFixed(2)}
          sub="gross profit ÷ gross loss"
        />
        <Stat label="Best day" value={signed(r.best.pnl)} cls={tone(r.best.pnl)} sub={shortDate(r.best.date)} />
        <Stat label="Worst day" value={signed(r.worst.pnl)} cls={tone(r.worst.pnl)} sub={shortDate(r.worst.date)} />
        <Stat label="Longest win streak" value={`${r.winStreak} day${r.winStreak === 1 ? '' : 's'}`} />
        <Stat label="Longest loss streak" value={`${r.lossStreak} day${r.lossStreak === 1 ? '' : 's'}`} />
        <Stat label="Max drawdown" value={r.maxDrawdown ? `-${fmt(r.maxDrawdown)}` : '0'} sub="biggest fall from a peak" cls={r.maxDrawdown ? 'is-loss' : ''} />
      </section>

      <section className="panel">
        <h3 className="panel__title">Cumulative P&amp;L</h3>
        <EquityChart curve={r.curve} />
      </section>

      <div className="panels">
        <section className="panel">
          <h3 className="panel__title">Average by weekday</h3>
          <Bars
            items={r.weekdays}
            label={(g) => g.key.slice(0, 3)}
            value={(g) => g.total / g.days}
            sub={(g) => `${Math.round((g.wins / g.days) * 100)}% win · ${g.days}d`}
          />
        </section>
        <section className="panel">
          <h3 className="panel__title">By month</h3>
          <Bars
            items={r.months}
            label={(g) => monthLabel(g.key)}
            value={(g) => g.total}
            sub={(g) => `${Math.round((g.wins / g.days) * 100)}% win · ${g.days}d`}
          />
        </section>
      </div>
    </div>
  )
}
