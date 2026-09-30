import { Route, Routes, Navigate } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import WebLayout from '../layouts/WebLayout'
import NotFoundPage from '../pages/NotFoundPage'
import LoginPage from '../pages/LoginPage'
import { useAuth } from '../contexts/AuthContext'

const isElectron =
  typeof window !== 'undefined' &&
  Boolean(
    window.electronAPI ||
    window.process?.versions?.electron ||
    navigator.userAgent?.includes('Electron'),
  )
const isWeb = !isElectron

function AppRoutes() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (isWeb) {
    // Trên nền web: chỉ hiển thị trang lịch sử, không có dashboard
    return (
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<WebLayout />} />
      </Routes>
    )
  }

  // Trên Electron: layout đầy đủ với dashboard + lịch sử
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default AppRoutes
