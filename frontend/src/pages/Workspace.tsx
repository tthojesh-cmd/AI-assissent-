import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Play, ShieldCheck } from 'lucide-react'
import { api, fmt, Activity, Msg } from '../api'
import Approvals from '../components/Approvals'
import { Badge, Empty, ErrorNote, Markdown, PageHeader, Spinner } from '../components/ui'

interface ToolInfo { name: string; description: string; sensitive: boolean; available: boolean }

export default function Workspace() {
  const [acts, setActs] = useState<Activity[] | null>(null); const [tools, setTools] = useState<ToolInfo[]>([])
  const [status, setStatus] = useState<{ online: boolean; model: string; desktop_enabled: boolean } | null>(null)
  const [prompt, setPrompt] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [result, setResult] = useState<{ id: number; msg: Msg } | null>(null)
  const load = useCallback(() => { api<Activity[]>('/agent/activities').then(setActs).catch(e => setErr(e.message)) }, [])
  useEffect(() => { load(); api<ToolInfo[]>('/agent/tools').then(setTools); api<any>('/agent/status').then(setStatus); const i = setInterval(load, 5000); return () => clearInterval(i) }, [load])
  const run = async () => {
    if (!prompt.trim()) return; setBusy(true); setErr(''); setResult(null)
    try { const r = await api<{ conversation_id: number; message: Msg }>('/agent/run', { body: { prompt } }); setResult({ id: r.conversation_id, msg: r.message }); setPrompt(''); load() }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const pending = (acts ?? []).filter(a => a.status === 'pending')
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <PageHeader title="Agent workspace" sub="Give the agent a task, approve sensitive actions, and watch every step it takes.">
        {status && <span className="text-sm text-slate-300 glass px-3 py-2 flex items-center gap-2"><Cpu size={14} />{status.online ? status.model : 'Offline'}</span>}
      </PageHeader>
      <div className="panel p-4 mb-5">
        <textarea className="input min-h-24" placeholder="e.g. Search for the latest FastAPI release notes, then write a one-page PDF summary." value={prompt} onChange={e => setPrompt(e.target.value)} />
        <div className="flex justify-between items-center mt-3"><span className="text-xs text-slate-500">The agent plans, picks tools and verifies results. Sensitive steps wait for you.</span>
          <button className="btn-primary" disabled={busy || !prompt.trim()} onClick={run}><Play size={14} />{busy ? 'Working…' : 'Run task'}</button></div>
        <div className="mt-3 space-y-3"><ErrorNote msg={err} />{busy && <Spinner label="Agent is planning and executing…" />}
          {result && <div className="rounded-xl bg-white/5 p-3"><Markdown text={result.msg.content} /><Link className="text-sm text-violet-300 underline" to={`/chat/${result.id}`}>Open in chat</Link></div>}</div>
      </div>
      {pending.length > 0 && <div className="mb-5"><h2 className="font-semibold text-white mb-2">Waiting for your approval</h2><Approvals items={pending} onDone={load} /></div>}
      <div className="grid lg:grid-cols-5 gap-5">
        <div className="panel p-4 lg:col-span-3"><h2 className="font-semibold text-white mb-2">Execution monitor</h2>
          {!acts ? <Spinner /> : acts.length === 0 ? <Empty title="No activity yet" hint="Run a task above to see each step here." /> :
            <div className="max-h-[480px] overflow-y-auto">{acts.map(a => (
              <div key={a.id} className="py-2 border-b border-white/5 last:border-0"><div className="flex items-center justify-between gap-2"><span className="text-sm text-white font-medium">{a.tool}</span><Badge s={a.status} /></div>
                <p className="text-xs text-slate-400 mt-0.5 break-words">{a.detail}</p><p className="text-[11px] text-slate-600">{fmt(a.created_at)}</p></div>))}</div>}</div>
        <div className="panel p-4 lg:col-span-2"><h2 className="font-semibold text-white mb-2">Tools</h2>
          <div className="space-y-2 max-h-[480px] overflow-y-auto">{tools.map(t => (
            <div key={t.name} className="text-sm"><div className="flex items-center gap-2 text-slate-200"><span className="font-mono text-xs">{t.name}</span>{t.sensitive && <span title="Needs approval"><ShieldCheck size={13} className="text-amber-300" /></span>}{!t.available && <span className="text-xs text-red-300">disabled</span>}</div>
              <p className="text-xs text-slate-500">{t.description}</p></div>))}</div></div>
      </div>
    </div>
  )
}
