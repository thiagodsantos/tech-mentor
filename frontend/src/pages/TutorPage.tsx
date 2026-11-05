import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CircleAlert, Download, LoaderCircle, LockKeyhole, Sparkles, X } from 'lucide-react'
import { Dialog } from '@base-ui/react/dialog'
import type { AppSettings, Lesson, ModelInfo } from '../types'
import { ApiError, api, apiErrorMessage } from '../lib/api'
import { formatPrice, sortModels } from '../lib/format'
import { SearchableModelCombobox } from '../components/molecules/SearchableModelCombobox'
import { MarkdownPanel } from '../components/organisms/MarkdownPanel'

const levels = ['Iniciante', 'Intermediário', 'Avançado']

function downloadRoadmap(content: string, topic: string) {
  const file = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const downloadUrl = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  const filename = topic
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'aprendizado'
  anchor.href = downloadUrl
  anchor.download = `roadmap-${filename}.md`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
}
const lessonPanelStyle: CSSProperties = {
  height: 'calc(100svh - 11rem)',
  maxHeight: 'calc(100svh - 11rem)',
}

export function TutorPage({
  settings,
  settingsLoading,
  settingsError,
  models,
  modelsLoading,
  modelsError,
  onOpenSettings,
  onSettingsRefresh,
  lessonFromHistory,
}: {
  settings: AppSettings | null
  settingsLoading: boolean
  settingsError: string | null
  models: ModelInfo[]
  modelsLoading: boolean
  modelsError: string | null
  onOpenSettings: () => void
  onSettingsRefresh: () => Promise<void>
  lessonFromHistory: Lesson | null
}) {
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState('Iniciante')
  const [goal, setGoal] = useState('Entender os conceitos e saber quando usar')
  const [model, setModel] = useState('')
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [missingCredential, setMissingCredential] = useState(false)
  const [roadmapOpen, setRoadmapOpen] = useState(false)
  const [roadmapModel, setRoadmapModel] = useState('')
  const [roadmapGenerating, setRoadmapGenerating] = useState(false)
  const [roadmapWaiting, setRoadmapWaiting] = useState(false)
  const [roadmapGenerationId, setRoadmapGenerationId] = useState<string | null>(null)
  const [roadmapTopic, setRoadmapTopic] = useState('')
  const [roadmapError, setRoadmapError] = useState('')

  useEffect(() => {
    if (lessonFromHistory) setLesson(lessonFromHistory)
  }, [lessonFromHistory])

  useEffect(() => {
    const generationId = roadmapGenerationId
    if (!generationId) return
    let active = true
    let timer: number | undefined

    async function pollRoadmap(id: string) {
      try {
        const generation = await api.getRoadmap(id)
        if (!active) return
        if (generation.status === 'completed' && generation.content) {
          downloadRoadmap(generation.content, roadmapTopic)
          setRoadmapError('')
          setRoadmapWaiting(false)
          setRoadmapGenerationId(null)
          setRoadmapOpen(false)
          return
        }
        if (generation.status === 'failed') {
          setRoadmapError(generation.error ?? 'O OpenRouter não conseguiu gerar o roadmap. Tente novamente.')
          setRoadmapWaiting(false)
          setRoadmapGenerationId(null)
          return
        }
      } catch (cause) {
        if (active) setRoadmapError(apiErrorMessage(cause, 'Não foi possível verificar o estado do roadmap.'))
      }
      if (active) timer = window.setTimeout(() => void pollRoadmap(id), 30_000)
    }

    void pollRoadmap(generationId)
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [roadmapGenerationId, roadmapTopic])

  const sortedModels = sortModels(models)
  const selectedModel = model || settings?.default_model || ''
  const selectedModelInfo = sortedModels.find((item) => item.id === selectedModel)
  const modelUnavailable = Boolean(selectedModel && models.length && !selectedModelInfo)
  const credentialMissing = settings && !settings.openrouter_key_configured
  const preferredRoadmapModel = settings?.default_model && models.some((item) => item.id === settings.default_model)
    ? settings.default_model
    : lesson?.model ?? ''
  const selectedRoadmapModel = roadmapModel || preferredRoadmapModel
  const selectedRoadmapModelInfo = sortedModels.find((item) => item.id === selectedRoadmapModel)
  const canGenerate = Boolean(
    topic.trim() && goal.trim() && selectedModel && !modelUnavailable &&
    settings?.openrouter_key_configured && !generating && !settingsLoading && !modelsLoading,
  )

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canGenerate) return
    setGenerating(true)
    setError('')
    setMissingCredential(false)
    try {
      const created = await api.createLesson({
        topic: topic.trim(),
        level: level.toLowerCase(),
        goal: goal.trim(),
        model: selectedModel,
      })
      setLesson(created)
      void onSettingsRefresh()
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setMissingCredential(true)
        setError('Adicione sua chave do OpenRouter para começar a gerar aulas.')
      } else {
        setError(apiErrorMessage(cause, 'Não foi possível gerar a aula. Tente novamente.'))
      }
    } finally {
      setGenerating(false)
    }
  }

  function startAnotherLesson() {
    setLesson(null)
    setError('')
    setMissingCredential(false)
    setRoadmapOpen(false)
    setRoadmapGenerationId(null)
    setRoadmapWaiting(false)
    setRoadmapError('')
  }

  async function exportRoadmap() {
    if (!lesson || !selectedRoadmapModelInfo || !settings?.openrouter_key_configured) return
    setRoadmapGenerating(true)
    setRoadmapError('')
    try {
      const generation = await api.createRoadmap(lesson.id, selectedRoadmapModel)
      setRoadmapTopic(lesson.topic)
      setRoadmapGenerationId(generation.id)
      setRoadmapWaiting(true)
    } catch (cause) {
      setRoadmapError(apiErrorMessage(cause, 'Não foi possível gerar o roadmap. Tente novamente.'))
    } finally {
      setRoadmapGenerating(false)
    }
  }

  return (
    <div className="space-y-5">
      {settingsError && <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100"><CircleAlert size={17} className="mt-0.5 shrink-0" /><div><p className="font-medium">Não foi possível carregar as configurações.</p><p className="mt-1 text-amber-100/70">{settingsError}</p></div></div>}

      {lesson ? (
        <section
          style={lessonPanelStyle}
          className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel"
          aria-label="Aula gerada"
        >
          <header className="flex shrink-0 justify-end gap-2 border-b border-line px-4 py-2.5 sm:px-5">
            <div className="order-1 shrink-0">
            <Dialog.Root
              open={roadmapOpen}
              onOpenChange={(open) => {
                setRoadmapOpen(open)
                if (open) setRoadmapError('')
              }}
            >
              <button
                type="button"
                onClick={() => setRoadmapOpen(true)}
                className="secondary-button !px-3 !py-2 text-xs"
              >
                <Download size={14} /> Exportar roadmap
              </button>
              <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm" />
                <Dialog.Popup className="fixed left-1/2 top-1/2 z-[101] max-h-[85svh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl shadow-black/50 outline-none sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-white">Exportar roadmap</Dialog.Title>
                      <Dialog.Description className="mt-1 text-sm leading-6 text-slate-400">
                        Vamos organizar a aula e todos os complementos em uma trilha progressiva e baixar em Markdown.
                      </Dialog.Description>
                    </div>
                    <Dialog.Close className="icon-button shrink-0 text-slate-500 hover:text-white" aria-label="Fechar modal">
                      <X size={17} />
                    </Dialog.Close>
                  </div>

                  <div className="mt-5">
                    <label htmlFor="roadmap-model" className="field-label">Modelo para gerar o roadmap</label>
                    <SearchableModelCombobox
                      id="roadmap-model"
                      ariaLabel="Modelo para gerar o roadmap"
                      value={selectedRoadmapModel}
                      models={models}
                      onChange={setRoadmapModel}
                      loading={modelsLoading}
                      placeholder={modelsLoading ? 'Carregando modelos…' : models.length ? 'Buscar por nome ou ID…' : 'Catálogo indisponível'}
                    />
                    {modelsError && <p className="mt-2 text-xs text-amber-300">{modelsError}</p>}
                    {selectedRoadmapModel && !selectedRoadmapModelInfo && models.length > 0 && <p className="mt-2 text-xs text-amber-300">Este modelo não está no catálogo atual. Selecione outro.</p>}
                  </div>

                  {selectedRoadmapModelInfo && (
                    <div className="mt-4 rounded-xl border border-line bg-canvas/70 p-4">
                      <p className="truncate text-sm font-medium text-slate-200">{selectedRoadmapModelInfo.name}</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{selectedRoadmapModelInfo.id}</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-400">
                        <span>{selectedRoadmapModelInfo.context_length ? `${selectedRoadmapModelInfo.context_length.toLocaleString('pt-BR')} tokens de contexto` : 'Janela de contexto não informada'}</span>
                        <span>Entrada por token: {formatPrice(selectedRoadmapModelInfo.pricing.prompt) ?? 'não informada'}</span>
                        <span>Saída por token: {formatPrice(selectedRoadmapModelInfo.pricing.completion) ?? 'não informada'}</span>
                      </div>
                    </div>
                  )}

                  {!settings?.openrouter_key_configured && !settingsLoading && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3">
                      <p className="text-xs leading-5 text-amber-100">Configure sua chave do OpenRouter para gerar o arquivo.</p>
                      <button type="button" onClick={onOpenSettings} className="text-xs font-semibold text-amber-200 underline underline-offset-4">Configurar chave</button>
                    </div>
                  )}
                  {settingsLoading && <p className="mt-3 text-xs text-slate-500">Verificando configuração…</p>}
                  {roadmapWaiting && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-300"><LoaderCircle size={14} className="animate-spin text-mint" /> O OpenRouter está processando o roadmap. Esta janela pode permanecer aberta enquanto aguardamos.</p>}
                  {roadmapError && <p role="alert" className="mt-4 text-sm text-rose-300">{roadmapError}</p>}

                  <footer className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
                    <Dialog.Close className="secondary-button !px-3 !py-2 text-xs">Cancelar</Dialog.Close>
                    <button
                      type="button"
                      onClick={() => void exportRoadmap()}
                      disabled={!selectedRoadmapModelInfo || !settings?.openrouter_key_configured || settingsLoading || roadmapGenerating || roadmapWaiting}
                      className="primary-button !px-3 !py-2 text-xs"
                    >
                      {roadmapGenerating ? <><LoaderCircle size={14} className="animate-spin" /> Enviando ao OpenRouter…</> : roadmapWaiting ? <><LoaderCircle size={14} className="animate-spin" /> Aguardando OpenRouter…</> : <><Download size={14} /> Gerar e baixar</>}
                    </button>
                  </footer>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
            </div>
            <button type="button" onClick={startAnotherLesson} className="order-2 shrink-0 secondary-button !px-3 !py-2 text-xs">
              <ArrowLeft size={14} /> Nova aula
            </button>
          </header>
          <div key={lesson.id} className="min-h-0 flex-1 overflow-y-auto">
            <MarkdownPanel lesson={lesson} onLessonUpdated={setLesson} />
          </div>
        </section>
      ) : generating ? (
        <section style={lessonPanelStyle} className="flex flex-col items-center justify-center rounded-2xl border border-line bg-panel px-6 text-center" aria-live="polite">
          <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-mint/20 bg-mint/[0.06] text-mint"><Sparkles size={22} /><span className="absolute inset-0 animate-ping rounded-2xl border border-mint/20" /></span>
          <h2 className="mt-4 text-base font-semibold text-white">Organizando suas ideias</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Seu tutor está preparando uma explicação com exemplos e diagramas.</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="animate-spin text-mint" size={14} /> Gerando conteúdo</div>
        </section>
      ) : (
        <>
          {credentialMissing && <div className="flex flex-col gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><LockKeyhole size={17} className="mt-0.5 shrink-0 text-amber-300" /><div><p className="text-sm font-medium text-amber-100">Sua chave ainda não está configurada</p><p className="mt-1 text-xs text-amber-100/70">A chave é enviada somente ao backend e não fica salva no navegador.</p></div></div><button type="button" onClick={onOpenSettings} className="self-start rounded-lg bg-amber-300 px-3 py-2 text-xs font-semibold text-[#171208] hover:bg-amber-200 sm:self-center">Configurar chave</button></div>}

          <form onSubmit={generate} className="space-y-5">
            <div className="grid gap-x-6 gap-y-4 md:grid-cols-[minmax(0,1fr)_180px_minmax(0,1.2fr)]">
              <div className="min-w-0">
                <label htmlFor="topic" className="field-label">O que você quer aprender? <span className="text-mint">*</span></label>
                <input id="topic" required maxLength={200} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Ex.: Como funciona o React?" className="field-input" />
              </div>
              <div className="min-w-0">
                <label htmlFor="level" className="field-label">Seu nível</label>
                <select id="level" value={level} onChange={(event) => setLevel(event.target.value)} className="field-input">
                  {levels.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor="lesson-model" className="field-label">Modelo</label>
                <SearchableModelCombobox
                  id="lesson-model"
                  value={selectedModel}
                  models={models}
                  onChange={setModel}
                  loading={modelsLoading}
                  placeholder={modelsLoading ? 'Carregando modelos…' : models.length ? 'Buscar por nome ou ID…' : 'Catálogo indisponível'}
                />
                {modelUnavailable && <p className="mt-1 text-xs text-amber-300">Modelo padrão indisponível; escolha outro.</p>}
                {!selectedModel && !modelsLoading && <p className="mt-1 text-xs text-slate-500">Defina um modelo nas configurações.</p>}
                {modelsError && <p className="mt-1 text-xs text-amber-300">{modelsError}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="goal" className="field-label">Seu objetivo <span className="text-mint">*</span></label>
              <textarea id="goal" required maxLength={500} rows={4} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="O que gostaria de conseguir fazer?" className="field-input min-h-[120px] resize-y" />
              <p className="mt-1 text-right text-[10px] text-slate-600">{goal.length}/500</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-5">
                {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
                {!settings?.openrouter_key_configured && !settingsLoading && !credentialMissing && <p className="text-xs text-slate-500">Configure sua chave do OpenRouter para gerar a aula.</p>}
                {settingsLoading && <p className="text-xs text-slate-500">Verificando configuração…</p>}
              </div>
              <button type="submit" disabled={!canGenerate} className="primary-button shrink-0 sm:min-w-[170px]">
                {generating ? <><LoaderCircle size={15} className="animate-spin" /> Preparando…</> : <>Gerar aula <ArrowRight size={15} /></>}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
