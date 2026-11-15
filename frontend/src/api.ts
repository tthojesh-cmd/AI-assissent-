const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
export const getToken = () => localStorage.getItem('token')
export const setToken = (t: string | null) => (t ? localStorage.setItem('token', t) : localStorage.removeItem('token'))

export class ApiError extends Error {
  status: number
  constructor(msg: string, status: number) { super(msg); this.status = status }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const t = getToken()
  if (t) headers.Authorization = `Bearer ${t}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(BASE + '/api' + path, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
      headers, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    })
  } catch {
    throw new ApiError('Cannot reach the server. Is the backend running on port 8000?', 0)
  }
  if (res.status === 401 && t && !path.startsWith('/auth')) { setToken(null); window.location.href = '/login' }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(typeof data.detail === 'string' ? data.detail : 'Request failed', res.status)
  return data as T
}

export interface User { id: number; email: string; name: string; language: string; memory_enabled: boolean; settings: Record<string, any>; stats?: Record<string, number> }
export interface Msg { id: number; role: 'user' | 'assistant'; content: string; meta: { tools?: { tool: string; ok: boolean; summary: string }[]; pending?: number[]; attachment_names?: string[] }; created_at: string }
export interface Conv { id: number; title: string; updated_at: string; messages?: Msg[] }
export interface Activity { id: number; conversation_id: number | null; tool: string; args: Record<string, any>; status: string; detail: string; created_at: string }
export interface Task { id: number; title: string; description: string; kind: string; priority: string; status: string; due_at: string | null }
export const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '')
