import { describe, expect, it } from 'vitest'
import { formatTma, parseTma } from '@/lib/results-api'

describe('conversão de TMA', () => {
  it('aceita minutos inteiros e MM:SS, armazenando segundos', () => {
    expect(parseTma('5')).toBe(300)
    expect(parseTma('05:30')).toBe(330)
    expect(parseTma('12:59')).toBe(779)
  })

  it('rejeita segundos fora da faixa e texto inválido', () => {
    expect(parseTma('05:60')).toBeNull()
    expect(parseTma('5,5')).toBeNull()
    expect(parseTma('texto')).toBeNull()
  })

  it('exibe os segundos persistidos como MM:SS', () => {
    expect(formatTma(330)).toBe('05:30')
    expect(formatTma(3_725)).toBe('62:05')
  })
})
