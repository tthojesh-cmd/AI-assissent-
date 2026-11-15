import { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

export const Spinner = ({ label }: { label?: string }) => (
  <div className="flex items-center gap-2 text-slate-400 text-sm p-4"><Loader2 className="animate-spin" size={16} />{label ?? 'Loading…'}</div>
)
export const Empty = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="text-center py-10 text-slate-400"><p className="font-medium text-slate-300">{title}</p>{hint && <p className="text-sm mt-1">{hint}</p>}</div>
)
export const ErrorNote = ({ msg }: { msg: string }) => msg ? <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">{msg}</div> : null
export const PageHeader = ({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
    <div><h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>{sub && <p className="text-sm text-slate-400 mt-1">{sub}</p>}</div>
    <div className="flex gap-2">{children}</div>
  </div>
)
export const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
    className={`relative w-11 h-6 rounded-full transition ${on ? 'bg-violet-600' : 'bg-white/15'}`}>
    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
  </button>
)
export const Markdown = ({ text }: { text: string }) => (
  <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={{ a: p => <a {...p} target="_blank" rel="noreferrer noopener" /> }}>{text}</ReactMarkdown></div>
)
export const statusColor: Record<string, string> = { success: 'text-emerald-300 bg-emerald-500/10', failed: 'text-red-300 bg-red-500/10', pending: 'text-amber-300 bg-amber-500/10', denied: 'text-slate-300 bg-white/10', done: 'text-emerald-300 bg-emerald-500/10' }
export const Badge = ({ s }: { s: string }) => <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[s] ?? 'bg-white/10 text-slate-300'}`}>{s}</span>
