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
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isRegister = mode === 'register'

  const switchMode = (m) => {
    setMode(m)
    setError('')
    setPin('')
    setPin2('')
  }

  const submit = async (e) => {
    e.preventDefault()
    const full = toE164(country, phone)
    if (!full) return setError('Enter a valid phone number')
    if (isRegister && name.trim().length < 2) return setError('Enter your name')
    if (!/^\d{4}$/.test(pin)) return setError('Enter your 4-digit PIN')
    if (isRegister && pin !== pin2) return setError('The two PINs do not match')
    setError('')
    setBusy(true)
    try {
      const { token, user } = isRegister ? await api.register(name.trim(), full, pin) : await api.login(full, pin)
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
      <label htmlFor="pin" className="login__label">
        {isRegister ? 'Create a 4-digit PIN' : 'PIN'}
      </label>
      <input
        id="pin"
        type="password"
        inputMode="numeric"
        autoComplete={isRegister ? 'new-password' : 'current-password'}
        maxLength={4}
        placeholder="••••"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        aria-invalid={!!error}
        className="login__input login__pin"
      />
      {isRegister && (
        <input
          id="pin2"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          placeholder="Confirm PIN"
          aria-label="Confirm PIN"
          value={pin2}
          onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
          className="login__input login__pin"
        />
      )}
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
