import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, MicOff, Square, Volume2, VolumeX } from 'lucide-react'
import { api, Conv, Msg } from '../api'
import { useAuth } from '../auth'
import { ErrorNote, Markdown, Toggle } from '../components/ui'
import { speechSupported, useSpeech } from '../speech'

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'
const LANGS = [['en-IN', 'English (India)'], ['en-US', 'English (US)'], ['te-IN', 'తెలుగు (Telugu)']]

export default function Voice() {
  const { user } = useAuth()
  const [lang, setLang] = useState(user?.settings?.voice_lang || 'en-IN')
  const [muted, setMuted] = useState(false); const [conversation, setConversation] = useState(true)
  const [msgs, setMsgs] = useState<Msg[]>([]); const [thinking, setThinking] = useState(false); const [err, setErr] = useState('')
  const sp = useSpeech(lang, user?.settings?.voice_rate || 1)
  const cid = useRef<number | null>(null); const active = useRef(false); const end = useRef<HTMLDivElement>(null)
  const phase: Phase = sp.listening ? 'listening' : thinking ? 'thinking' : sp.speaking ? 'speaking' : 'idle'
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  useEffect(() => () => { active.current = false }, [])

  const listen = () => { setErr(''); sp.listen(handle, e => { setErr(e); active.current = false }) }
  const handle = async (text: string) => {
    setMsgs(m => [...m, { id: -Date.now(), role: 'user', content: text, meta: {}, created_at: '' }]); setThinking(true)
    try {
      if (!cid.current) cid.current = (await api<Conv>('/chat/conversations', { method: 'POST' })).id
      const r = await api<{ assistant_message: Msg }>(`/chat/conversations/${cid.current}/messages`, { body: { content: text } })
      setMsgs(m => [...m, r.assistant_message]); setThinking(false)
      const next = () => { if (active.current && conversation) listen() }
      muted ? next() : sp.speak(r.assistant_message.content, next)
    } catch (e: any) { setErr(e.message); setThinking(false); active.current = false }
  }
  const start = () => { active.current = true; sp.cancelSpeech(); listen() }
  const stop = () => { active.current = false; sp.stopListening(); sp.cancelSpeech() }
  const colors: Record<Phase, string> = { idle: 'from-slate-600 to-slate-800', listening: 'from-emerald-400 to-blue-600', thinking: 'from-amber-400 to-violet-600', speaking: 'from-violet-500 to-fuchsia-600' }
  const label: Record<Phase, string> = { idle: 'Tap the mic and speak', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Voice assistant</h1>
        <select aria-label="Speech language" className="input !w-auto" value={lang} onChange={e => setLang(e.target.value)}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      {!speechSupported.input && <div className="mt-4"><ErrorNote msg="Voice input needs a browser with the Web Speech API (Chrome or Edge). You can still type in AI Chat." /></div>}
      <div className="flex flex-col items-center py-8">
        <motion.button aria-label={phase === 'idle' ? 'Start listening' : 'Stop'} onClick={phase === 'idle' ? start : stop}
          animate={{ scale: phase === 'listening' ? [1, 1.1, 1] : phase === 'speaking' ? [1, 1.06, 0.98, 1.04, 1] : 1 }} transition={{ repeat: phase === 'idle' ? 0 : Infinity, duration: phase === 'speaking' ? 0.9 : 1.4 }}
          className={`h-32 w-32 rounded-full grid place-items-center bg-gradient-to-br ${colors[phase]} shadow-[0_0_60px_-10px_rgba(139,92,246,.7)]`}>
          {phase === 'idle' ? <Mic size={44} /> : phase === 'speaking' ? <Volume2 size={44} /> : phase === 'listening' ? <Square size={36} /> : <span className="h-8 w-8 rounded-full border-4 border-white/30 border-t-white animate-spin" />}
        </motion.button>
        <p className="mt-4 text-slate-300" aria-live="polite">{label[phase]}</p>
        {sp.listening && <p className="text-sm text-violet-300 mt-1 min-h-5">{sp.interim}</p>}
        <div className="flex items-center gap-5 mt-5 text-sm text-slate-300">
          <label className="flex items-center gap-2">Conversation mode <Toggle on={conversation} onChange={setConversation} label="Conversation mode" /></label>
          <button className="btn-ghost" onClick={() => { setMuted(m => !m); sp.cancelSpeech() }}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{muted ? 'Unmute' : 'Mute'}</button>
        </div>
      </div>
      <ErrorNote msg={err} />
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 mt-3">
        {msgs.length === 0 && <p className="text-center text-slate-500 text-sm">Try saying: “Explain Python loops.”</p>}
        {msgs.map(m => <div key={m.id} className={m.role === 'user' ? 'text-right' : ''}><div className={`inline-block max-w-[90%] text-left rounded-2xl px-4 py-2 ${m.role === 'user' ? 'bg-violet-600/30' : 'glass'}`}>{m.role === 'user' ? m.content : <Markdown text={m.content} />}</div></div>)}
        <div ref={end} />
      </div>
      {!speechSupported.input && <MicOff className="hidden" />}
    </div>
  )
}
