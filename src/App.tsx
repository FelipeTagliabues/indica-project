import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { PendingConfirmationPage } from '@/pages/PendingConfirmationPage'
import { ConfirmEmailPage } from '@/pages/ConfirmEmailPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'

const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const RegistrationsPage = lazy(() => import('@/pages/RegistrationsPage').then((module) => ({ default: module.RegistrationsPage })))
const ResultsPage = lazy(() => import('@/pages/ResultsPage').then((module) => ({ default: module.ResultsPage })))
const ImportsPage = lazy(() => import('@/pages/ImportsPage').then((module) => ({ default: module.ImportsPage })))

const pageFallback = <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Carregando…</div>

function App() {
  return (
    <BrowserRouter>
      <AuthProvider><Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cadastro" element={<RegisterPage />} />
        <Route path="/confirmacao-pendente" element={<PendingConfirmationPage />} />
        <Route path="/confirmar-email" element={<ConfirmEmailPage />} />
        <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route
          path="/painel"
          element={(
            <Suspense fallback={pageFallback}>
              <ProtectedRoute><DashboardPage /></ProtectedRoute>
            </Suspense>
          )}
        />
        <Route
          path="/cadastros"
          element={(
            <Suspense fallback={pageFallback}>
              <ProtectedRoute><RegistrationsPage /></ProtectedRoute>
            </Suspense>
          )}
        />
        <Route
          path="/resultados"
          element={(
            <Suspense fallback={pageFallback}>
              <ProtectedRoute><ResultsPage /></ProtectedRoute>
            </Suspense>
          )}
        />
        <Route
          path="/importacoes"
          element={(
            <Suspense fallback={pageFallback}>
              <ProtectedRoute><ImportsPage /></ProtectedRoute>
            </Suspense>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes></AuthProvider>
    </BrowserRouter>
  )
}

export default App
