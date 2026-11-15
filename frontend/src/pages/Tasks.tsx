import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Bell, Check, Plus, Trash2, Undo2 } from 'lucide-react'
import { api, fmt, Task } from '../api'
import { Empty, ErrorNote, PageHeader, Spinner } from '../components/ui'

const prio: Record<string, string> = { high: 'text-red-300', medium: 'text-amber-300', low: 'text-slate-400' }

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[] | null>(null); const [err, setErr] = useState('')
  const [f, setF] = useState({ title: '', due: '', kind: 'task', priority: 'medium' }); const [filter, setFilter] = useState<'pending' | 'done' | 'all'>('pending')
  const load = useCallback(() => api<Task[]>('/tasks').then(setTasks).catch(e => setErr(e.message)), [])
  useEffect(() => { load() }, [load])
  const add = async (e: FormEvent) => {
    e.preventDefault(); setErr('')
    try { await api('/tasks', { body: { title: f.title, kind: f.kind, priority: f.priority, due_at: f.due ? new Date(f.due).toISOString() : null } }); setF({ ...f, title: '', due: '' }); load() } catch (e: any) { setErr(e.message) }
  }
  const toggle = (t: Task) => api(`/tasks/${t.id}`, { method: 'PATCH', body: { status: t.status === 'done' ? 'pending' : 'done' } }).then(load).catch(e => setErr(e.message))
  const del = (t: Task) => api(`/tasks/${t.id}`, { method: 'DELETE' }).then(load).catch(e => setErr(e.message))
  const shown = (tasks ?? []).filter(t => filter === 'all' || t.status === filter)
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <PageHeader title="Tasks & reminders" sub="Reminders notify you here when they are due." />
      <form onSubmit={add} className="panel p-4 grid sm:grid-cols-6 gap-2 mb-4">
        <input className="input sm:col-span-6" required placeholder="What needs doing?" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
        <input className="input sm:col-span-2" type="datetime-local" aria-label="Due" value={f.due} onChange={e => setF({ ...f, due: e.target.value })} />
        <select className="input sm:col-span-2" aria-label="Type" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="task">Task</option><option value="reminder">Reminder</option></select>
        <select className="input sm:col-span-1" aria-label="Priority" value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option></select>
        <button className="btn-primary sm:col-span-1"><Plus size={16} />Add</button>
      </form>
      <div className="flex gap-2 mb-3">{(['pending', 'done', 'all'] as const).map(k => <button key={k} onClick={() => setFilter(k)} className={filter === k ? 'btn-primary !py-1' : 'btn-ghost !py-1'}>{k}</button>)}</div>
      <ErrorNote msg={err} />
      {!tasks ? <Spinner /> : shown.length === 0 ? <Empty title="Nothing here" hint="Add a task above, or ask the agent to create one." /> : (
        <ul className="space-y-2">{shown.map(t => (
          <li key={t.id} className="panel p-3 flex items-center gap-3">
            <button aria-label={t.status === 'done' ? 'Mark pending' : 'Mark done'} onClick={() => toggle(t)} className={`h-7 w-7 grid place-items-center rounded-full border ${t.status === 'done' ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300' : 'border-white/20 text-transparent hover:text-slate-400'}`}>{t.status === 'done' ? <Undo2 size={14} /> : <Check size={14} />}</button>
            <div className="flex-1 min-w-0"><p className={`truncate ${t.status === 'done' ? 'line-through text-slate-500' : 'text-slate-100'}`}>{t.title}</p>
              <p className="text-xs text-slate-500">{t.kind === 'reminder' && <Bell size={11} className="inline mr-1" />}<span className={prio[t.priority]}>{t.priority}</span>{t.due_at && ` · due ${fmt(t.due_at)}`}</p></div>
            <button aria-label="Delete task" onClick={() => del(t)} className="p-2 text-slate-500 hover:text-red-300"><Trash2 size={16} /></button>
          </li>))}</ul>)}
    </div>
  )
}
