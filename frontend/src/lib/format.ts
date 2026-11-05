import type { ModelInfo } from '../types'

const modelNameCollator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

export function normalizeModelSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')
}

export function sortModels(models: ModelInfo[]): ModelInfo[] {
  return [...models].sort((left, right) =>
    modelNameCollator.compare(left.name, right.name) || modelNameCollator.compare(left.id, right.id),
  )
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function formatCredits(credits: Record<string, unknown> | null | undefined): string | null {
  if (!credits) return null
  const remaining = credits.remaining_credits ?? credits.remaining ?? credits.credits
  const total = credits.total_credits
  const used = credits.total_usage
  const available = remaining ?? (total !== undefined && used !== undefined ? Number(total) - Number(used) : undefined)
  if (typeof available !== 'number' && typeof available !== 'string') return null
  const number = Number(available)
  return Number.isFinite(number)
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(number)
    : null
}

export function formatPrice(value: string | undefined): string | null {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return value
  return parsed === 0 ? 'Grátis' : `$${parsed.toLocaleString('en-US', { maximumFractionDigits: 6 })}`
}
