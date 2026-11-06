import { useEffect, useState } from 'react'
import './App.css'
import AuthLayout from './AuthLayout'
import AuthForm from './AuthForm'
import Dashboard from './Dashboard'
import * as api from './api'
import { useTheme } from './theme'

function App() {
  const [user, setUser] = useState(null)
  const [theme, toggleTheme] = useTheme()
  const [checking, setChecking] = useState(!!api.getToken())

  // restore session
  useEffect(() => {
    if (!api.getToken()) return
    api
      .me()
      .then(setUser)
      .catch(() => api.setToken(null))
      .finally(() => setChecking(false))
  }, [])

  if (checking) return null

  if (user) {
    return (
      <Dashboard
        user={user}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={() => {
          api.setToken(null)
          setUser(null)
        }}
      />
    )
  }

  return (
    <AuthLayout>
      <button
        type="button"
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <AuthForm onAuthed={setUser} />
    </AuthLayout>
  )
}

export default App
