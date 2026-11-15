import { FormEvent, useState } from 'react'
import { motion } from 'framer-motion'
import { Bot } from 'lucide-react'
import { useAuth } from '../auth'
import { ErrorNote } from '../components/ui'

export default function Login() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('')
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr('Enter a valid email address.')
    if (mode === 'signup' && f.password.length < 8) return setErr('Password must be at least 8 characters.')
    setBusy(true)
    try { mode === 'login' ? await login(f.email, f.password) : await signup(f.email, f.password, f.name) } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="h-full grid place-items-center p-4">
      <motion.form onSubmit={submit} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass w-full max-w-sm p-7 space-y-4">
        <div className="flex items-center gap-3"><span className="grid place-items-center h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600"><Bot /></span>
          <div><h1 className="text-xl font-bold text-white">Personal AI Agent</h1><p className="text-sm text-slate-400">{mode === 'login' ? 'Sign in to continue' : 'Create your account'}</p></div></div>
        {mode === 'signup' && <input className="input" placeholder="Your name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />}
        <input className="input" type="email" placeholder="Email" autoComplete="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
        <input className="input" type="password" placeholder="Password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
        <ErrorNote msg={err} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="text-sm text-slate-400 hover:text-white w-full" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErr('') }}>
          {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}</button>
      </motion.form>
    </div>
  )
}
