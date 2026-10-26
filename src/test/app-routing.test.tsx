import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: false, login: vi.fn(), logout: vi.fn() }) }))

describe('rotas principais', () => {
  it('renderiza a página inicial', () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /os indicadores da sua operação/i })).toBeInTheDocument()
  })

  it('renderiza o formulário de acesso real', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /^entrar$/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^senha$/i)).toBeInTheDocument()
  })
})
