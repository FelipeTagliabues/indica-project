import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RegistrationsPage } from '@/pages/RegistrationsPage'
import { loadRegistrationData } from '@/lib/registrations-api'

vi.mock('@/lib/registrations-api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/registrations-api')>()
  return {
    ...original,
    loadRegistrationData: vi.fn(),
  }
})
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { email: 'usuario@indica.local' }, loading: false, login: vi.fn(), logout: vi.fn() }) }))

const mockedLoad = vi.mocked(loadRegistrationData)

describe('página de cadastros', () => {
  beforeEach(() => {
    mockedLoad.mockReset()
  })

  it('exibe cadastros retornados pela API sem solicitar identidade declarada', async () => {
    mockedLoad.mockResolvedValue({
      environments: [{ id: 'env-1', code: 'PERNAMBUCANAS', name: 'Pernambucanas', status: 'ACTIVE' }],
      skus: [],
      supervisors: [],
      operators: [],
      assignments: [],
    })

    render(<MemoryRouter><RegistrationsPage /></MemoryRouter>)

    expect(await screen.findByText('PERNAMBUCANAS')).toBeInTheDocument()
    expect(screen.queryByText(/responsável informado/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /salvar ambiente/i })).toBeInTheDocument()
  })

  it('não apresenta sucesso local quando a persistência está indisponível', async () => {
    mockedLoad.mockRejectedValue(new Error('API indisponível'))

    render(<MemoryRouter><RegistrationsPage /></MemoryRouter>)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('API indisponível'))
    expect(screen.getByText(/nenhum dado foi armazenado localmente/i)).toBeInTheDocument()
  })
})
