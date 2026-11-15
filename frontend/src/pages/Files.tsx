import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, File as FileIcon, Folder, FolderPlus, Pencil, Trash2, Upload, X } from 'lucide-react'
import { api, fmt } from '../api'
import { Empty, ErrorNote, PageHeader, Spinner } from '../components/ui'

interface Item { name: string; path: string; type: 'file' | 'folder'; size: number | null; modified: string }

export default function Files() {
  const [path, setPath] = useState(''); const [items, setItems] = useState<Item[] | null>(null); const [err, setErr] = useState('')
  const [view, setView] = useState<{ name: string; content: string } | null>(null); const up = useRef<HTMLInputElement>(null)
  const load = useCallback(() => { setItems(null); api<{ items: Item[] }>(`/files?path=${encodeURIComponent(path)}`).then(r => setItems(r.items)).catch(e => { setErr(e.message); setItems([]) }) }, [path])
  useEffect(() => { load() }, [load])
  const run = async (p: Promise<any>) => { setErr(''); try { await p; load() } catch (e: any) { setErr(e.message) } }
  const join = (n: string) => (path ? `${path}/${n}` : n)
  const crumbs = path.split('/').filter(Boolean)
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <PageHeader title="File manager" sub="Your private workspace. The agent can only touch files inside this folder.">
        <button className="btn-ghost" onClick={() => { const n = prompt('Folder name'); if (n) run(api('/files/folder', { body: { path: join(n) } })) }}><FolderPlus size={16} />New folder</button>
        <input ref={up} type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.append('file', f); run(api(`/files/upload?path=${encodeURIComponent(path)}`, { form: fd })) } e.target.value = '' }} />
        <button className="btn-primary" onClick={() => up.current?.click()}><Upload size={16} />Upload</button>
      </PageHeader>
      <div className="flex items-center gap-1 text-sm text-slate-400 mb-3 flex-wrap">
        <button className="hover:text-white" onClick={() => setPath('')}>workspace</button>
        {crumbs.map((c, i) => <span key={i} className="flex items-center gap-1"><ChevronRight size={14} /><button className="hover:text-white" onClick={() => setPath(crumbs.slice(0, i + 1).join('/'))}>{c}</button></span>)}
      </div>
      <ErrorNote msg={err} />
      <div className="panel mt-2 divide-y divide-white/5">
        {!items ? <Spinner /> : items.length === 0 ? <Empty title="This folder is empty" hint="Upload a file, or ask the agent to create a document." /> : items.map(i => (
          <div key={i.path} className="flex items-center gap-3 px-4 py-2.5">
            <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => i.type === 'folder' ? setPath(i.path) : api<{ name: string; content: string }>(`/files/read?path=${encodeURIComponent(i.path)}`).then(setView).catch(e => setErr(e.message))}>
              {i.type === 'folder' ? <Folder size={18} className="text-violet-300" /> : <FileIcon size={18} className="text-slate-400" />}<span className="truncate text-slate-200">{i.name}</span></button>
            <span className="hidden sm:block text-xs text-slate-500">{i.size != null ? `${(i.size / 1024).toFixed(1)} KB` : ''} · {fmt(i.modified)}</span>
            <button aria-label={`Rename ${i.name}`} className="p-1.5 text-slate-500 hover:text-white" onClick={() => { const n = prompt('New name', i.name); if (n && n !== i.name) run(api('/files/rename', { body: { path: i.path, new_path: join(n) } })) }}><Pencil size={15} /></button>
            <button aria-label={`Delete ${i.name}`} className="p-1.5 text-slate-500 hover:text-red-300" onClick={() => { if (confirm(`Permanently delete "${i.name}"?`)) run(api(`/files?path=${encodeURIComponent(i.path)}`, { method: 'DELETE' })) }}><Trash2 size={15} /></button>
          </div>))}
      </div>
      {view && <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onClick={() => setView(null)}>
        <div className="panel w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center p-3 border-b border-white/10"><b className="text-white truncate">{view.name}</b><button aria-label="Close" onClick={() => setView(null)}><X size={18} /></button></div>
          <pre className="p-4 overflow-auto text-xs whitespace-pre-wrap font-mono text-slate-300">{view.content}</pre></div></div>}
    </div>
  )
}
