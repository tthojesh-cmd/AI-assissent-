import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { PageHeader, Toggle } from '../components/ui'

export default function SettingsPage() {
  const { user, refresh } = useAuth()
  const [st, setSt] = useState<{ online: boolean; model: string; desktop_enabled: boolean } | null>(null)
  useEffect(() => { api<any>('/agent/status').then(setSt) }, [])
  const s = user?.settings ?? {}
  const patch = (body: object) => api('/me', { method: 'PATCH', body }).then(refresh)
  const row = (label: string, hint: string, ctl: React.ReactNode) => <div className="flex items-center justify-between gap-4 py-3 border-b border-white/5 last:border-0"><div><p className="text-slate-100">{label}</p><p className="text-xs text-slate-500">{hint}</p></div>{ctl}</div>
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <PageHeader title="Settings" />
      <div className="panel px-4 mb-5">
        {row('Response language', 'Auto follows the language you write in.', <select className="input !w-auto" value={user?.language} onChange={e => patch({ language: e.target.value })}><option value="auto">Auto</option><option value="en">English</option><option value="te">తెలుగు</option></select>)}
        {row('Speak replies automatically', 'Uses your browser’s text-to-speech.', <Toggle label="Auto speak" on={!!s.auto_speak} onChange={v => patch({ settings: { auto_speak: v } })} />)}
        {row('Voice language', 'Used for the microphone and spoken replies.', <select className="input !w-auto" value={s.voice_lang || 'en-IN'} onChange={e => patch({ settings: { voice_lang: e.target.value } })}><option value="en-IN">English (India)</option><option value="en-US">English (US)</option><option value="te-IN">Telugu</option></select>)}
        {row('Speech speed', `${(s.voice_rate || 1).toFixed(1)}×`, <input type="range" min={0.6} max={1.6} step={0.1} value={s.voice_rate || 1} onChange={e => patch({ settings: { voice_rate: +e.target.value } })} aria-label="Speech speed" />)}
        {row('Memory', 'Let the agent use memories you approved.', <Toggle label="Memory" on={!!user?.memory_enabled} onChange={v => patch({ memory_enabled: v })} />)}
      </div>
      <h2 className="font-semibold text-white mb-2">System</h2>
      <div className="panel p-4 text-sm space-y-1 text-slate-300">
        <p>AI model: <b className="text-white">{st?.model}</b> — {st?.online ? 'connected key found' : <span className="text-red-300">OPENAI_API_KEY missing in backend/.env</span>}</p>
        <p>Desktop automation: <b className="text-white">{st?.desktop_enabled ? 'enabled' : 'disabled'}</b> {!st?.desktop_enabled && <span className="text-slate-500">(set DESKTOP_AUTOMATION=true in backend/.env)</span>}</p>
        <p className="text-xs text-slate-500">API keys live only on the server and are never sent to the browser.</p>
      </div>
    </div>
  )
}
