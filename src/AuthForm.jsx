import { useState } from 'react'
import PhoneField from './PhoneField'
import { toE164 } from './countries'
import * as api from './api'

// mode: 'login' | 'register'
export default function AuthForm({ onAuthed }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [country, setCountry] = useState('IN')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isRegister = mode === 'register'

  const switchMode = (m) => {
    setMode(m)
    setError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    const full = toE164(country, phone)
    if (!full) return setError('Enter a valid phone number')
    if (isRegister && name.trim().length < 2) return setError('Enter your name')
    setError('')
    setBusy(true)
    try {
      const { token, user } = isRegister ? await api.register(name.trim(), full) : await api.login(full)
      api.setToken(token)
      onAuthed(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="login__form" onSubmit={submit} noValidate>
      <h1 className={`login__title ${isRegister ? '' : 'login__title--brand'}`}>{isRegister ? 'Create account' : 'Trade History'}</h1>
      {isRegister && (
        <>
          <label htmlFor="name" className="login__label">
            Name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Full name"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="login__input"
          />
        </>
      )}
      <label htmlFor="phone" className="login__label">
        Phone number
      </label>
      <PhoneField
        country={country}
        phone={phone}
        onCountry={setCountry}
        onPhone={setPhone}
        invalid={!!error}
        describedBy={error ? 'form-error' : undefined}
      />
      {error && (
        <p id="form-error" className="login__error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="login__button" disabled={busy}>
        {busy ? (
          <>
            <span className="spinner" /> Please wait…
          </>
        ) : isRegister ? (
          'Register'
        ) : (
          'Submit'
        )}
      </button>
      <p className="login__hint">
        {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
        <button type="button" className="login__link" onClick={() => switchMode(isRegister ? 'login' : 'register')}>
          {isRegister ? 'Log in' : 'Register'}
        </button>
      </p>
    </form>
  )
}
