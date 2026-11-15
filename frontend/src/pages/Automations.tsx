import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Pause, Play, PlayCircle, Plus, Trash2 } from 'lucide-react'
import { api, fmt } from '../api'
import { Badge, Empty, ErrorNote, PageHeader, Spinner, Toggle } from '../components/ui'

interface A { id: number; name: string; kind: string; payload: string; interval_minutes: number; recurring: boolean; enabled: boolean; paused: boolean; next_run: string | null; last_run: string | null; last_status: string }
interface Log { id: number; automation_name: string; status: string; output: string; created_at: string }

export default function Automations() {
  const [list, setList] = useState<A[] | null>(null); const [logs, setLogs] = useState<Log[]>([]); const [err, setErr] = useState(''); const [busy, setBusy] = useState<number | null>(null)
  const [f, setF] = useState({ name: '', kind: 'reminder', payload: '', interval_minutes: 60, recurring: true })
  const load = useCallback(() => { api<A[]>('/automations').then(setList).catch(e => setErr(e.message)); api<Log[]>('/automations/logs/all').then(setLogs).catch(() => {}) }, [])
  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i) }, [load])
  const act = async (p: Promise<any>, id?: number) => { setErr(''); if (id) setBusy(id); try { await p; load() } catch (e: any) { setErr(e.message) } finally { setBusy(null) } }
  const create = (e: FormEvent) => { e.preventDefault(); act(api('/automations', { body: f }).then(() => setF({ ...f, name: '', payload: '' }))) }
  const status = (a: A) => !a.enabled ? 'disabled' : a.paused ? 'paused' : 'active'
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <PageHeader title="Automation center" sub="Run reminders or agent prompts on a schedule. Sensitive agent actions still wait for your approval." />
      <form onSubmit={create} className="panel p-4 grid md:grid-cols-6 gap-2 mb-5">
        <input className="input md:col-span-3" required placeholder="Name, e.g. Morning briefing" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <select className="input md:col-span-3" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="reminder">Reminder (creates a notification)</option><option value="agent_prompt">Agent prompt (runs the AI)</option></select>
        <textarea className="input md:col-span-6" required placeholder={f.kind === 'reminder' ? 'Reminder text' : 'What should the agent do each time?'} value={f.payload} onChange={e => setF({ ...f, payload: e.target.value })} />
        <label className="md:col-span-2 text-sm text-slate-400 flex items-center gap-2">Every <input type="number" min={1} className="input !w-24" value={f.interval_minutes} onChange={e => setF({ ...f, interval_minutes: +e.target.value })} /> min</label>
        <label className="md:col-span-2 text-sm text-slate-400 flex items-center gap-2">Repeat <Toggle on={f.recurring} onChange={v => setF({ ...f, recurring: v })} label="Repeat" /></label>
        <button className="btn-primary md:col-span-2"><Plus size={16} />Create automation</button>
      </form>
      <ErrorNote msg={err} />
      <div className="grid lg:grid-cols-2 gap-5 mt-3">
        <div className="space-y-3">
          <h2 className="font-semibold text-white">Scheduled</h2>
          {!list ? <Spinner /> : list.length === 0 ? <Empty title="No automations yet" hint="Create one above." /> : list.map(a => (
            <div key={a.id} className="panel p-4">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-medium text-white truncate">{a.name}</p><p className="text-xs text-slate-500">{a.kind === 'reminder' ? 'Reminder' : 'Agent prompt'} · {a.recurring ? `every ${a.interval_minutes} min` : `once in ${a.interval_minutes} min`}</p></div><Badge s={status(a) === 'active' ? 'success' : status(a) === 'paused' ? 'pending' : 'denied'} /></div>
              <p className="text-xs text-slate-400 mt-2 line-clamp-2">{a.payload}</p>
              <p className="text-[11px] text-slate-500 mt-1">Next: {fmt(a.next_run) || '—'} · Last: {fmt(a.last_run) || 'never'} ({a.last_status})</p>
              <div className="flex items-center gap-2 mt-3">
                <button className="btn-ghost !py-1" disabled={!a.enabled || busy === a.id} onClick={() => act(api(`/automations/${a.id}`, { method: 'PATCH', body: { paused: !a.paused } }), a.id)}>{a.paused ? <Play size={14} /> : <Pause size={14} />}{a.paused ? 'Resume' : 'Pause'}</button>
                <button className="btn-ghost !py-1" disabled={busy === a.id} onClick={() => act(api(`/automations/${a.id}/run`, { method: 'POST' }), a.id)}><PlayCircle size={14} />{busy === a.id ? 'Running…' : 'Run now'}</button>
                <span className="ml-auto flex items-center gap-2 text-xs text-slate-400">Enabled <Toggle on={a.enabled} onChange={v => act(api(`/automations/${a.id}`, { method: 'PATCH', body: { enabled: v } }))} label="Enabled" /></span>
                <button aria-label="Delete automation" className="p-1.5 text-slate-500 hover:text-red-300" onClick={() => confirm('Delete this automation?') && act(api(`/automations/${a.id}`, { method: 'DELETE' }))}><Trash2 size={15} /></button>
              </div></div>))}
        </div>
        <div><h2 className="font-semibold text-white mb-3">Execution history</h2>
          <div className="panel divide-y divide-white/5 max-h-[560px] overflow-y-auto">{logs.length === 0 ? <Empty title="No runs yet" hint="Logs appear after an automation runs." /> : logs.map(l => (
            <div key={l.id} className="p-3"><div className="flex justify-between gap-2"><span className="text-sm text-slate-200 truncate">{l.automation_name}</span><Badge s={l.status} /></div><p className="text-xs text-slate-400 mt-1 break-words">{l.output}</p><p className="text-[11px] text-slate-600">{fmt(l.created_at)}</p></div>))}</div></div>
      </div>
    </div>
  )
}
