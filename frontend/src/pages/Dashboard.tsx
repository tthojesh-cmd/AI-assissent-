import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, Clock, ListChecks, MessageSquare, Mic, ShieldAlert, Workflow, FolderOpen } from 'lucide-react'
import { api, fmt, Activity, Conv } from '../api'
import { Badge, Empty, ErrorNote, Spinner } from '../components/ui'

interface D { name: string; online: boolean; model: string; completed: number; pending: number; pending_approvals: number; conversations: Conv[]; activities: Activity[]; activity_by_day: { day: string; count: number }[]; tool_success: Record<string, number> }

export default function Dashboard() {
  const [d, setD] = useState<D | null>(null); const [err, setErr] = useState('')
  useEffect(() => { const load = () => api<D>('/dashboard').then(setD).catch(e => setErr(e.message)); load(); const i = setInterval(load, 10000); return () => clearInterval(i) }, [])
  if (err && !d) return <div className="p-6"><ErrorNote msg={err} /></div>
  if (!d) return <Spinner />
  const max = Math.max(1, ...d.activity_by_day.map(x => x.count))
  const total = Object.values(d.tool_success).reduce((a, b) => a + b, 0) || 1
  const stat = (label: string, v: number, Icon: any, to: string) => (
    <Link to={to} className="glass p-4 hover:bg-white/[0.07] transition"><Icon size={18} className="text-violet-300" /><div className="text-3xl font-bold text-white mt-2">{v}</div><div className="text-sm text-slate-400">{label}</div></Link>)
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl p-6 md:p-8 border border-white/10 bg-gradient-to-br from-violet-600/25 via-blue-900/30 to-black/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-3xl font-bold text-white">Welcome back, {d.name}</h1><p className="text-slate-300 mt-1">What should we work on?</p></div>
          <div className={`flex items-center gap-2 text-sm rounded-full px-3 py-1.5 border ${d.online ? 'border-emerald-400/40 text-emerald-300 bg-emerald-500/10' : 'border-red-400/40 text-red-300 bg-red-500/10'}`}>
            <span className={`h-2 w-2 rounded-full ${d.online ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />{d.online ? `Agent online · ${d.model}` : 'Agent offline · set OPENAI_API_KEY'}</div>
        </div>
        <div className="flex flex-wrap gap-2 mt-5">
          <Link to="/chat" className="btn-primary"><MessageSquare size={16} />New chat</Link>
          <Link to="/voice" className="btn-ghost"><Mic size={16} />Talk to agent</Link>
          <Link to="/tasks" className="btn-ghost"><ListChecks size={16} />Add task</Link>
          <Link to="/files" className="btn-ghost"><FolderOpen size={16} />Files</Link>
          <Link to="/automations" className="btn-ghost"><Workflow size={16} />Automate</Link>
        </div>
      </motion.div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stat('Tasks completed', d.completed, CheckCircle2, '/tasks')}{stat('Tasks pending', d.pending, Clock, '/tasks')}
        {stat('Awaiting approval', d.pending_approvals, ShieldAlert, '/workspace')}{stat('Conversations', d.conversations.length, MessageSquare, '/history')}
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="panel p-4 md:col-span-2"><h2 className="font-semibold text-white mb-3">Agent activity, last 7 days</h2>
          <div className="flex items-end gap-3 h-32">{d.activity_by_day.map(x => (
            <div key={x.day} className="flex-1 flex flex-col items-center gap-1"><span className="text-xs text-slate-400">{x.count}</span>
              <div className="w-full rounded-t-lg bg-gradient-to-t from-blue-600 to-violet-500" style={{ height: `${Math.max(4, (x.count / max) * 80)}px` }} /><span className="text-xs text-slate-500">{x.day}</span></div>))}</div></div>
        <div className="panel p-4"><h2 className="font-semibold text-white mb-3">Tool results</h2>
          {Object.keys(d.tool_success).length === 0 ? <p className="text-sm text-slate-400">No tool runs yet.</p> : Object.entries(d.tool_success).map(([k, v]) => (
            <div key={k} className="mb-2"><div className="flex justify-between text-xs text-slate-400"><span>{k}</span><span>{v}</span></div><div className="h-1.5 rounded bg-white/10"><div className="h-full rounded bg-violet-500" style={{ width: `${(v / total) * 100}%` }} /></div></div>))}</div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="panel p-4"><h2 className="font-semibold text-white mb-2">Recent conversations</h2>
          {d.conversations.length === 0 ? <Empty title="No conversations yet" hint="Start a chat to see it here." /> : d.conversations.map(c => (
            <Link key={c.id} to={`/chat/${c.id}`} className="flex justify-between gap-3 py-2 border-b border-white/5 last:border-0 hover:text-white text-slate-300 text-sm"><span className="truncate">{c.title}</span><span className="text-slate-500 shrink-0">{fmt(c.updated_at)}</span></Link>))}</div>
        <div className="panel p-4"><h2 className="font-semibold text-white mb-2">Recent activity</h2>
          {d.activities.length === 0 ? <Empty title="No agent activity yet" hint="Ask the agent to use a tool, like searching the web." /> : d.activities.map(a => (
            <div key={a.id} className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0 text-sm"><div className="min-w-0"><div className="text-slate-200">{a.tool}</div><div className="text-xs text-slate-500 truncate">{a.detail}</div></div><Badge s={a.status} /></div>))}</div>
      </div>
    </div>
  )
}
