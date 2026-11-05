import { ChevronDown, Search } from 'lucide-react'
import { Combobox } from '@base-ui/react/combobox'
import type { ModelInfo } from '../../types'
import { normalizeModelSearch, sortModels } from '../../lib/format'

type Props = {
  id: string
  value: string
  models: ModelInfo[]
  onChange: (value: string) => void
  loading: boolean
  placeholder: string
}

export function SearchableModelCombobox({ id, value, models, onChange, loading, placeholder }: Props) {
  const sortedModels = sortModels(models)
  const selectedModel = sortedModels.find((model) => model.id === value) ?? null

  return (
    <Combobox.Root<ModelInfo>
      items={sortedModels}
      value={selectedModel}
      onValueChange={(selected) => onChange(selected?.id ?? '')}
      itemToStringLabel={(model) => model.name}
      itemToStringValue={(model) => model.id}
      isItemEqualToValue={(item, selected) => item.id === selected.id}
      filter={(model, query) => normalizeModelSearch(`${model.name} ${model.id}`).includes(normalizeModelSearch(query))}
      autoHighlight
      disabled={loading || models.length === 0}
    >
      <div className="relative">
        <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-500" />
        <Combobox.Input
          id={id}
          aria-label="Buscar e selecionar modelo"
          placeholder={placeholder}
          className="field-input pl-10 pr-10"
        />
        <Combobox.Trigger
          aria-label="Abrir lista de modelos"
          className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.05] hover:text-slate-200 disabled:opacity-40"
        >
          <ChevronDown size={15} />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50 outline-none">
          <Combobox.Popup className="w-[var(--anchor-width)] overflow-hidden rounded-xl border border-line bg-[#0d1219] shadow-2xl shadow-black/40">
            <Combobox.List className="max-h-64 overflow-y-auto p-1">
              {(model: ModelInfo) => (
                <Combobox.Item
                  key={model.id}
                  value={model}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 outline-none data-[highlighted]:bg-white/[0.06] data-[selected]:text-mint"
                >
                  <span className="truncate">{model.name}</span>
                  <span className="shrink-0 truncate font-mono text-[10px] text-slate-500">{model.id}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
            <Combobox.Empty className="px-3 py-5 text-center text-xs text-slate-500">
              Nenhum modelo corresponde à busca.
            </Combobox.Empty>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
