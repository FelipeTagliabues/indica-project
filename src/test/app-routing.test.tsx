import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'

describe('rotas principais', () => {
  it('renderiza a página inicial', () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /os indicadores da sua operação/i })).toBeInTheDocument()
  })

  it('renderiza o acesso em modo de demonstração', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /entrar com google/i })).toBeInTheDocument()
    expect(screen.getByText(/autenticação google ainda não configurada/i)).toBeInTheDocument()
  })
})
