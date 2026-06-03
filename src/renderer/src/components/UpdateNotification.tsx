import { useEffect, useState } from 'react'

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; percent: number }
  | { phase: 'ready'; version: string }
  | { phase: 'error'; message: string }

export function UpdateNotification(): React.ReactElement | null {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })

  useEffect(() => {
    // Only available inside Electron
    const api = window.electronAPI
    if (!api?.onUpdateAvailable) return

    const unsubAvailable = api.onUpdateAvailable(({ version }) => {
      setState({ phase: 'available', version })
    })

    const unsubProgress = api.onDownloadProgress(({ percent }) => {
      setState({ phase: 'downloading', percent })
    })

    const unsubDownloaded = api.onUpdateDownloaded(({ version }) => {
      setState({ phase: 'ready', version })
    })

    const unsubError = api.onUpdaterError(({ message }) => {
      setState({ phase: 'error', message })
    })

    return () => {
      unsubAvailable()
      unsubProgress()
      unsubDownloaded()
      unsubError()
    }
  }, [])

  function handleDownload(): void {
    setState((prev) =>
      prev.phase === 'available'
        ? { phase: 'downloading', percent: 0 }
        : prev
    )
    window.electronAPI.updaterStartDownload().catch(() => {})
  }

  function handleInstall(): void {
    window.electronAPI.updaterQuitAndInstall().catch(() => {})
  }

  function handleDismiss(): void {
    setState({ phase: 'idle' })
  }

  if (state.phase === 'idle') return null

  return (
    <div className="update-banner" role="status" aria-live="polite">
      {state.phase === 'available' && (
        <>
          <span className="update-banner__icon">⬆</span>
          <span className="update-banner__text">
            يتوفر إصدار جديد{' '}
            <strong className="update-banner__version">v{state.version}</strong>
          </span>
          <div className="update-banner__actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={handleDownload}
            >
              تحميل التحديث
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleDismiss}
              aria-label="تجاهل التحديث"
            >
              لاحقاً
            </button>
          </div>
        </>
      )}

      {state.phase === 'downloading' && (
        <>
          <span className="update-banner__icon update-banner__icon--spin">↻</span>
          <span className="update-banner__text">
            جارٍ التحميل…{' '}
            <strong className="update-banner__version">{state.percent}%</strong>
          </span>
          <div className="update-banner__progress-wrap">
            <div
              className="update-banner__progress-bar"
              style={{ width: `${state.percent}%` }}
              role="progressbar"
              aria-valuenow={state.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </>
      )}

      {state.phase === 'ready' && (
        <>
          <span className="update-banner__icon">✔</span>
          <span className="update-banner__text">
            التحديث{' '}
            <strong className="update-banner__version">v{state.version}</strong>{' '}
            جاهز للتثبيت
          </span>
          <div className="update-banner__actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={handleInstall}
            >
              إعادة التشغيل والتثبيت
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleDismiss}
              aria-label="تثبيت لاحقاً"
            >
              لاحقاً
            </button>
          </div>
        </>
      )}

      {state.phase === 'error' && (
        <>
          <span className="update-banner__icon">⚠</span>
          <span className="update-banner__text update-banner__text--error">
            فشل التحديث: {state.message}
          </span>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handleDismiss}
          >
            إغلاق
          </button>
        </>
      )}
    </div>
  )
}
