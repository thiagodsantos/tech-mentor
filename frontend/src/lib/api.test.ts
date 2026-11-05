import { describe, expect, it } from 'vitest'
import { ApiError, apiErrorMessage, localizeApiMessage } from './api'
import { formatCredits, formatDate, formatPrice, sortModels } from './format'

describe('apiErrorMessage', () => {
  it('explains a missing backend connection without exposing request data', () => {
    expect(apiErrorMessage(new ApiError('failed', 0), 'fallback')).toContain('backend está em execução')
  })

  it('provides an actionable fallback for endpoints not implemented yet', () => {
    expect(apiErrorMessage(new ApiError('not found', 404), 'fallback')).toContain('ainda não está disponível')
  })

  it('localizes backend provider messages for the PT-BR interface', () => {
    expect(localizeApiMessage('OpenRouter rejected the API key.')).toContain('recusou a chave')
    expect(localizeApiMessage('OpenRouter request failed (HTTP 429).')).toContain('HTTP 429')
  })
})

describe('formatters', () => {
  it('sorts models alphabetically without mutating the source list', () => {
    const models = [
      { id: 'z/model', name: 'Zeta', context_length: null, input_modalities: [], output_modalities: [], capabilities: [], pricing: {} },
      { id: 'a/model', name: 'Álpha', context_length: null, input_modalities: [], output_modalities: [], capabilities: [], pricing: {} },
      { id: 'b/model', name: 'Beta', context_length: null, input_modalities: [], output_modalities: [], capabilities: [], pricing: {} },
    ]
    expect(sortModels(models).map((model) => model.name)).toEqual(['Álpha', 'Beta', 'Zeta'])
    expect(models[0].name).toBe('Zeta')
  })
  it('formats credit amounts and model prices', () => {
    expect(formatCredits({ total_credits: 2.5, total_usage: 0.5 })).toContain('2,00')
    expect(formatPrice('0')).toBe('Grátis')
    expect(formatPrice('0.00002')).toBe('$0.00002')
  })

  it('handles invalid dates and absent credit data', () => {
    expect(formatDate('not-a-date')).toBe('—')
    expect(formatCredits(null)).toBeNull()
  })
})
