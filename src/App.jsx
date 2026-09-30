import { BrowserRouter, HashRouter } from 'react-router-dom'
import './App.css'
import AppRoutes from './routes/AppRoutes'
import './assets/scss/index.scss'
import { AuthProvider } from './contexts/AuthContext'

function App() {
  const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter

  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  )
}

export default App
