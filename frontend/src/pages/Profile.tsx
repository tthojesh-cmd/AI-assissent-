import { FormEvent, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { ErrorNote, PageHeader } from '../components/ui'

export default function Profile() {
  const { user, refresh, logout } = useAuth()
  const [name, setName] = useState(user?.name ?? ''); const [pw, setPw] = useState({ current: '', new: '' })
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('')
  const save = async (e: FormEvent) => { e.preventDefault(); setErr(''); try { await api('/me', { method: 'PATCH', body: { name } }); await refresh(); setMsg('Profile saved.') } catch (e: any) { setErr(e.message) } }
  const change = async (e: FormEvent) => { e.preventDefault(); setErr(''); setMsg(''); if (pw.new.length < 8) return setErr('New password must be at least 8 characters.'); try { await api('/me/password', { body: pw }); setPw({ current: '', new: '' }); setMsg('Password changed.') } catch (e: any) { setErr(e.message) } }
  return (
    <div className="p-4 md:p-8 max-w-xl mx-auto space-y-5">
      <PageHeader title="Profile" sub={user?.email} />
      <div className="grid grid-cols-3 gap-3 text-center">{Object.entries(user?.stats ?? {}).map(([k, v]) => <div key={k} className="glass p-3"><div className="text-2xl font-bold text-white">{v}</div><div className="text-xs text-slate-400">{k}</div></div>)}</div>
      {msg && <p className="text-sm text-emerald-300" role="status">{msg}</p>}<ErrorNote msg={err} />
      <form onSubmit={save} className="panel p-4 space-y-3"><label className="text-sm text-slate-400">Display name<input className="input mt-1" value={name} onChange={e => setName(e.target.value)} /></label><button className="btn-primary">Save profile</button></form>
      <form onSubmit={change} className="panel p-4 space-y-3"><h2 className="font-semibold text-white">Change password</h2>
        <input className="input" type="password" placeholder="Current password" autoComplete="current-password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} />
        <input className="input" type="password" placeholder="New password (8+ characters)" autoComplete="new-password" value={pw.new} onChange={e => setPw({ ...pw, new: e.target.value })} />
        <button className="btn-ghost">Update password</button></form>
      <button className="btn-danger" onClick={logout}>Sign out</button>
    </div>
  )
}
