const TOKEN_KEY = 'th_token'

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
export const setToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable */
  }
}

async function request(path, body) {
  const token = getToken()
  const res = await fetch(`/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}

export const register = (name, phone) => request('/auth/register', { name, phone })
export const login = (phone) => request('/auth/login', { phone })
export const me = () => request('/auth/me')
export const listPnl = (from, to) => request(`/pnl?from=${from}&to=${to}`)
export const savePnl = (date, pnl) => request('/pnl', { date, pnl })
export const importPnl = (entries, overwrite) => request('/pnl/bulk', { entries, overwrite })
export const listAllPnl = () => request('/pnl')
