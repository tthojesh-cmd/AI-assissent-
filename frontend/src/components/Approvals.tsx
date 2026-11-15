import { useState } from 'react'
import { Check, ShieldAlert, X } from 'lucide-react'
import { api, Activity, Msg } from '../api'

/** Shows sensitive actions the agent wants to perform. Nothing runs until the user clicks Approve. */
export default function Approvals({ items, onDone }: { items: Activity[]; onDone: (msg: Msg | null) => void }) {
  const [busy, setBusy] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const act = async (id: number, kind: 'approve' | 'deny') => {
    setBusy(id); setErr('')
    try { const r = await api<{ message: Msg | null }>(`/agent/activities/${id}/${kind}`, { method: 'POST' }); onDone(r.message) }
    catch (e: any) { setErr(e.message) } finally { setBusy(null) }
  }
  if (!items.length) return null
  return (
    <div className="space-y-2">
      {items.map(a => (
        <div key={a.id} className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-amber-200 text-sm font-medium"><ShieldAlert size={16} />Approval needed: {a.tool}</div>
          <pre className="mt-2 text-xs bg-black/30 rounded-lg p-2 overflow-x-auto text-slate-300 whitespace-pre-wrap break-all">{JSON.stringify(a.args, null, 2)}</pre>
          <div className="mt-2 flex gap-2">
            <button disabled={busy === a.id} onClick={() => act(a.id, 'approve')} className="btn-primary !py-1.5"><Check size={14} />Approve</button>
            <button disabled={busy === a.id} onClick={() => act(a.id, 'deny')} className="btn-ghost !py-1.5"><X size={14} />Cancel</button>
          </div>
        </div>
      ))}
      {err && <p className="text-sm text-red-300">{err}</p>}
    </div>
  )
}
