import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PendingConfirmationPage } from '@/pages/PendingConfirmationPage'
import { RegisterPage } from '@/pages/RegisterPage'

describe('cadastro pela interface', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('informa que a conta foi criada quando o envio fica pendente', async () => {
    const payload = {
      data: {
        id: 'user-id',
        name: 'Pessoa Teste',
        email: 'pessoa@example.com',
        status: 'PENDING',
        role: 'USER',
      },
      message: 'Conta criada, mas o e-mail de confirmação ainda não foi enviado.',
      emailDelivery: {
        status: 'PENDING',
        code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      },
    }
    const fetchMock = vi.fn().mockResolvedValue(response(payload, 201))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/cadastro']}>
        <Routes>
          <Route path="/cadastro" element={<RegisterPage />} />
          <Route path="/confirmacao-pendente" element={<PendingConfirmationPage />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nome completo/i), { target: { value: 'Pessoa Teste' } })
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'pessoa@example.com' } })
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: 'SenhaSegura123' } })
    fireEvent.change(screen.getByLabelText(/confirmar senha/i), { target: { value: 'SenhaSegura123' } })
    fireEvent.click(screen.getByRole('button', { name: /criar conta/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/sua conta foi criada, mas o e-mail de confirmação ainda não foi enviado/i)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/o envio não foi concluído/i)
    expect(screen.getByLabelText(/e-mail/i)).toHaveValue('pessoa@example.com')
  })

  it('oferece reenvio sem criar outra conta quando o e-mail já existe', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      error: {
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'Já existe uma conta com este e-mail.',
      },
    }, 409))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/cadastro']}>
        <Routes>
          <Route path="/cadastro" element={<RegisterPage />} />
          <Route path="/confirmacao-pendente" element={<PendingConfirmationPage />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nome completo/i), { target: { value: 'Pessoa Teste' } })
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'pessoa@example.com' } })
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: 'SenhaSegura123' } })
    fireEvent.change(screen.getByLabelText(/confirmar senha/i), { target: { value: 'SenhaSegura123' } })
    fireEvent.click(screen.getByRole('button', { name: /criar conta/i }))

    const resendLink = await screen.findByRole('link', { name: /solicitar novo e-mail/i })
    expect(resendLink).toHaveAttribute('href', '/confirmacao-pendente?email=pessoa%40example.com')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

function response(payload: unknown, status: number) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload }
}
