import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Bot, Brain, FolderOpen, History, LayoutDashboard, ListChecks, LogOut, Menu, MessageSquare, Mic, Settings, User, Workflow, X } from 'lucide-react'
import { useAuth } from '../auth'
import { api, Task } from '../api'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard }, { to: '/chat', label: 'AI Chat', icon: MessageSquare },
  { to: '/voice', label: 'Voice', icon: Mic }, { to: '/workspace', label: 'Agent Workspace', icon: Bot },
  { to: '/tasks', label: 'Tasks', icon: ListChecks }, { to: '/files', label: 'Files', icon: FolderOpen },
  { to: '/automations', label: 'Automations', icon: Workflow }, { to: '/memory', label: 'Memory', icon: Brain },
  { to: '/history', label: 'History', icon: History }, { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'Profile', icon: User },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [toasts, setToasts] = useState<Task[]>([])
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])

  // Real reminders: poll for due items, show an in-app toast and a browser notification.
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
    const check = async () => {
      try {
        const due = await api<Task[]>('/tasks-due')
        if (!due.length) return
        setToasts(t => [...t, ...due])
        due.forEach(d => { if ('Notification' in window && Notification.permission === 'granted') new Notification('Reminder', { body: d.title }) })
      } catch { /* offline: try again next tick */ }
    }
    check(); const id = setInterval(check, 30000); return () => clearInterval(id)
  }, [])

  const nav = (
    <nav className="flex flex-col gap-1 p-3 flex-1 overflow-y-auto" aria-label="Main">
      {NAV.map(n => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) =>
          `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${isActive ? 'bg-gradient-to-r from-violet-600/30 to-blue-600/20 text-white border border-violet-400/30' : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
          <n.icon size={18} />{n.label}
        </NavLink>
      ))}
    </nav>
  )
  return (
    <div className="h-full flex">
      <aside className="hidden md:flex w-60 flex-col border-r border-white/10 bg-black/20">
        <div className="px-5 py-4 flex items-center gap-2 font-bold text-white"><span className="grid place-items-center h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600"><Bot size={18} /></span>Personal Agent</div>
        {nav}
        <button onClick={logout} className="m-3 btn-ghost justify-start"><LogOut size={16} />Sign out ({user?.name})</button>
      </aside>
      <AnimatePresence>{open && (
        <motion.div className="fixed inset-0 z-40 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <motion.aside initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }} className="relative w-64 h-full bg-[#080b1f] flex flex-col">{nav}
            <button onClick={logout} className="m-3 btn-ghost justify-start"><LogOut size={16} />Sign out</button></motion.aside>
        </motion.div>)}
      </AnimatePresence>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <button aria-label="Open menu" onClick={() => setOpen(o => !o)} className="btn-ghost !p-2">{open ? <X size={18} /> : <Menu size={18} />}</button>
          <span className="font-semibold text-white">Personal Agent</span>
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname.split('/')[1]} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="h-full">
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
        {toasts.map(t => (
          <motion.div key={t.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="glass px-4 py-3 flex items-start gap-3 max-w-xs bg-[#0d1230]">
            <Bell size={16} className="text-amber-300 mt-0.5" /><div className="text-sm"><b className="text-white">Reminder</b><p className="text-slate-300">{t.title}</p></div>
            <button aria-label="Dismiss" onClick={() => setToasts(x => x.filter(y => y !== t))}><X size={14} /></button>
          </motion.div>))}
      </div>
    </div>
  )
}
