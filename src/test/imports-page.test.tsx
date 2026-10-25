import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportsPage } from '@/pages/ImportsPage'
import { loadImportHistory, validateImport } from '@/lib/imports-api'

vi.mock('@/lib/imports-api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/imports-api')>()
  return {
    ...original,
    importTemplateUrl: vi.fn(() => '/modelo.xlsx'),
    loadImportHistory: vi.fn(),
    validateImport: vi.fn(),
    commitValidatedImport: vi.fn(),
  }
})

describe('tela de importações', () => {
  beforeEach(() => {
    vi.mocked(loadImportHistory).mockResolvedValue([])
    vi.mocked(validateImport).mockResolvedValue({
      fingerprint: 'a'.repeat(64),
      type: 'OPERATORS',
      fileName: 'operadores.csv',
      totalRows: 1,
      validRows: 1,
      invalidRows: 0,
      issues: [],
      rows: [{ lineNumber: 2, key: 'login · 2026-01-01', action: 'CREATE', summary: 'Nome · SKU · Supervisor' }],
      requiresOperatorUpdateConfirmation: false,
      requiresResultReplacementConfirmation: false,
      scope: { environmentId: 'env', environmentCode: 'ENV', environmentName: 'Ambiente', skuId: 'sku' },
    })
  })

  it('mostra a prévia somente depois de validar o arquivo pela API', async () => {
    render(<MemoryRouter><ImportsPage /></MemoryRouter>)
    const input = screen.getByLabelText('Arquivo Excel ou CSV')
    const file = new File(['conteúdo'], 'operadores.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Validar arquivo' }))

    await waitFor(() => expect(validateImport).toHaveBeenCalledWith(file, 'OPERATORS'))
    expect(await screen.findByText('Prévia do lote')).toBeInTheDocument()
    expect(screen.getByText('login · 2026-01-01')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar e gravar' })).toBeEnabled()
  })
})
