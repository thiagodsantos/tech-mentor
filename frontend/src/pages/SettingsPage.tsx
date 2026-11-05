import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, Check, CircleAlert, Clock3, KeyRound, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import type { AppSettings, CreditsResponse, ModelInfo, ModelsResponse } from '../types'
import { api, apiErrorMessage } from '../lib/api'
import { formatCredits, formatDate } from '../lib/format'
import { ModelSelect } from '../components/molecules/ModelSelect'
import { StatusPill } from '../components/atoms/StatusPill'

export function SettingsPage({
  settings,
  settingsLoading,
  settingsError,
  onSaveSettings,
  modelsResponse,
  modelsLoading,
  modelsError,
  onRefreshModels,
  credits,
  creditsLoading,
  onRefreshCredits,
  onCredentialChanged,
}: {
  settings: AppSettings | null
  settingsLoading: boolean
  settingsError: string | null
  onSaveSettings: (update: Pick<AppSettings, 'default_model' | 'credits_poll_interval_seconds'>) => Promise<void>
  modelsResponse: ModelsResponse | null
  modelsLoading: boolean
  modelsError: string | null
  onRefreshModels: () => Promise<void>
  credits: CreditsResponse | null
  creditsLoading: boolean
  onRefreshCredits: () => Promise<void>
  onCredentialChanged: (configured: boolean) => void
}) {
  const [draftModel, setDraftModel] = useState('')
  const [intervalMinutes, setIntervalMinutes] = useState('5')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')
  const [settingsFormError, setSettingsFormError] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keyMessage, setKeyMessage] = useState('')
  const [keyError, setKeyError] = useState('')
  const [removingKey, setRemovingKey] = useState(false)

  useEffect(() => {
    if (!settings) return
    setDraftModel(settings.default_model ?? '')
    setIntervalMinutes(String(Math.max(0.5, settings.credits_poll_interval_seconds / 60)))
  }, [settings])

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const minutes = Number(intervalMinutes)
    if (!Number.isFinite(minutes) || minutes < 0.5 || minutes > 1440) {
      setSettingsFormError('Escolha um intervalo entre 30 segundos e 24 horas.')
      return
    }
    setSavingSettings(true)
    setSettingsMessage('')
    setSettingsFormError('')
    try {
      await onSaveSettings({ default_model: draftModel || null, credits_poll_interval_seconds: Math.round(minutes * 60) })
      setSettingsMessage('Preferências salvas.')
    } catch (cause) {
      setSettingsFormError(apiErrorMessage(cause, 'Não foi possível salvar as preferências.'))
    } finally {
      setSavingSettings(false)
    }
  }

  async function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!apiKey.trim()) return
    setSavingKey(true)
    setKeyError('')
    setKeyMessage('')
    try {
      const response = await api.saveOpenRouterKey(apiKey.trim())
      onCredentialChanged(response.configured)
      setApiKey('')
      setKeyMessage('Chave validada e salva com segurança no backend.')
      void onRefreshCredits()
    } catch (cause) {
      setKeyError(apiErrorMessage(cause, 'Não foi possível validar a chave. Confira o valor e tente novamente.'))
    } finally {
      setSavingKey(false)
    }
  }

  async function removeKey() {
    setRemovingKey(true)
    setKeyError('')
    setKeyMessage('')
    try {
      const response = await api.deleteOpenRouterKey()
      onCredentialChanged(response.configured)
      setKeyMessage(response.configured ? 'A chave definida no ambiente continua ativa.' : 'Chave removida do backend.')
      setApiKey('')
      void onRefreshCredits()
    } catch (cause) {
      setKeyError(apiErrorMessage(cause, 'Não foi possível remover a chave.'))
    } finally {
      setRemovingKey(false)
    }
  }

  const models: ModelInfo[] = modelsResponse?.data ?? []
  const amount = formatCredits(credits?.credits)
  const intervalLabel = `${intervalMinutes || '—'} min`

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <section><StatusPill tone="blue"><ShieldCheck size={12} /> Privacidade primeiro</StatusPill><h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">Seu espaço, do seu jeito.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Configure o modelo e a conexão. Sua chave nunca é devolvida pela API nem armazenada neste navegador.</p></section>

      {settingsError && <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-sm text-amber-100"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{settingsError}</div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.72fr)]">
        <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <div className="flex items-start gap-3 border-b border-line pb-5"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint/10 text-mint"><KeyRound size={18} /></span><div><h3 className="font-semibold text-white">Chave do OpenRouter</h3><p className="mt-1 text-xs leading-5 text-slate-500">A chave é validada no servidor antes de ser armazenada.</p></div></div>
          <div className="my-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas/60 px-4 py-3">
            <div className="flex items-center gap-2.5"><span className={`h-2 w-2 rounded-full ${settings?.openrouter_key_configured ? 'bg-mint' : 'bg-slate-600'}`} /><span className="text-sm text-slate-300">{settingsLoading ? 'Verificando credencial…' : settings?.openrouter_key_configured ? 'Credencial configurada' : 'Nenhuma credencial configurada'}</span></div>
            <StatusPill tone={settings?.openrouter_key_configured ? 'green' : 'amber'}>{settings?.openrouter_key_configured ? 'protegida' : 'necessária'}</StatusPill>
          </div>
          <form onSubmit={saveKey} className="space-y-3">
            <label htmlFor="openrouter-key" className="field-label">{settings?.openrouter_key_configured ? 'Substituir chave' : 'Sua API key'}</label>
            <div className="relative"><LockKeyhole size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" /><input id="openrouter-key" type="password" autoComplete="new-password" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-or-v1-••••••••••••••••" className="field-input pl-10 font-mono" /></div>
            <p className="text-xs leading-5 text-slate-500">Não salvamos a chave no navegador. O campo é limpo após o envio; o backend não devolve o segredo.</p>
            {keyError && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200">{keyError}</p>}
            {keyMessage && <p role="status" className="flex items-center gap-2 rounded-lg border border-mint/20 bg-mint/[0.06] p-3 text-sm text-mint"><Check size={15} />{keyMessage}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" disabled={!apiKey.trim() || savingKey} className="primary-button">{savingKey ? <><LoaderCircle size={15} className="animate-spin" /> Validando…</> : <><ShieldCheck size={15} /> Validar e salvar</>}</button>
              {settings?.openrouter_key_configured && <button type="button" onClick={() => void removeKey()} disabled={removingKey} className="secondary-button border-rose-400/15 text-rose-300 hover:border-rose-400/30 hover:bg-rose-400/[0.05]">{removingKey ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />} Remover</button>}
            </div>
          </form>
          <div className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-[11px] leading-5 text-slate-600"><LockKeyhole size={13} className="mt-0.5 shrink-0" />A chave é enviada apenas para <code className="text-slate-400">/api/settings/openrouter-key</code>. Use HTTPS se esta aplicação for publicada.</div>
        </section>

        <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <div className="flex items-start gap-3 border-b border-line pb-5"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300"><Clock3 size={18} /></span><div><h3 className="font-semibold text-white">Saldo e créditos</h3><p className="mt-1 text-xs leading-5 text-slate-500">Último estado informado pelo backend.</p></div></div>
          <div className="my-5 rounded-xl border border-line bg-canvas/60 p-4">
            <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">Saldo disponível</span><span className={`h-2 w-2 rounded-full ${credits?.status === 'ok' ? 'bg-mint' : credits?.status === 'error' ? 'bg-amber-300' : 'bg-slate-600'}`} /></div>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{creditsLoading ? '…' : amount ?? 'Sem dados'}</p>
            <p className="mt-2 text-xs text-slate-500">{credits?.checked_at ? `Atualizado ${formatDate(credits.checked_at)}` : credits?.status === 'pending' ? 'Aguardando a primeira consulta.' : 'Nenhuma consulta disponível.'}</p>
          </div>
          {credits?.status === 'error' && <p role="status" className="mb-4 flex items-start gap-2 text-xs leading-5 text-amber-300"><CircleAlert size={14} className="mt-0.5 shrink-0" />{credits.error || 'Não foi possível consultar os créditos. Isso não impede a geração de aulas.'}</p>}
          <button type="button" onClick={() => void onRefreshCredits()} disabled={creditsLoading} className="secondary-button w-full"><RefreshCw size={14} className={creditsLoading ? 'animate-spin' : ''} /> Atualizar indicador</button>
          <p className="mt-4 text-[11px] leading-5 text-slate-600">Falhas ao consultar o saldo não bloqueiam o tutor. A consulta respeita o intervalo configurado abaixo.</p>
        </section>
      </div>

      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300"><Clock3 size={18} /></span><div><h3 className="font-semibold text-white">Preferências de estudo</h3><p className="mt-1 text-xs text-slate-500">Modelo padrão e frequência de atualização de créditos.</p></div></div><button type="button" onClick={() => void onRefreshModels()} disabled={modelsLoading} className="secondary-button !px-3 !py-2 text-xs"><RefreshCw size={13} className={modelsLoading ? 'animate-spin' : ''} /> Atualizar catálogo</button></div>
        <form onSubmit={saveSettings} className="grid gap-6 pt-5 md:grid-cols-2">
          <div><label className="field-label" htmlFor="model-select">Modelo padrão</label><ModelSelect models={models} value={draftModel} onChange={setDraftModel} loading={modelsLoading} error={modelsError} stale={Boolean(modelsResponse?.stale)} />{modelsResponse?.fetched_at && <p className="mt-2 text-[11px] text-slate-600">Catálogo consultado em {formatDate(modelsResponse.fetched_at)}.</p>}</div>
          <div>
            <label className="field-label" htmlFor="credits-interval">Verificar créditos a cada</label>
            <div className="relative"><input id="credits-interval" type="number" min="0.5" max="1440" step="0.5" value={intervalMinutes} onChange={(event) => setIntervalMinutes(event.target.value)} className="field-input pr-16" /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500">minutos</span></div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Mínimo de 30 segundos; pode levar até um intervalo para refletir a próxima consulta.</p>
            <div className="mt-3 flex gap-2">{[5, 15, 60].map((value) => <button key={value} type="button" onClick={() => setIntervalMinutes(String(value))} aria-pressed={intervalLabel === `${value} min`} className={`rounded-lg border px-3 py-1.5 text-xs ${intervalLabel === `${value} min` ? 'border-mint/25 bg-mint/[0.07] text-mint' : 'border-line text-slate-400 hover:text-slate-200'}`}>{value < 60 ? `${value} min` : '1 hora'}</button>)}</div>
          </div>
          {settingsFormError && <p role="alert" className="md:col-span-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200">{settingsFormError}</p>}
          {settingsMessage && <p role="status" className="md:col-span-2 flex items-center gap-2 text-sm text-mint"><Check size={15} />{settingsMessage}</p>}
          <div className="flex flex-wrap items-center gap-3 md:col-span-2"><button type="submit" disabled={savingSettings || settingsLoading} className="primary-button">{savingSettings ? <><LoaderCircle size={15} className="animate-spin" /> Salvando…</> : 'Salvar preferências'}</button>{settingsLoading && <span className="text-xs text-slate-500">Carregando configurações…</span>}</div>
        </form>
      </section>

    </div>
  )
}
