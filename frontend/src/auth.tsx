import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { api, setToken, getToken, User } from './api'

interface Ctx { user: User | null; loading: boolean; login: (e: string, p: string) => Promise<void>; signup: (e: string, p: string, n: string) => Promise<void>; logout: () => void; refresh: () => Promise<void> }
const C = createContext<Ctx>(null as any)
export const useAuth = () => useContext(C)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!getToken())
  const refresh = useCallback(async () => { try { setUser(await api<User>('/me')) } catch { setToken(null); setUser(null) } finally { setLoading(false) } }, [])
  useEffect(() => { if (getToken()) refresh() }, [refresh])
  const auth = async (path: string, body: object) => { const r = await api<{ token: string; user: User }>(path, { body }); setToken(r.token); await refresh() }
  return (
    <C.Provider value={{ user, loading, refresh,
      login: (email, password) => auth('/auth/login', { email, password }),
      signup: (email, password, name) => auth('/auth/signup', { email, password, name }),
      logout: () => { setToken(null); setUser(null) } }}>
      {children}
    </C.Provider>
  )
}
