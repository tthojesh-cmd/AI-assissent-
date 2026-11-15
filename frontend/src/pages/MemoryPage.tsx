import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { api, fmt } from '../api'
import { useAuth } from '../auth'
import { Empty, ErrorNote, PageHeader, Spinner, Toggle } from '../components/ui'

interface M { id: number; content: string; category: string; created_at: string }
const CATS = ['preference', 'project', 'language', 'task', 'other']

export default function MemoryPage() {
  const { user, refresh } = useAuth()
  const [list, setList] = useState<M[] | null>(null); const [err, setErr] = useState(''); const [text, setText] = useState(''); const [cat, setCat] = useState('preference')
  const [edit, setEdit] = useState<{ id: number; content: string } | null>(null)
  const load = useCallback(() => api<M[]>('/memory').then(setList).catch(e => setErr(e.message)), [])
  useEffect(() => { load() }, [load])
  const act = async (p: Promise<any>) => { setErr(''); try { await p; load() } catch (e: any) { setErr(e.message) } }
  const add = (e: FormEvent) => { e.preventDefault(); act(api('/memory', { body: { content: text, category: cat } }).then(() => setText(''))) }
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <PageHeader title="Memory" sub="Only what you approve is remembered. The agent asks before saving anything.">
        <label className="flex items-center gap-2 text-sm text-slate-300">Memory {user?.memory_enabled ? 'on' : 'off'}<Toggle label="Enable memory" on={!!user?.memory_enabled} onChange={v => api('/me', { method: 'PATCH', body: { memory_enabled: v } }).then(refresh)} /></label>
        <button className="btn-danger" onClick={() => confirm('Delete all memories?') && act(api('/memory', { method: 'DELETE' }))}>Clear all</button>
      </PageHeader>
      <form onSubmit={add} className="panel p-3 flex flex-wrap gap-2 mb-4">
        <input className="input flex-1 min-w-48" required maxLength={1000} placeholder="e.g. I prefer answers in Telugu with English code" value={text} onChange={e => setText(e.target.value)} />
        <select className="input !w-auto" value={cat} onChange={e => setCat(e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
        <button className="btn-primary"><Plus size={16} />Save</button>
      </form>
      <ErrorNote msg={err} />
      {!list ? <Spinner /> : list.length === 0 ? <Empty title="No memories saved" hint="Add one above, or ask the agent to remember something." /> : (
        <ul className="space-y-2 mt-2">{list.map(m => (
          <li key={m.id} className="panel p-3 flex items-center gap-3">
            {edit?.id === m.id ? <><input className="input" value={edit.content} onChange={e => setEdit({ id: m.id, content: e.target.value })} />
              <button aria-label="Save" className="p-2 text-emerald-300" onClick={() => act(api(`/memory/${m.id}`, { method: 'PUT', body: { content: edit.content, category: m.category } }).then(() => setEdit(null)))}><Check size={16} /></button>
              <button aria-label="Cancel" className="p-2" onClick={() => setEdit(null)}><X size={16} /></button></> :
              <><div className="flex-1 min-w-0"><p className="text-slate-100 break-words">{m.content}</p><p className="text-xs text-slate-500">{m.category} · {fmt(m.created_at)}</p></div>
                <button aria-label="Edit memory" className="p-2 text-slate-500 hover:text-white" onClick={() => setEdit({ id: m.id, content: m.content })}><Pencil size={15} /></button>
                <button aria-label="Delete memory" className="p-2 text-slate-500 hover:text-red-300" onClick={() => act(api(`/memory/${m.id}`, { method: 'DELETE' }))}><Trash2 size={15} /></button></>}
          </li>))}</ul>)}
    </div>
  )
}
