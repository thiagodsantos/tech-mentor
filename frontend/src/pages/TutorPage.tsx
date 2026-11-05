import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CircleAlert, LoaderCircle, LockKeyhole, Sparkles } from 'lucide-react'
import type { AppSettings, Lesson, ModelInfo } from '../types'
import { ApiError, api, apiErrorMessage } from '../lib/api'
import { sortModels } from '../lib/format'
import { SearchableModelCombobox } from '../components/molecules/SearchableModelCombobox'
import { MarkdownPanel } from '../components/organisms/MarkdownPanel'

const levels = ['Iniciante', 'Intermediário', 'Avançado']
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

  useEffect(() => {
    if (lessonFromHistory) setLesson(lessonFromHistory)
  }, [lessonFromHistory])

  const sortedModels = sortModels(models)
  const selectedModel = model || settings?.default_model || ''
  const selectedModelInfo = sortedModels.find((item) => item.id === selectedModel)
  const modelUnavailable = Boolean(selectedModel && models.length && !selectedModelInfo)
  const credentialMissing = settings && !settings.openrouter_key_configured
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
          <header className="flex shrink-0 justify-end border-b border-line px-4 py-2.5 sm:px-5">
            <button type="button" onClick={startAnotherLesson} className="secondary-button !px-3 !py-2 text-xs">
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
