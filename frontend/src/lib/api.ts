import type { AppSettings, CreditsResponse, Lesson, LessonComplement, LessonFeedback, ModelsResponse, Note } from '../types'

const API_BASE = '/api'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError('Não foi possível conectar à API. Verifique se o backend está em execução.', 0)
  }

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(readApiError(payload, response.status), response.status)
  }
  return payload as T
}

const apiMessageTranslations: Array<[RegExp, string | ((match: RegExpMatchArray) => string)]> = [
  [/^OpenRouter rejected the API key\.$/i, 'O OpenRouter recusou a chave informada. Confira a chave e tente novamente.'],
  [/^OpenRouter rate limit reached\.$/i, 'O limite de consultas do OpenRouter foi atingido. Aguarde um pouco e tente novamente.'],
  [/^OpenRouter request failed \(HTTP (\d+)\)\.$/i, (match) => `O OpenRouter retornou um erro HTTP ${match[1]}. Tente novamente mais tarde.`],
  [/^Could not reach OpenRouter or decode its response\.$/i, 'Não foi possível acessar o OpenRouter. Verifique a conexão e tente novamente.'],
  [/^The model catalogue is temporarily unavailable from OpenRouter\.$/i, 'O catálogo de modelos está temporariamente indisponível.'],
  [/^The model catalogue could not be checked\.$/i, 'Não foi possível validar o catálogo de modelos.'],
  [/^Configure an OpenRouter API key before generating a lesson\.$/i, 'Configure uma chave do OpenRouter antes de gerar uma aula.'],
  [/^Configure an OpenRouter API key before generating a complement\.$/i, 'Configure uma chave do OpenRouter antes de pedir um complemento.'],
  [/^Complement generation failed\. Please try again\.$/i, 'Não foi possível gerar o complemento. Tente novamente.'],
  [/^The generated complement is empty\.$/i, 'O complemento veio vazio. Tente ajustar o pedido.'],
  [/^Only pending complements can be accepted\.$/i, 'Este complemento não está mais aguardando confirmação.'],
  [/^Only pending complements can be rejected\.$/i, 'Este complemento não está mais aguardando confirmação.'],
  [/^The lesson provider could not generate a complement\.$/i, 'O provedor não conseguiu gerar o complemento. Tente novamente.'],
  [/^The lesson provider returned an empty complement\.$/i, 'O provedor retornou um complemento vazio. Tente novamente.'],
  [/^Select a model in settings or in the lesson request\.$/i, 'Selecione um modelo nas configurações ou no formulário da aula.'],
  [/^The selected model is not currently available in OpenRouter\.$/i, 'O modelo escolhido não está disponível no catálogo atual. Selecione outro nas configurações.'],
  [/^Lesson generation failed\. Please try again\.$/i, 'Não foi possível gerar a aula. Tente novamente.'],
  [/^Backend secret encryption is not configured\.$/i, 'A criptografia de credenciais não está configurada no backend.'],
  [/^Field required$/i, 'Este campo é obrigatório.'],
]

export function localizeApiMessage(message: string): string {
  for (const [pattern, translation] of apiMessageTranslations) {
    const match = message.match(pattern)
    if (match) return typeof translation === 'string' ? translation : translation(match)
  }
  return message
}

function readApiError(payload: unknown, status: number): string {
  if (typeof payload === 'object' && payload !== null && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail
    if (typeof detail === 'string') return localizeApiMessage(detail)
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => (typeof item === 'object' && item && 'msg' in item ? String(item.msg) : ''))
        .filter(Boolean)
      if (messages.length) return localizeApiMessage(messages.join(' '))
    }
  }
  if (status === 404 || status === 405) return 'Este recurso ainda não está disponível no backend.'
  if (status === 0) return 'Não foi possível conectar à API.'
  return `A solicitação falhou (HTTP ${status}). Tente novamente.`
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  if (error.status === 0) return 'Não foi possível conectar à API. Verifique se o backend está em execução.'
  if (error.status === 404 || error.status === 405) return 'Este recurso ainda não está disponível no backend.'
  return localizeApiMessage(error.message) || fallback
}

export const api = {
  getSettings: () => request<AppSettings>('/settings'),
  updateSettings: (settings: Partial<Pick<AppSettings, 'default_model' | 'credits_poll_interval_seconds' | 'study_preferences'>>) =>
    request<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  saveOpenRouterKey: (api_key: string) =>
    request<{ configured: boolean; message: string }>('/settings/openrouter-key', {
      method: 'PUT',
      body: JSON.stringify({ api_key }),
    }),
  deleteOpenRouterKey: () =>
    request<{ configured: boolean; message: string }>('/settings/openrouter-key', { method: 'DELETE' }),
  getModels: async () => {
    const result = await request<ModelsResponse>('/models')
    return { ...result, error: result.error ? localizeApiMessage(result.error) : null }
  },
  getCredits: async () => {
    const result = await request<CreditsResponse>('/openrouter/credits')
    return { ...result, error: result.error ? localizeApiMessage(result.error) : null }
  },
  createLesson: (input: { topic: string; level: string; goal: string; model?: string }) =>
    request<Lesson>('/lessons', { method: 'POST', body: JSON.stringify(input) }),
  getLessons: () => request<Lesson[]>('/lessons'),
  getLesson: (id: string) => request<Lesson>(`/lessons/${encodeURIComponent(id)}`),
  getComplements: (lessonId: string) => request<LessonComplement[]>(`/lessons/${encodeURIComponent(lessonId)}/complements`),
  createComplement: (lessonId: string, prompt: string) =>
    request<LessonComplement>(`/lessons/${encodeURIComponent(lessonId)}/complements`, {
      method: 'POST', body: JSON.stringify({ prompt }),
    }),
  acceptComplement: (lessonId: string, complementId: string) =>
    request<Lesson>(`/lessons/${encodeURIComponent(lessonId)}/complements/${encodeURIComponent(complementId)}/accept`, { method: 'POST' }),
  rejectComplement: (lessonId: string, complementId: string) =>
    request<LessonComplement>(`/lessons/${encodeURIComponent(lessonId)}/complements/${encodeURIComponent(complementId)}/reject`, { method: 'POST' }),
  getFeedback: (lessonId: string) => request<LessonFeedback | null>(`/lessons/${encodeURIComponent(lessonId)}/feedback`),
  createFeedback: (lessonId: string, input: { rating: number; comment?: string }) =>
    request<LessonFeedback>(`/lessons/${encodeURIComponent(lessonId)}/feedback`, {
      method: 'POST', body: JSON.stringify(input),
    }),
  getNotes: () => request<Note[]>('/notes'),
  createNote: (input: { topic: string; content: string; lesson_id: string; include_in_rag: boolean }) =>
    request<Note>('/notes', { method: 'POST', body: JSON.stringify(input) }),
  deleteNote: (id: string) => request<void>(`/notes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
