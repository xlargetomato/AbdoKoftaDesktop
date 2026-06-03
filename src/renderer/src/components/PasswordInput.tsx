import { useState } from 'react'

interface PasswordInputProps {
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  required?: boolean
}

export function PasswordInput({
  value,
  onChange,
  autoComplete = 'current-password',
  required
}: PasswordInputProps): React.ReactElement {
  const [visible, setVisible] = useState(false)

  return (
    <div className="password-field">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
        dir="ltr"
      />
      <button
        type="button"
        className="password-field__toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        title={visible ? 'إخفاء' : 'إظهار'}
      >
        {visible ? (
          <EyeOffIcon />
        ) : (
          <EyeIcon />
        )}
      </button>
    </div>
  )
}

function EyeIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function EyeOffIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-4.42M9.88 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a18.82 18.82 0 0 1-4.11 5.06M6.61 6.61A18.5 18.5 0 0 0 1 12s4 7 11 7a10.66 10.66 0 0 0 5.39-1.45"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
