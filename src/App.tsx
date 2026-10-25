import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'

const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const RegistrationsPage = lazy(() => import('@/pages/RegistrationsPage').then((module) => ({ default: module.RegistrationsPage })))
const ResultsPage = lazy(() => import('@/pages/ResultsPage').then((module) => ({ default: module.ResultsPage })))
const ImportsPage = lazy(() => import('@/pages/ImportsPage').then((module) => ({ default: module.ImportsPage })))

const pageFallback = <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Carregando…</div>

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/painel"
          element={(
            <Suspense fallback={pageFallback}>
              <DashboardPage />
            </Suspense>
          )}
        />
        <Route
          path="/cadastros"
          element={(
            <Suspense fallback={pageFallback}>
              <RegistrationsPage />
            </Suspense>
          )}
        />
        <Route
          path="/resultados"
          element={(
            <Suspense fallback={pageFallback}>
              <ResultsPage />
            </Suspense>
          )}
        />
        <Route
          path="/importacoes"
          element={(
            <Suspense fallback={pageFallback}>
              <ImportsPage />
            </Suspense>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
