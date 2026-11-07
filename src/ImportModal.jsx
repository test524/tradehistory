import { useRef, useState } from 'react'
import * as api from './api'
import { readReportFile } from './importer'

const money = (n) => (n < 0 ? '-' : n > 0 ? '+' : '') + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })

export default function ImportModal({ onClose, onImported }) {
  const [parsed, setParsed] = useState(null) // result of readReportFile
  const [fileName, setFileName] = useState('')
  const [overwrite, setOverwrite] = useState(true)
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setParsed(null)
    setFileName(file.name)
    setReading(true)
    try {
      setParsed(await readReportFile(file))
    } catch (err) {
      setError(err.message || 'Could not read this file')
    } finally {
      setReading(false)
    }
  }

  async function runImport() {
    setError('')
    setSaving(true)
    try {
      const res = await api.importPnl(parsed.entries, overwrite)
      onImported(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const stats = parsed && {
    days: parsed.entries.length,
    total: parsed.entries.reduce((a, e) => a + e.pnl, 0),
    wins: parsed.entries.filter((e) => e.pnl > 0).length,
    from: parsed.entries[0].date,
    to: parsed.entries[parsed.entries.length - 1].date,
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__box modal__box--wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Import P&amp;L from Zerodha</h3>
        <p className="import__help">
          In Zerodha Console go to <strong>Reports → P&amp;L</strong> and download the report (.xlsx). Choose it here.
          Rows are added up per day.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,.txt"
          onChange={onFile}
          className="import__file"
          aria-label="Choose report file"
        />
        <button type="button" className="modal__cancel" onClick={() => inputRef.current?.click()}>
          {fileName || 'Choose file…'}
        </button>

        {reading && (
          <p className="import__status">
            <span className="spinner" /> Reading file…
          </p>
        )}

        {stats && (
          <div className="import__preview">
            <div>
              <strong>{stats.days}</strong> days · {stats.from} → {stats.to}
            </div>
            <div className={stats.total > 0 ? 'is-win' : 'is-loss'}>
              Total <strong>{money(stats.total)}</strong>
              <span className="import__muted">
                {' '}
                ({stats.wins} green, {stats.days - stats.wins} red)
              </span>
            </div>
            <div className="import__muted">
              Read “{parsed.dateHeader}” and “{parsed.pnlHeader}” from {parsed.sheet}
              {parsed.skipped ? ` · ${parsed.skipped} rows skipped` : ''}
            </div>
          </div>
        )}

        {parsed && (
          <label className="import__check">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            Replace days that already have a value
          </label>
        )}

        {error && (
          <p className="login__error" role="alert">
            {error}
          </p>
        )}

        <div className="modal__actions">
          <button type="button" className="modal__cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="login__button modal__save" disabled={!parsed || saving} onClick={runImport}>
            {saving ? (
              <>
                <span className="spinner" /> Importing…
              </>
            ) : (
              'Import'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
