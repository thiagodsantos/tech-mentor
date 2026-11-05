export type AppView = 'tutor' | 'history' | 'settings'

export interface Lesson {
  id: string
  topic: string
  level: string
  goal: string
  model: string
  content: string
  created_at: string
  sources: Array<Record<string, unknown>>
}

export interface AppSettings {
  default_model: string | null
  credits_poll_interval_seconds: number
  study_preferences: Record<string, unknown>
  openrouter_key_configured: boolean
  updated_at: string
}

export interface ModelInfo {
  id: string
  name: string
  context_length: number | null
  input_modalities: string[]
  output_modalities: string[]
  capabilities: string[]
  pricing: Record<string, string>
}

export interface ModelsResponse {
  data: ModelInfo[]
  fetched_at: string
  stale: boolean
  error: string | null
}

export interface LessonComplement {
  id: string
  lesson_id: string
  prompt: string
  content: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
}

export interface LessonFeedback {
  id: number
  lesson_id: string
  rating: number
  comment: string | null
  created_at: string
}

export interface Note {
  id: string
  topic: string
  content: string
  lesson_id: string | null
  include_in_rag: boolean
  created_at: string
}

export interface CreditsResponse {
  status: 'pending' | 'ok' | 'error' | string
  credits: Record<string, unknown> | null
  checked_at: string | null
  error: string | null
}
