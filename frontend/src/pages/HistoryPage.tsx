import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Trash2 } from 'lucide-react'
import { api, fmt, Conv } from '../api'
import { Empty, ErrorNote, PageHeader, Spinner } from '../components/ui'

export default function HistoryPage() {
  const [list, setList] = useState<Conv[] | null>(null); const [q, setQ] = useState(''); const [err, setErr] = useState('')
  const load = useCallback(() => api<Conv[]>('/chat/conversations').then(setList).catch(e => setErr(e.message)), [])
  useEffect(() => { load() }, [load])
  const act = async (p: Promise<any>) => { try { await p; load() } catch (e: any) { setErr(e.message) } }
  const shown = (list ?? []).filter(c => c.title.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <PageHeader title="Conversation history"><button className="btn-danger" onClick={() => confirm('Delete ALL conversations? This cannot be undone.') && act(api('/chat/conversations', { method: 'DELETE' }))}>Clear all history</button></PageHeader>
      <div className="relative mb-4"><Search size={16} className="absolute left-3 top-3 text-slate-500" /><input className="input !pl-9" placeholder="Search conversations" value={q} onChange={e => setQ(e.target.value)} /></div>
      <ErrorNote msg={err} />
      {!list ? <Spinner /> : shown.length === 0 ? <Empty title={q ? 'No matches' : 'No conversations yet'} hint={q ? 'Try a different word.' : 'Your chats will be listed here.'} /> : (
        <ul className="space-y-2">{shown.map(c => (
          <li key={c.id} className="panel flex items-center"><Link to={`/chat/${c.id}`} className="flex-1 min-w-0 p-3 hover:text-white text-slate-200"><p className="truncate">{c.title}</p><p className="text-xs text-slate-500">{fmt(c.updated_at)}</p></Link>
            <button aria-label="Delete conversation" className="p-3 text-slate-500 hover:text-red-300" onClick={() => confirm('Delete this conversation?') && act(api(`/chat/conversations/${c.id}`, { method: 'DELETE' }))}><Trash2 size={16} /></button></li>))}</ul>)}
    </div>
  )
}
