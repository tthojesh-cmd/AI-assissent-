import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Voice from './pages/Voice'
import Workspace from './pages/Workspace'
import Tasks from './pages/Tasks'
import Files from './pages/Files'
import Automations from './pages/Automations'
import MemoryPage from './pages/MemoryPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import Profile from './pages/Profile'

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="h-full grid place-items-center"><Spinner label="Starting your agent…" /></div>
  if (!user) return <Routes><Route path="/login" element={<Login />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="chat" element={<Chat />} />
        <Route path="chat/:id" element={<Chat />} />
        <Route path="voice" element={<Voice />} />
        <Route path="workspace" element={<Workspace />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="files" element={<Files />} />
        <Route path="automations" element={<Automations />} />
        <Route path="memory" element={<MemoryPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<Profile />} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
