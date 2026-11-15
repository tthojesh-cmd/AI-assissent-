import { KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bot, Check, Copy, Mic, Paperclip, Plus, RefreshCw, Send, Square, Trash2, Volume2, X, PanelLeft } from 'lucide-react'
import { api, Activity, Conv, Msg } from '../api'
import { useAuth } from '../auth'
import Approvals from '../components/Approvals'
import { ErrorNote, Markdown, Spinner } from '../components/ui'
import { useSpeech } from '../speech'

interface Att { id: number; name: string; kind: string }

function Reveal({ text, animate }: { text: string; animate: boolean }) {
  const [n, setN] = useState(animate ? 0 : text.length)
  useEffect(() => {
    if (!animate) return
    const step = Math.max(4, Math.ceil(text.length / 160))
    const id = setInterval(() => setN(x => { if (x + step >= text.length) { clearInterval(id); return text.length } return x + step }), 16)
    return () => clearInterval(id)
  }, [text, animate])
  return <Markdown text={n >= text.length ? text : text.slice(0, n) + ' ▍'} />
}

export default function Chat() {
  const { id } = useParams(); const nav = useNavigate(); const { user } = useAuth()
  const [convs, setConvs] = useState<Conv[]>([])
  const [cid, setCid] = useState<number | null>(id ? +id : null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState(''); const [atts, setAtts] = useState<Att[]>([])
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(''); const [pending, setPending] = useState<Activity[]>([])
  const [fresh, setFresh] = useState<number | null>(null); const [copied, setCopied] = useState<number | null>(null)
  const [showList, setShowList] = useState(false)
  const bottom = useRef<HTMLDivElement>(null); const file = useRef<HTMLInputElement>(null); const skipLoad = useRef(false)
  const s = user?.settings ?? {}
  const sp = useSpeech(s.voice_lang || 'en-IN', s.voice_rate || 1)

  const loadList = useCallback(() => api<Conv[]>('/chat/conversations').then(setConvs).catch(() => {}), [])
  const loadPending = useCallback((c: number | null) => c ? api<Activity[]>(`/agent/pending?conversation_id=${c}`).then(setPending).catch(() => {}) : setPending([]), [])
  useEffect(() => { loadList() }, [loadList])
  useEffect(() => {
    setCid(id ? +id : null); setErr('')
    if (!id) { setMsgs([]); setPending([]); return }
    if (skipLoad.current) { skipLoad.current = false; return }
    setLoading(true)
    api<Conv>(`/chat/conversations/${id}`).then(c => { setMsgs(c.messages ?? []); loadPending(+id) }).catch(e => setErr(e.message)).finally(() => setLoading(false))
  }, [id, loadPending])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy, pending])

  const reply = (m: Msg, c: number) => {
    setMsgs(x => [...x, m]); setFresh(m.id); loadPending(c); loadList()
    if (s.auto_speak) sp.speak(m.content)
  }
  const send = async (text = input) => {
    text = text.trim(); if (!text || busy) return
    setErr(''); setBusy(true)
    const tmp: Msg = { id: -Date.now(), role: 'user', content: text, meta: { attachment_names: atts.map(a => a.name) }, created_at: new Date().toISOString() }
    setMsgs(x => [...x, tmp]); setInput(''); const sent = atts; setAtts([])
    let c = cid
    try {
      if (!c) { const n = await api<Conv>('/chat/conversations', { method: 'POST' }); c = n.id; setCid(c); skipLoad.current = true; nav(`/chat/${c}`, { replace: true }) }
      const r = await api<{ assistant_message: Msg; user_message: Msg }>(`/chat/conversations/${c}/messages`, { body: { content: text, attachment_ids: sent.map(a => a.id) } })
      setMsgs(x => x.map(m => (m === tmp ? r.user_message : m))); reply(r.assistant_message, c!)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const regenerate = async () => {
    if (!cid || busy) return
    setErr(''); setBusy(true)
    setMsgs(x => { const i = x.map(m => m.role).lastIndexOf('user'); return x.slice(0, i + 1) })
    try { const r = await api<{ assistant_message: Msg }>(`/chat/conversations/${cid}/regenerate`, { method: 'POST' }); reply(r.assistant_message, cid) }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const upload = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      const fd = new FormData(); fd.append('file', f)
      try { const r = await api<Att>('/chat/uploads', { form: fd }); setAtts(a => [...a, r]) } catch (e: any) { setErr(`${f.name}: ${e.message}`) }
    }
    if (file.current) file.current.value = ''
  }
  const del = async (c: number) => { if (!confirm('Delete this conversation?')) return; await api(`/chat/conversations/${c}`, { method: 'DELETE' }); loadList(); if (c === cid) nav('/chat') }
  const copy = (m: Msg) => { navigator.clipboard.writeText(m.content); setCopied(m.id); setTimeout(() => setCopied(null), 1200) }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
  const lastAssistant = msgs.length ? msgs[msgs.length - 1].role === 'assistant' ? msgs[msgs.length - 1].id : null : null
  const canRetry = msgs.length > 0 && !busy

  return (
    <div className="h-full flex">
      <aside className={`${showList ? 'flex' : 'hidden'} md:flex absolute md:static z-20 h-full w-64 flex-col border-r border-white/10 bg-[#070a1c] md:bg-black/10`}>
        <div className="p-3"><button onClick={() => { nav('/chat'); setShowList(false) }} className="btn-primary w-full"><Plus size={16} />New chat</button></div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {convs.map(c => (
            <div key={c.id} className={`group flex items-center rounded-lg ${c.id === cid ? 'bg-white/10' : 'hover:bg-white/5'}`}>
              <button className="flex-1 text-left text-sm px-3 py-2 truncate text-slate-300" onClick={() => { nav(`/chat/${c.id}`); setShowList(false) }}>{c.title}</button>
              <button aria-label="Delete conversation" onClick={() => del(c.id)} className="p-2 text-slate-500 hover:text-red-300 md:opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
            </div>))}
          {convs.length === 0 && <p className="text-sm text-slate-500 p-3">No chats yet.</p>}
        </div>
      </aside>
      <section className="flex-1 min-w-0 flex flex-col">
        <div className="md:hidden p-2 border-b border-white/10"><button className="btn-ghost !py-1" onClick={() => setShowList(s => !s)}><PanelLeft size={16} />Chats</button></div>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-5">
            {loading && <Spinner />}
            {!loading && msgs.length === 0 && (
              <div className="text-center pt-16"><div className="mx-auto h-14 w-14 grid place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600"><Bot size={28} /></div>
                <h1 className="text-2xl font-bold text-white mt-4">How can I help, {user?.name}?</h1>
                <div className="flex flex-wrap justify-center gap-2 mt-5">
                  {['Explain machine learning simply', 'Search for Python tutorials', 'Write a Python function to reverse a string', 'తెలుగులో నాకు ఒక చిన్న కథ చెప్పు', 'Create a todo list app project structure'].map(q => (
                    <button key={q} onClick={() => send(q)} className="btn-ghost !text-xs">{q}</button>))}</div></div>)}
            {msgs.map(m => (
              <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex gap-3'}>
                {m.role === 'assistant' && <span className="h-8 w-8 shrink-0 grid place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-600"><Bot size={16} /></span>}
                <div className={m.role === 'user' ? 'max-w-[85%] rounded-2xl rounded-br-md bg-violet-600/30 border border-violet-400/20 px-4 py-2.5' : 'min-w-0 flex-1'}>
                  {m.role === 'user' ? <p className="whitespace-pre-wrap text-[15px]">{m.content}</p> : <Reveal text={m.content} animate={m.id === fresh} />}
                  {!!m.meta?.attachment_names?.length && <div className="flex flex-wrap gap-1 mt-2">{m.meta.attachment_names.map(n => <span key={n} className="text-xs bg-white/10 rounded px-2 py-0.5"><Paperclip size={10} className="inline mr-1" />{n}</span>)}</div>}
                  {m.role === 'assistant' && !!m.meta?.tools?.length && <div className="flex flex-wrap gap-1.5 mt-2">{m.meta.tools.map((t, i) => (
                    <span key={i} title={t.summary} className={`text-xs rounded-full px-2 py-0.5 border ${t.ok ? 'border-emerald-400/30 text-emerald-300' : 'border-red-400/30 text-red-300'}`}>{t.ok ? '✓' : '✗'} {t.tool}</span>))}</div>}
                  {m.role === 'assistant' && (
                    <div className="flex gap-1 mt-1 text-slate-500">
                      <button aria-label="Copy response" onClick={() => copy(m)} className="p-1.5 hover:text-white">{copied === m.id ? <Check size={14} /> : <Copy size={14} />}</button>
                      <button aria-label="Read aloud" onClick={() => sp.speaking ? sp.cancelSpeech() : sp.speak(m.content)} className="p-1.5 hover:text-white">{sp.speaking ? <Square size={14} /> : <Volume2 size={14} />}</button>
                      {m.id === lastAssistant && <button aria-label="Regenerate response" disabled={busy} onClick={regenerate} className="p-1.5 hover:text-white"><RefreshCw size={14} /></button>}
                    </div>)}
                </div>
              </div>))}
            {busy && <div className="flex gap-3"><span className="h-8 w-8 grid place-items-center rounded-lg bg-white/10"><Bot size={16} /></span>
              <div className="flex items-center gap-1 pt-3" aria-label="Agent is thinking">{[0, 1, 2].map(i => <span key={i} className="h-2 w-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div></div>}
            <Approvals items={pending} onDone={m => { if (m) setMsgs(x => [...x, m]); loadPending(cid) }} />
            {err && <div className="flex items-center gap-2"><div className="flex-1"><ErrorNote msg={err} /></div>{canRetry && msgs[msgs.length - 1].role === 'user' && <button className="btn-ghost" onClick={regenerate}><RefreshCw size={14} />Retry</button>}</div>}
            <div ref={bottom} />
          </div>
        </div>
        <div className="px-4 pb-4">
          <div className="max-w-3xl mx-auto glass p-2">
            {(atts.length > 0 || sp.listening) && <div className="flex flex-wrap gap-2 px-2 pt-1 pb-2">
              {atts.map(a => <span key={a.id} className="text-xs bg-white/10 rounded-full pl-3 pr-1 py-1 flex items-center gap-1">{a.name}<button aria-label={`Remove ${a.name}`} onClick={() => setAtts(x => x.filter(y => y.id !== a.id))} className="p-0.5"><X size={12} /></button></span>)}
              {sp.listening && <span className="text-xs text-violet-300 animate-pulse">Listening… {sp.interim}</span>}</div>}
            <div className="flex items-end gap-1">
              <input ref={file} type="file" hidden multiple accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.json,.py,.js,.html,.css" onChange={e => upload(e.target.files)} />
              <button aria-label="Attach file or image" className="btn-ghost !p-2.5 !border-0" onClick={() => file.current?.click()}><Paperclip size={18} /></button>
              <textarea rows={1} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey} placeholder="Message your agent… (English / తెలుగు)" className="flex-1 bg-transparent resize-none outline-none px-2 py-2.5 max-h-40 text-[15px] placeholder:text-slate-500" />
              <button aria-label={sp.listening ? 'Stop listening' : 'Voice input'} className={`btn-ghost !p-2.5 !border-0 ${sp.listening ? '!text-red-300 animate-pulse' : ''}`}
                onClick={() => sp.listening ? sp.stopListening() : sp.listen(t => setInput(x => (x ? x + ' ' : '') + t), setErr)}><Mic size={18} /></button>
              <button aria-label="Send" className="btn-primary !p-2.5" disabled={busy || !input.trim()} onClick={() => send()}><Send size={18} /></button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
