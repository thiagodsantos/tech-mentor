import { Sparkles } from 'lucide-react'
import type { ModelInfo } from '../../types'
import { formatPrice, sortModels } from '../../lib/format'
import { SearchableModelCombobox } from './SearchableModelCombobox'

export function ModelSelect({
  models,
  value,
  onChange,
  loading,
  error,
  stale,
}: {
  models: ModelInfo[]
  value: string
  onChange: (value: string) => void
  loading: boolean
  error: string | null
  stale: boolean
}) {
  const sortedModels = sortModels(models)
  const selectedIsMissing = Boolean(value && models.length && !sortedModels.some((model) => model.id === value))

  return (
    <div className="space-y-3">
      <SearchableModelCombobox
        id="model-select"
        value={value}
        models={models}
        onChange={onChange}
        loading={loading}
        placeholder={loading ? 'Carregando modelos…' : models.length ? 'Buscar por nome ou ID…' : 'Catálogo indisponível'}
      />
      {selectedIsMissing && <p className="text-xs text-amber-300">O modelo padrão não está mais no catálogo. Busque e selecione outro.</p>}
      {value && sortedModels.some((model) => model.id === value) && (() => {
        const selected = sortedModels.find((model) => model.id === value)!
        const inputPrice = formatPrice(selected.pricing.prompt)
        const outputPrice = formatPrice(selected.pricing.completion)
        return (
          <div className="rounded-xl border border-line bg-canvas/70 p-3.5">
            <div className="flex items-start gap-2.5">
              <Sparkles size={15} className="mt-0.5 shrink-0 text-mint" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-200">{selected.name}</p>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{selected.id}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                  {selected.context_length && <span>{selected.context_length.toLocaleString('pt-BR')} tokens de contexto</span>}
                  {inputPrice && <span>Entrada / token: {inputPrice}</span>}
                  {outputPrice && <span>Saída / token: {outputPrice}</span>}
                </div>
                {(selected.capabilities.length > 0 || selected.input_modalities.length > 0) && <p className="mt-2 text-xs text-slate-500">{[...selected.capabilities, ...selected.input_modalities].slice(0, 5).join(' · ')}</p>}
              </div>
            </div>
          </div>
        )
      })()}
      {stale && <p className="text-xs text-amber-300">Catálogo em cache; pode não refletir a disponibilidade atual.</p>}
      {error && <p role="status" className="text-xs text-amber-300">{error}</p>}
      {!loading && !error && models.length === 0 && <p className="text-xs text-slate-500">Nenhum modelo foi retornado pela API. Tente atualizar mais tarde.</p>}
    </div>
  )
}
